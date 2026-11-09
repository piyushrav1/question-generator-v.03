import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CodeRunner, ExecutionRequest, ExecutionResult } from './codeRunner.js'

export const MAX_OUTPUT_BYTES = 100 * 1024 // 100 KB safety cap

export function appendOutputChunk(
  current: string,
  chunk: Buffer | string,
  maxBytes = MAX_OUTPUT_BYTES,
): { output: string; truncated: boolean } {
  if (Buffer.byteLength(current, 'utf8') >= maxBytes) {
    return { output: current, truncated: true }
  }
  const next = current + chunk.toString()
  if (Buffer.byteLength(next, 'utf8') > maxBytes) {
    return {
      output: next.slice(0, maxBytes) + '\n[Output truncated: exceeded 100KB limit]',
      truncated: true,
    }
  }
  return { output: next, truncated: false }
}

export class DockerCodeRunner implements CodeRunner {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const workDir = join(tmpdir(), `testmeman-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(workDir, { recursive: true })

    try {
      const files = await this.writeSource(workDir, request.language, request.code)
      const dockerArgs = this.buildDockerArgs(workDir, files, request)
      const startedAt = Date.now()
      const result = await this.runDocker(dockerArgs, request.input, request.timeoutMs, workDir, request)

      return {
        ...result,
        runtimeMs: Date.now() - startedAt,
      }
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }

  private async writeSource(workDir: string, language: ExecutionRequest['language'], code: string) {
    const fileName = language === 'Python'
      ? 'main.py'
      : language === 'JavaScript'
        ? 'main.js'
        : language === 'Java'
          ? 'Main.java'
          : 'main.cpp'
    await writeFile(join(workDir, fileName), code, 'utf8')
    return fileName
  }

  private buildDockerArgs(
    workDir: string,
    fileName: string,
    request: ExecutionRequest,
  ): string[] {
    const common = [
      'run', '--rm', '-i',
      '--network', 'none',
      '--memory', '256m',
      '--cpus', '0.5',
      '--pids-limit', '64',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
      '-v', `${workDir}:/work:ro`,
    ]

    if (request.language === 'Python') {
      return [...common, 'python:3.12-alpine', 'python3', '/work/main.py']
    }
    if (request.language === 'JavaScript') {
      return [...common, 'node:20-alpine', 'node', '/work/main.js']
    }
    if (request.language === 'Java') {
      return [...common, 'eclipse-temurin:21-jdk-alpine', 'sh', '-c', 'javac -d /tmp /work/Main.java && java -cp /tmp Main']
    }
    return [...common, 'gcc:14.2.0', 'sh', '-c', 'g++ -std=c++17 -O2 -o /tmp/main /work/main.cpp && /tmp/main']
  }

  private runDocker(
    args: string[],
    stdin: string,
    timeoutMs: number,
    workDir: string,
    request: ExecutionRequest,
  ): Promise<Omit<ExecutionResult, 'runtimeMs'>> {
    return new Promise((resolve) => {
      const child = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false

      child.stdout.on('data', (chunk) => {
        const res = appendOutputChunk(stdout, chunk)
        stdout = res.output
        if (res.truncated) child.stdout?.destroy()
      })
      child.stderr.on('data', (chunk) => {
        const res = appendOutputChunk(stderr, chunk)
        stderr = res.output
        if (res.truncated) child.stderr?.destroy()
      })
      child.stdin.end(stdin)

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)

      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error.message.includes('ENOENT')) {
          this.runNative(workDir, request, stdin, timeoutMs).then(resolve)
          return
        }
        resolve({
          stdout: '',
          stderr: error.message.includes('ENOENT')
            ? 'Docker is not installed or is not available.'
            : error.message,
          timedOut: false,
          runtimeError: true,
        })
      })

      child.on('close', (exitCode) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const dockerError = this.isDockerUnavailableError(stderr)
        if (dockerError) {
          this.runNative(workDir, request, stdin, timeoutMs).then(resolve)
          return
        }
        resolve({
          stdout,
          stderr,
          timedOut,
          runtimeError: !timedOut && exitCode !== 0,
        })
      })
    })
  }

  private runNative(
    workDir: string,
    request: ExecutionRequest,
    stdin: string,
    timeoutMs: number,
  ): Promise<Omit<ExecutionResult, 'runtimeMs'>> {
    const javaHomeCandidates = [
      process.env.JAVA_HOME,
      process.env.JDK_HOME,
      ...this.findJdkHomes(),
    ].filter((value): value is string => Boolean(value))
    const javaHome = javaHomeCandidates.find((candidate) =>
      existsSync(join(candidate, 'bin', 'javac.exe')) || existsSync(join(candidate, 'bin', 'javac')))
    const javacCommand = javaHome ? join(javaHome, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac') : 'javac'
    const javaCommand = javaHome ? join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java'

    if (request.language === 'Python') {
      const candidates = [
        { command: 'python', args: [join(workDir, 'main.py')] },
        { command: 'python3', args: [join(workDir, 'main.py')] },
        { command: 'py', args: ['-3', join(workDir, 'main.py')] },
      ]
      return this.runNativeCandidates(candidates, stdin, timeoutMs)
    }
    if (request.language === 'JavaScript') {
      const candidates = [
        { command: 'node', args: [join(workDir, 'main.js')] },
        { command: 'nodejs', args: [join(workDir, 'main.js')] },
      ]
      return this.runNativeCandidates(candidates, stdin, timeoutMs)
    }

    const executable = request.language === 'C++'
      ? { command: join(workDir, process.platform === 'win32' ? 'main.exe' : 'main'), args: [] }
      : { command: javaCommand, args: ['-cp', workDir, 'Main'] }

    return new Promise((resolve) => {
      let compilation: ReturnType<typeof spawn> | null = null
      if (request.language === 'C++') {
        const compilerCandidates = ['g++', 'clang++', 'c++']
        const compiler = compilerCandidates.find((candidate) => {
          if (process.platform !== 'win32') return true
          return existsSync(candidate) || candidate === 'g++'
        }) ?? 'g++'
        compilation = spawn(compiler, ['-std=c++17', '-O2', '-o', join(workDir, process.platform === 'win32' ? 'main.exe' : 'main'), join(workDir, 'main.cpp')], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        let compileError = ''
        compilation.stderr?.on('data', (chunk) => { compileError += chunk.toString() })
        compilation.on('error', (error) => resolve({
          stdout: '',
          stderr: error.message,
          timedOut: false,
          runtimeError: true,
        }))
        compilation.on('close', (exitCode) => {
          if (exitCode !== 0) {
            resolve({
              stdout: '',
              stderr: compileError || 'C++ compilation failed.',
              timedOut: false,
              runtimeError: true,
            })
            return
          }

          this.runNativeProcess(executable.command, executable.args, stdin, timeoutMs).then(resolve)
        })
        return
      }

      if (request.language === 'Java') {
        compilation = spawn(javacCommand, ['-d', workDir, join(workDir, 'Main.java')], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        let compileError = ''
        compilation.stderr?.on('data', (chunk) => { compileError += chunk.toString() })
        compilation.on('error', (error) => resolve({
          stdout: '',
          stderr: error.message,
          timedOut: false,
          runtimeError: true,
        }))
        compilation.on('close', (exitCode) => {
          if (exitCode !== 0) {
            resolve({
              stdout: '',
              stderr: compileError || 'Java compilation failed.',
              timedOut: false,
              runtimeError: true,
            })
            return
          }
          this.runNativeProcess(executable.command, executable.args, stdin, timeoutMs).then(resolve)
        })
        return
      }

      if (!executable.command) {
        resolve({
          stdout: '',
          stderr: 'Java execution requires Docker or a locally configured Java runtime.',
          timedOut: false,
          runtimeError: true,
        })
        return
      }
      this.runNativeProcess(executable.command, executable.args, stdin, timeoutMs).then(resolve)
    })
  }

  private findJdkHomes(): string[] {
    const roots = [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Eclipse Adoptium'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Java'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft'),
      join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Java'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Eclipse Adoptium'),
    ].filter(Boolean)
    const homes: string[] = []

    for (const root of roots) {
      if (!existsSync(root)) continue
      try {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          const home = join(root, entry.name)
          if (existsSync(join(home, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'))) {
            homes.push(home)
          }
        }
      } catch {
        continue
      }
    }
    return homes
  }

  private isDockerUnavailableError(stderr: string): boolean {
    const message = stderr.toLowerCase()
    return message.includes('cannot connect to the docker daemon')
      || message.includes('docker daemon is not running')
      || message.includes('docker: command not found')
      || message.includes('unable to find image')
      || message.includes('is not recognized as an internal or external command')
  }

  private async runNativeCandidates(
    candidates: Array<{ command: string; args: string[] }>,
    stdin: string,
    timeoutMs: number,
  ): Promise<Omit<ExecutionResult, 'runtimeMs'>> {
    let unavailableError = ''
    for (const candidate of candidates) {
      const result = await this.runNativeProcess(candidate.command, candidate.args, stdin, timeoutMs)
      if (!result.runtimeError || !result.stderr.includes('Native runtime is unavailable')) {
        return result
      }
      unavailableError = result.stderr
    }
    return {
      stdout: '',
      stderr: unavailableError || 'Native runtime is unavailable.',
      timedOut: false,
      runtimeError: true,
    }
  }

  private runNativeProcess(
    command: string,
    args: string[],
    stdin: string,
    timeoutMs: number,
  ): Promise<Omit<ExecutionResult, 'runtimeMs'>> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      } catch (error) {
        resolve({
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Native runtime is unavailable.',
          timedOut: false,
          runtimeError: true,
        })
        return
      }

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false
      child.stdout?.on('data', (chunk) => {
        const res = appendOutputChunk(stdout, chunk)
        stdout = res.output
        if (res.truncated) child.stdout?.destroy()
      })
      child.stderr?.on('data', (chunk) => {
        const res = appendOutputChunk(stderr, chunk)
        stderr = res.output
        if (res.truncated) child.stderr?.destroy()
      })
      child.stdin?.end(stdin)

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)

      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({
          stdout: '',
          stderr: `${error.message} Native runtime is unavailable.`,
          timedOut: false,
          runtimeError: true,
        })
      })
      child.on('close', (exitCode) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({
          stdout,
          stderr,
          timedOut,
          runtimeError: !timedOut && exitCode !== 0,
        })
      })
    })
  }
}

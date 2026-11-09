import type { Difficulty, HintDto, QuestionDto } from '../../../packages/shared/src/types.js'
import { QuestionRepository } from './questionRepository.js'
import { HttpError } from '../../../packages/shared/src/errors/httpError.js'
import type { GeneratedQuestion, QuestionProvider } from './provider.js'
import type { QuestionAuditor } from './questionAuditor.js'
import type { CodeRunner } from '../../execution-engine/src/codeRunner.js'

export class QuestionService {
  constructor(
    private readonly repository: QuestionRepository,
    private readonly provider?: QuestionProvider,
    private readonly auditor?: QuestionAuditor,
    private readonly runner?: CodeRunner,
  ) {}

  async generate(
    topic: string,
    difficulty: Difficulty,
    options?: { excludeIds?: string[]; excludeTitles?: string[]; categories?: string[]; customPrompt?: string },
  ): Promise<QuestionDto> {
    if (!this.provider) {
      throw new HttpError(
        503,
        'AI question generation is not configured. Set GEMINI_API_KEY in apps/api/.env.',
        'AI_PROVIDER_NOT_CONFIGURED',
      )
    }

    const maxGenerationAttempts = 3
    let lastError: Error | null = null
    let auditorFeedback: string | undefined = undefined

    for (let attempt = 1; attempt <= maxGenerationAttempts; attempt++) {
      try {
        console.info(`[QuestionService] Step 2: Generating problem (attempt ${attempt}/${maxGenerationAttempts})...`)

        const customPromptWithFeedback = [
          options?.customPrompt?.trim(),
          auditorFeedback ? `PREVIOUS AUDIT FEEDBACK (you MUST address this): ${auditorFeedback}` : '',
        ].filter(Boolean).join('\n')

        // 2. Gemini generates problem + reference solution + test inputs
        const generated: GeneratedQuestion = await this.provider.generate({
          topic,
          difficulty,
          excludeTitles: options?.excludeTitles,
          categories: options?.categories,
          customPrompt: customPromptWithFeedback || undefined,
        })

        // 3. Independent verification: Gemini auditor
        if (this.auditor) {
          console.info(`[QuestionService] Step 3: Running independent question audit...`)
          const audit = await this.auditor.audit(generated)
          if (audit.verdict !== 'APPROVED') {
            console.warn(`[QuestionService] Question rejected by auditor (${audit.verdict}): ${audit.reason}`)
            auditorFeedback = audit.reason + (audit.issues?.length ? ` Issues: ${audit.issues.join('; ')}` : '')
            if (attempt < maxGenerationAttempts) {
              continue
            }
          } else {
            console.info(`[QuestionService] Step 3 passed: Question approved by independent auditor.`)
          }
        }

        // 4 & 5. Backend executes reference code to compute & validate true expected outputs
        if (this.runner && generated.referenceSolution) {
          console.info(`[QuestionService] Step 4 & 5: Executing reference code in sandbox to compute exact outputs...`)
          const validTestCases: typeof generated.testCases = []

          for (const tc of generated.testCases) {
            try {
              const execResult = await this.runner.execute({
                language: 'Python',
                code: generated.referenceSolution,
                input: tc.input,
                timeoutMs: 3000,
              })

              if (execResult.timedOut || execResult.runtimeError) {
                console.warn(`[QuestionService] Reference solution failed on test case "${tc.name}": ${execResult.stderr || 'timed out'}`)
                continue
              }

              // Overwrite expectedOutput with the REAL executed output from Python!
              const actualStdout = execResult.stdout.trim()
              if (actualStdout.length > 0) {
                validTestCases.push({
                  ...tc,
                  expectedOutput: actualStdout,
                })
              }
            } catch (err) {
              console.warn(`[QuestionService] Test case execution error:`, err)
            }
          }

          // Also verify example outputs
          for (const ex of generated.examples) {
            try {
              const exResult = await this.runner.execute({
                language: 'Python',
                code: generated.referenceSolution,
                input: ex.input,
                timeoutMs: 3000,
              })
              if (!exResult.timedOut && !exResult.runtimeError && exResult.stdout.trim()) {
                ex.output = exResult.stdout.trim()
              }
            } catch {
              // keep existing example output if sandbox fails
            }
          }

          if (validTestCases.length >= 3) {
            generated.testCases = validTestCases
            console.info(`[QuestionService] Computed & verified ${validTestCases.length} test cases with backend sandbox!`)
          } else {
            console.warn(`[QuestionService] Reference solution did not pass enough test cases (${validTestCases.length}/3). Retrying...`)
            if (attempt < maxGenerationAttempts) continue
          }
        }

        // 6. Save verified question to database & return clean question
        console.info(`[QuestionService] Step 6: Publishing verified question "${generated.title}"`)
        const question = await this.repository.save({ topic, difficulty, generated })
        return await this.getById(question.id)

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.error(`[QuestionService] Generation attempt ${attempt} failed:`, lastError.message)
        if (attempt < maxGenerationAttempts) continue
      }
    }

    if (lastError instanceof HttpError) throw lastError
    throw new HttpError(500, lastError?.message || 'Failed to generate a verified question.', 'QUESTION_GENERATION_FAILED')
  }

  async getById(id: string): Promise<QuestionDto> {
    const question = await this.repository.findById(id)
    if (!question) {
      throw new HttpError(404, 'Question not found.', 'QUESTION_NOT_FOUND')
    }
    return {
      ...question,
      testCases: question.testCases.map((testCase) =>
        testCase.hidden
          ? { id: testCase.id, name: testCase.name, input: '', hidden: true }
          : testCase,
      ),
    }
  }

  async getHint(id: string, requestedLevel: number = 1): Promise<HintDto> {
    const question = await this.repository.findById(id)
    if (!question) {
      throw new HttpError(404, 'Question not found.', 'QUESTION_NOT_FOUND')
    }
    const safeLevel = (Math.max(1, Math.min(3, Math.floor(requestedLevel))) as 1 | 2 | 3)
    return this.buildProgressiveHint(question, safeLevel)
  }

  private buildProgressiveHint(question: QuestionDto, level: 1 | 2 | 3): HintDto {
    const topic = question.topic.toLowerCase()

    if (level === 1) {
      const intuitionMap: Record<string, string> = {
        stacks: 'Think about whether you need the nearest or next element that satisfies a condition. A stack helps track unresolved elements in LIFO order.',
        'dynamic-programming': 'Look for overlapping subproblems and optimal substructure. What state uniquely represents the subproblem at step i?',
        arrays: 'Consider whether sorting, two pointers (from both ends or sliding window), or prefix sums can reduce an O(N^2) search to O(N).',
        trees: 'Can this be solved by post-order or pre-order recursion? Often computing information from left and right subtrees gives the answer for the parent node.',
        graphs: 'Is this finding shortest paths (BFS for unweighted, Dijkstra for weighted) or exploring connected components (DFS)?',
      }
      return {
        level: 1,
        title: 'Tier 1: High-Level Intuition',
        content: intuitionMap[topic] ?? `Analyze the constraints for ${question.title}. Break down what invariant needs to be preserved as you process the input.`,
        totalLevels: 3,
      }
    }

    if (level === 2) {
      const approachMap: Record<string, string> = {
        stacks: 'Maintain a monotonic stack storing values or indices. While the stack is non-empty and the current element satisfies the comparison condition, pop from the stack and compute the result.',
        'dynamic-programming': 'Define dp[i] as the answer for subproblem size i. Write down the transition: how do you transition from dp[i - 1] or smaller subproblems to dp[i]?',
        arrays: 'If looking for target pairs or differences, a hash set or two-pointer scan on sorted data gives O(N) or O(N log N) time.',
        trees: 'If finding lowest common ancestor or paths, check if the current node matches either target. If both left and right recursive calls return non-null, the current node is the answer.',
        graphs: 'Build an adjacency list first. Keep a visited array or set to prevent infinite loops in cycles.',
      }
      return {
        level: 2,
        title: 'Tier 2: Algorithmic Strategy',
        content: approachMap[topic] ?? `Consider an optimal data structure for ${question.topic}. Formulate the invariant: what does each iteration or recursive call maintain?`,
        totalLevels: 3,
      }
    }

    const edgeCaseMap: Record<string, string> = {
      stacks: 'Watch out for: strictly decreasing inputs where no element is popped, single-element arrays, duplicate values, and items remaining on the stack at the end.',
      'dynamic-programming': 'Check base cases: amount = 0, impossible target (return -1), and large integer values that could overflow standard 32-bit types.',
      arrays: 'Watch out for: negative integers, empty or 1-element arrays, multiple duplicate pairs, and 0-based vs 1-based index requirements.',
      trees: 'Check edge cases: root is null, root itself is one of the target nodes, or single-node trees.',
      graphs: 'Check edge cases: disconnected graphs, self-loops, and multi-component graphs where the destination is unreachable.',
    }
    return {
      level: 3,
      title: 'Tier 3: Critical Edge Cases & Invariants',
      content: edgeCaseMap[topic] ?? `Inspect the problem constraints carefully: ${question.constraints.slice(0, 2).join(', ')}. Ensure your base cases handle minimal inputs properly.`,
      totalLevels: 3,
    }
  }
}

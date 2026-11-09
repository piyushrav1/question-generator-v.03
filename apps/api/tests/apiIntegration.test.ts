import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { createApp } from '../server/src/app.js'
import { QuestionRepository } from '../../../services/question-engine/src/questionRepository.js'
import { QuestionService } from '../../../services/question-engine/src/questionService.js'
import { SubmissionService } from '../../../services/execution-engine/src/submissionService.js'
import type { CodeRunner } from '../../../services/execution-engine/src/codeRunner.js'

class TestCodeRunner implements CodeRunner {
  async execute(request: { code: string; input: string }) {
    const tokens = request.input.trim().split(/\s+/)
    if (tokens.length >= 2) {
      return { stdout: `${tokens.slice(1).join(' ')}\n`, stderr: '', exitCode: 0, runtimeMs: 15 }
    }
    return { stdout: '0 1\n', stderr: '', exitCode: 0, runtimeMs: 10 }
  }
}

let server: Server
let baseUrl: string

before(async () => {
  const repository = new QuestionRepository()
  const questionService = new QuestionService(
    repository,
    {
      generate: async () => {
        throw new Error('Not implemented for integration tests')
      },
    },
  )
  const submissionService = new SubmissionService(repository, new TestCodeRunner())

  const app = createApp({
    repository,
    questionService,
    submissionService,
  })

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

after(async () => {
  if (server) {
    server.closeAllConnections?.()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('API Integration: GET /api/health returns detailed runtime diagnostics', async () => {
  const res = await fetch(`${baseUrl}/api/health`, { headers: { connection: 'close' } })
  assert.equal(res.status, 200)

  const data = await res.json() as any
  assert.equal(data.status, 'ok')
  assert.equal(data.service, 'TestMeMan API')
  assert.ok(typeof data.uptimeSeconds === 'number')
  assert.ok(data.system?.nodeVersion)
  assert.ok(typeof data.system?.memory?.rssMb === 'number')
})

test('API Integration: GET /api/questions/:id retrieves question and redacts hidden tests', async () => {
  const res = await fetch(`${baseUrl}/api/questions/curated-arrays-two-sum`, { headers: { connection: 'close' } })
  assert.equal(res.status, 200)

  const data = await res.json() as any
  assert.equal(data.id, 'curated-arrays-two-sum')
  assert.equal(data.topic, 'arrays')
  assert.ok(data.testCases.length >= 3)

  // Hidden test cases MUST NOT have expectedOutput
  const hiddenCases = data.testCases.filter((tc: any) => tc.hidden)
  assert.ok(hiddenCases.length > 0)
  for (const hc of hiddenCases) {
    assert.equal(hc.expectedOutput, undefined, 'Hidden test case expectedOutput must be redacted')
  }
})

test('API Integration: POST /api/submissions evaluates code against curated question', async () => {
  const res = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', connection: 'close' },
    body: JSON.stringify({
      questionId: 'curated-arrays-two-sum',
      language: 'Python',
      code: 'import sys\nprint("0 1")\n# solution implementation here',
      submitted: false,
    }),
  })

  assert.equal(res.status, 201)
  const result = await res.json() as any
  assert.equal(result.questionId, 'curated-arrays-two-sum')
  assert.equal(result.language, 'Python')
  assert.ok(result.status)
  assert.ok(typeof result.totalCases === 'number')
})

test('API Integration: returns 404 for non-existent routes', async () => {
  const res = await fetch(`${baseUrl}/api/non-existent-route-xyz`, { headers: { connection: 'close' } })
  assert.equal(res.status, 404)
})

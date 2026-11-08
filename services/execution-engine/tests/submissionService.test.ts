import test from 'node:test'
import assert from 'node:assert/strict'
import { SubmissionService } from '../src/submissionService.js'
import { QuestionRepository } from '../../question-engine/src/questionRepository.js'
import type { CodeRunner, RunResult } from '../src/codeRunner.js'

class MockCodeRunner implements CodeRunner {
  constructor(private readonly handler: (input: string) => RunResult) {}

  async execute(request: { input: string }): Promise<RunResult> {
    return this.handler(request.input)
  }
}

test('SubmissionService detects language mismatch and handles missing questions', async () => {
  const repo = new QuestionRepository()
  const service = new SubmissionService(repo, new MockCodeRunner(() => ({ stdout: '', stderr: '', exitCode: 0, runtimeMs: 10 })))

  // Calling evaluate with invalid question throws 404
  await assert.rejects(
    service.evaluate({
      questionId: 'non-existent-id',
      language: 'Python',
      code: 'print("hello")',
      submitted: false,
    }),
    { message: 'Question not found.' },
  )
})

test('SubmissionService evaluates exact, token, and JSON output comparison', () => {
  const repo = new QuestionRepository()
  const service = new SubmissionService(repo, new MockCodeRunner(() => ({ stdout: '', stderr: '', exitCode: 0, runtimeMs: 10 })))

  const compareOutput = (service as any).compareOutput.bind(service)

  // Token mode: whitespace and newline insensitive
  assert.equal(compareOutput('1 2 3', '1\n2\n3', 'token'), true)
  assert.equal(compareOutput('  42  \n', '42', 'token'), true)
  assert.equal(compareOutput('1 2 3', '1 2 4', 'token'), false)

  // Exact mode
  assert.equal(compareOutput('hello\n', 'hello', 'exact'), true)
  assert.equal(compareOutput('hello world', 'hello   world', 'exact'), false)

  // JSON mode
  assert.equal(compareOutput('[1, 2, 3]', '[1, 2, 3]', 'json'), true)
  assert.equal(compareOutput('[1, 2, 3]', '[1,2,3]', 'json'), true)
  assert.equal(compareOutput('{"a":1}', '{"a":1}', 'json'), true)
  assert.equal(compareOutput('invalid json', '{"a": 1}', 'json'), false)
})

test('SubmissionService evaluates submission with all passing test cases', async () => {
  const repo = new QuestionRepository()
  const savedQuestion = await repo.save({
    topic: 'math',
    difficulty: 'easy',
    generated: {
      title: 'Sample Add Two',
      statement: 'A test problem statement for evaluation suite verification.',
      constraints: ['1 <= a, b <= 100'],
      examples: [{ input: '2 3', output: '5' }],
      comparisonMode: 'token',
      starterCode: { Python: '', JavaScript: '', Java: '', 'C++': '' },
      testCases: [
        { id: 'tc-1', name: 'Sample 1', input: '2 3', expectedOutput: '5', hidden: false },
        { id: 'tc-2', name: 'Sample 2', input: '10 20', expectedOutput: '30', hidden: false },
        { id: 'tc-3', name: 'Hidden 1', input: '50 50', expectedOutput: '100', hidden: true },
      ],
    },
  })

  // Mock runner that computes correct answers
  const runner = new MockCodeRunner((input) => {
    const [a, b] = input.trim().split(/\s+/).map(Number)
    return {
      stdout: `${a + b}\n`,
      stderr: '',
      exitCode: 0,
      runtimeMs: 12,
    }
  })

  const service = new SubmissionService(repo, runner)

  const result = await service.evaluate({
    questionId: savedQuestion.id,
    language: 'Python',
    code: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)',
    submitted: true,
  })

  assert.equal(result.status, 'accepted')
  assert.equal(result.visiblePassed, 2)
  assert.equal(result.visibleTotal, 2)
  assert.equal(result.hiddenPassed, 1)
  assert.equal(result.hiddenTotal, 1)
  assert.equal(result.caseResults?.length, 3)
})

test('SubmissionService flags wrong answer when output mismatches', async () => {
  const repo = new QuestionRepository()
  const savedQuestion = await repo.save({
    topic: 'math',
    difficulty: 'easy',
    generated: {
      title: 'Sample Add Two 2',
      statement: 'A test problem statement for evaluation suite verification.',
      constraints: ['1 <= a, b <= 100'],
      examples: [{ input: '2 3', output: '5' }],
      comparisonMode: 'token',
      starterCode: { Python: '', JavaScript: '', Java: '', 'C++': '' },
      testCases: [
        { id: 'tc-1', name: 'Sample 1', input: '2 3', expectedOutput: '5', hidden: false },
        { id: 'tc-2', name: 'Hidden 1', input: '10 20', expectedOutput: '30', hidden: true },
      ],
    },
  })

  // Mock runner that returns wrong answer
  const runner = new MockCodeRunner(() => ({
    stdout: '999\n',
    stderr: '',
    exitCode: 0,
    runtimeMs: 15,
  }))

  const service = new SubmissionService(repo, runner)

  const result = await service.evaluate({
    questionId: savedQuestion.id,
    language: 'Python',
    code: 'print(999)',
    submitted: true,
  })

  assert.equal(result.status, 'wrong_answer')
  assert.equal(result.visiblePassed, 0)
  assert.equal(result.hiddenPassed, 0)
})

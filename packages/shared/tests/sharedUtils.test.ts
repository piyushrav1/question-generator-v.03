import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSuccessResponse,
  createErrorResponse,
  isProgrammingLanguage,
  isDifficulty,
  isTestCaseDto,
  isQuestionDto,
  isSubmissionResultDto,
} from '../src/index.js'

test('createSuccessResponse packages data into standardized envelope', () => {
  const envelope = createSuccessResponse({ id: '123', name: 'Test' }, { durationMs: 42 })
  assert.equal(envelope.success, true)
  assert.deepEqual(envelope.data, { id: '123', name: 'Test' })
  assert.deepEqual(envelope.meta, { durationMs: 42 })
})

test('createErrorResponse packages error into standardized envelope', () => {
  const err = createErrorResponse('INVALID_INPUT', 'Parameter is required', { field: 'code' })
  assert.equal(err.success, false)
  assert.equal(err.error.code, 'INVALID_INPUT')
  assert.equal(err.error.message, 'Parameter is required')
  assert.deepEqual(err.error.details, { field: 'code' })
})

test('isProgrammingLanguage validates supported languages', () => {
  assert.equal(isProgrammingLanguage('Python'), true)
  assert.equal(isProgrammingLanguage('JavaScript'), true)
  assert.equal(isProgrammingLanguage('Java'), true)
  assert.equal(isProgrammingLanguage('C++'), true)
  assert.equal(isProgrammingLanguage('Ruby'), false)
  assert.equal(isProgrammingLanguage(123), false)
  assert.equal(isProgrammingLanguage(null), false)
})

test('isDifficulty validates difficulty levels', () => {
  assert.equal(isDifficulty('easy'), true)
  assert.equal(isDifficulty('medium'), true)
  assert.equal(isDifficulty('hard'), true)
  assert.equal(isDifficulty('extreme'), false)
  assert.equal(isDifficulty(undefined), false)
})

test('isTestCaseDto checks shape of test case objects', () => {
  const valid = { id: 'tc-1', name: 'Sample 1', input: '1 2', hidden: false }
  assert.equal(isTestCaseDto(valid), true)

  assert.equal(isTestCaseDto({ id: 'tc-1', name: 'Sample 1' }), false)
  assert.equal(isTestCaseDto(null), false)
  assert.equal(isTestCaseDto('tc-1'), false)
})

test('isQuestionDto validates full question shape', () => {
  const validQuestion = {
    id: 'q-1',
    title: 'Valid Question',
    difficulty: 'easy',
    topic: 'arrays',
    statement: 'A valid problem statement',
    constraints: ['1 <= N <= 100'],
    examples: [{ input: '1', output: '2' }],
    starterCode: {
      Python: 'pass',
      JavaScript: '// js',
      Java: '// java',
      'C++': '// cpp',
    },
    testCases: [
      { id: 'tc-1', name: 'Sample 1', input: '1', hidden: false },
    ],
  }
  assert.equal(isQuestionDto(validQuestion), true)

  const missingConstraints = { ...validQuestion, constraints: null }
  assert.equal(isQuestionDto(missingConstraints), false)
})

test('isSubmissionResultDto validates submission results', () => {
  const validResult = {
    id: 'sub-1',
    questionId: 'q-1',
    language: 'Python',
    status: 'accepted',
    submitted: true,
    totalCases: 5,
    visiblePassed: 2,
    visibleTotal: 2,
    hiddenPassed: 3,
    hiddenTotal: 3,
    runtimeMs: 45,
    memoryMb: 12,
    message: 'All test cases passed!',
  }
  assert.equal(isSubmissionResultDto(validResult), true)

  const invalidStatus = { ...validResult, status: 'unknown_status' }
  assert.equal(isSubmissionResultDto(invalidStatus), false)
})

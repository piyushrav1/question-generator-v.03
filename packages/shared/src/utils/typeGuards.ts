import {
  PROGRAMMING_LANGUAGES,
  DIFFICULTIES,
  type ProgrammingLanguage,
  type Difficulty,
  type QuestionDto,
  type TestCaseDto,
  type SubmissionResultDto,
} from '../types.js'

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

export function isProgrammingLanguage(val: unknown): val is ProgrammingLanguage {
  return typeof val === 'string' && (PROGRAMMING_LANGUAGES as readonly string[]).includes(val)
}

export function isDifficulty(val: unknown): val is Difficulty {
  return typeof val === 'string' && (DIFFICULTIES as readonly string[]).includes(val)
}

export function isTestCaseDto(val: unknown): val is TestCaseDto {
  if (!isRecord(val)) return false
  return (
    typeof val.id === 'string' &&
    typeof val.name === 'string' &&
    typeof val.input === 'string' &&
    typeof val.hidden === 'boolean'
  )
}

export function isQuestionDto(val: unknown): val is QuestionDto {
  if (!isRecord(val)) return false
  return (
    typeof val.id === 'string' &&
    typeof val.title === 'string' &&
    isDifficulty(val.difficulty) &&
    typeof val.topic === 'string' &&
    typeof val.statement === 'string' &&
    Array.isArray(val.constraints) &&
    Array.isArray(val.examples) &&
    isRecord(val.starterCode) &&
    Array.isArray(val.testCases) &&
    val.testCases.every(isTestCaseDto)
  )
}

export function isSubmissionResultDto(val: unknown): val is SubmissionResultDto {
  if (!isRecord(val)) return false
  return (
    typeof val.id === 'string' &&
    typeof val.questionId === 'string' &&
    isProgrammingLanguage(val.language) &&
    typeof val.status === 'string' &&
    ['accepted', 'wrong_answer', 'runtime_error', 'time_limit_exceeded'].includes(val.status) &&
    typeof val.submitted === 'boolean' &&
    typeof val.totalCases === 'number' &&
    typeof val.visiblePassed === 'number' &&
    typeof val.visibleTotal === 'number' &&
    typeof val.hiddenPassed === 'number' &&
    typeof val.hiddenTotal === 'number' &&
    typeof val.message === 'string'
  )
}

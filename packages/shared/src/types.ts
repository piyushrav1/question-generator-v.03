export const PROGRAMMING_LANGUAGES = ['Python', 'JavaScript', 'Java', 'C++'] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export type ProgrammingLanguage = typeof PROGRAMMING_LANGUAGES[number]
export type Difficulty = typeof DIFFICULTIES[number]

export interface TestCaseDto {
  id: string
  name: string
  input: string
  expectedOutput?: string
  hidden: boolean
}

export type OutputComparisonMode = 'exact' | 'token' | 'json'

export interface QuestionDto {
  id: string
  title: string
  difficulty: Difficulty
  topic: string
  statement: string
  constraints: string[]
  examples: Array<{ input: string; output: string }>
  starterCode: Record<ProgrammingLanguage, string>
  testCases: TestCaseDto[]
  inputFormat?: string
  outputFormat?: string
  comparisonMode?: OutputComparisonMode
}

export interface GenerateQuestionRequest {
  topic?: string
  difficulty?: Difficulty
  language?: ProgrammingLanguage
  categories?: string[]
  customPrompt?: string
}

export interface SubmissionRequest {
  questionId: string
  language: ProgrammingLanguage
  code: string
  submitted: boolean
  customInput?: string
  customExpectedOutput?: string
}

export interface SubmissionCaseResultDto {
  id: string
  name: string
  hidden: boolean
  status: 'passed' | 'wrong_answer' | 'runtime_error' | 'time_limit_exceeded'
  actualOutput?: string
  expectedOutput?: string
  runtimeMs: number
  mismatchLine?: number
  mismatchColumn?: number
}

export interface SubmissionResultDto {
  id: string
  questionId: string
  language: ProgrammingLanguage
  status: 'accepted' | 'wrong_answer' | 'runtime_error' | 'time_limit_exceeded'
  submitted: boolean
  totalCases: number
  visiblePassed: number
  visibleTotal: number
  hiddenPassed: number
  hiddenTotal: number
  runtimeMs: number | null
  memoryMb: number | null
  message: string
  caseResults?: SubmissionCaseResultDto[]
  submittedAfterDeadline?: boolean
  remainingSecondsAtSubmission?: number
}

export interface PracticeTimerDto {
  durationSeconds: number
  remainingSeconds: number
  startedAt: string
  expiresAt: string | null
  status: 'running' | 'paused' | 'expired'
  pauseCount: number
  expiredAt?: string
}

export interface AttemptDto {
  id: string
  questionId: string
  question: QuestionDto
  language: ProgrammingLanguage
  code: string
  status: 'active' | 'abandoned' | 'completed'
  revision: number
  createdAt: string
  updatedAt: string
  timer?: PracticeTimerDto
}

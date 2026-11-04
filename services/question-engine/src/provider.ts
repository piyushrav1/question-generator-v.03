import type { Difficulty, OutputComparisonMode, ProgrammingLanguage, TestCaseDto } from '../../../packages/shared/src/types.js'

export interface GeneratedQuestion {
  title: string
  statement: string
  constraints: string[]
  examples: Array<{ input: string; output: string }>
  starterCode: Record<ProgrammingLanguage, string>
  testCases: TestCaseDto[]
  inputFormat?: string
  outputFormat?: string
  comparisonMode?: OutputComparisonMode
  referenceSolution?: string
}

export interface QuestionProvider {
  generate(input: {
    topic: string
    difficulty: Difficulty
    excludeTitles?: string[]
    categories?: string[]
    customPrompt?: string
  }): Promise<GeneratedQuestion>
}

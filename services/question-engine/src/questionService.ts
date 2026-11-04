import type { Difficulty, QuestionDto } from '../../../packages/shared/src/types.js'
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

  async getHint(id: string): Promise<{ hint: string; level: number }> {
    const question = await this.repository.findById(id)
    if (!question) {
      throw new HttpError(404, 'Question not found.', 'QUESTION_NOT_FOUND')
    }
    return {
      hint: `Carefully examine the input format and constraints for ${question.title}. Consider how standard algorithmic patterns for ${question.topic} apply to this structure.`,
      level: 1,
    }
  }
}

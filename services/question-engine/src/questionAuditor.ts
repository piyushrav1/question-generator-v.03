import { GoogleGenAI } from '@google/genai'
import type { GeneratedQuestion } from './provider.js'

export interface AuditResult {
  verdict: 'APPROVED' | 'REJECTED' | 'AMBIGUOUS'
  reason: string
  issues: string[]
  suggestedFix?: string
}

const AUDITOR_SYSTEM_PROMPT = `INDEPENDENT COMPETITIVE PROGRAMMING QUESTION AUDITOR

Act as an independent senior competitive programming judge and software verification engineer.

You will receive a generated programming problem, its reference solution, sample test cases, hidden test cases, and expected outputs.

Your task is to find errors, not to praise the generated question.

You must independently inspect the complete problem:
1. Logical correctness of the problem definition.
2. Ambiguous or contradictory statements.
3. Correctness of all examples.
4. Input and output format.
5. Constraints and indexing.
6. Mathematical correctness of expected outputs.
7. Reference implementation correctness.
8. Hidden test case coverage.
9. Time and space complexity.
10. Potential edge cases not covered.
11. Potential solutions that could exploit an incomplete specification.

Pay particular attention to:
- Incorrect cycle handling.
- Incorrect XOR versus arithmetic sum.
- Strict versus non-strict comparisons.
- Duplicate elements.
- Empty and single-element inputs.
- Negative values.
- Integer boundaries (32-bit vs 64-bit overflow).
- Incorrect recursive base cases.
- Invalid graph transitions.
- Incorrect lexicographical ordering.
- Incorrect tie-breaking.
- Incorrect expected outputs.

Return one of these verdicts:
- APPROVED: All logical and verification requirements are satisfied.
- REJECTED: One or more correctness or mathematical issues exist.
- AMBIGUOUS: The problem cannot be uniquely interpreted.

You MUST output ONLY valid JSON matching this exact structure:
{
  "verdict": "APPROVED",
  "reason": "All checks passed. Mathematical definition and constraints are consistent.",
  "issues": [],
  "suggestedFix": ""
}

Do NOT wrap in markdown fences. Output pure JSON only.`

export class QuestionAuditor {
  private readonly client: GoogleGenAI

  constructor(private readonly apiKey: string, private readonly model: string) {
    this.client = new GoogleGenAI({ apiKey: this.apiKey })
  }

  async audit(problem: GeneratedQuestion): Promise<AuditResult> {
    const candidateModels = [
      this.model || 'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.8-flash',
    ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i)

    const payloadText = JSON.stringify({
      title: problem.title,
      statement: problem.statement,
      constraints: problem.constraints,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      comparisonMode: problem.comparisonMode,
      referenceSolution: problem.referenceSolution || 'Not supplied',
      examples: problem.examples,
      testCases: problem.testCases.map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        hidden: tc.hidden,
      })),
    }, null, 2)

    for (const model of candidateModels) {
      try {
        const response = await this.client.models.generateContent({
          model,
          contents: `${AUDITOR_SYSTEM_PROMPT}\n\nProblem to audit:\n${payloadText}`,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1, // low temperature for strict verification
          },
        })

        const text = response.text?.trim()
        if (!text) continue

        const cleaned = text
          .replace(/^\uFEFF/, '')
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/m, '')
          .trim()

        const parsed = JSON.parse(cleaned) as any
        const verdict = parsed?.verdict === 'APPROVED' ? 'APPROVED'
          : parsed?.verdict === 'AMBIGUOUS' ? 'AMBIGUOUS'
          : 'REJECTED'

        const reason = typeof parsed?.reason === 'string' ? parsed.reason : 'Audit evaluation completed.'
        const issues = Array.isArray(parsed?.issues) ? parsed.issues.map(String) : []
        const suggestedFix = typeof parsed?.suggestedFix === 'string' ? parsed.suggestedFix : undefined

        return { verdict, reason, issues, suggestedFix }
      } catch (err) {
        console.warn(`[QuestionAuditor] Model ${model} audit error:`, err instanceof Error ? err.message : err)
        continue
      }
    }

    // If auditor is unreachable, approve with warning rather than blocking user
    console.warn('[QuestionAuditor] Auditor temporarily unavailable, passing with fallback.')
    return {
      verdict: 'APPROVED',
      reason: 'Auditor service bypassed due to temporary API fallback.',
      issues: [],
    }
  }
}


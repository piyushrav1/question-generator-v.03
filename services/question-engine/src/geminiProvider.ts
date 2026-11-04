import { GoogleGenAI } from '@google/genai'
import type { Difficulty, ProgrammingLanguage } from '../../../packages/shared/src/types.js'
import { generatedQuestionSchema } from './questionSchemas.js'
import type { GeneratedQuestion, QuestionProvider } from './provider.js'
import { HttpError } from '../../../packages/shared/src/errors/httpError.js'
import { randomUUID } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Default starter code — plain stdin/stdout, guaranteed to work in every runner
// ─────────────────────────────────────────────────────────────────────────────
const defaultStarters: Record<ProgrammingLanguage, string> = {
  Python: `import sys
input = sys.stdin.readline

def solve():
    # Read your inputs here, e.g.:
    # n = int(input())
    # a = list(map(int, input().split()))
    pass

solve()`,

  JavaScript: `process.stdin.resume();
process.stdin.setEncoding('utf8');
let _input = '';
process.stdin.on('data', d => _input += d);
process.stdin.on('end', () => {
  const lines = _input.trim().split('\\n');
  let idx = 0;
  const readLine = () => lines[idx++] || '';
  const readInts = () => readLine().trim().split(/\\s+/).map(Number);

  // Write your solution here using readLine() and readInts()

});`,

  Java: `import java.util.*;
import java.io.*;

public class Main {
    static BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    static StringTokenizer st;

    static String nextLine() throws IOException { return br.readLine(); }
    static int nextInt() throws IOException {
        while (st == null || !st.hasMoreTokens()) st = new StringTokenizer(br.readLine());
        return Integer.parseInt(st.nextToken());
    }
    static long nextLong() throws IOException {
        while (st == null || !st.hasMoreTokens()) st = new StringTokenizer(br.readLine());
        return Long.parseLong(st.nextToken());
    }

    public static void main(String[] args) throws IOException {
        // Write your solution here using nextInt(), nextLong(), nextLine()

    }
}`,

  'C++': `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Write your solution here using cin/cout

    return 0;
}`,
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — 8-phase rigorous generation
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Senior Competitive Programming Problem Setter and Test Validation Engineer.
Your PRIMARY GOAL is mathematical correctness. Creativity is secondary.

════════════════════════════════════════════════════════════
MANDATORY GENERATION ORDER — follow this EXACT sequence
════════════════════════════════════════════════════════════

STEP 1 ─ Define the problem mathematically.
  • One clear interpretation, zero ambiguity.
  • Explicitly define: indexing (0-based or 1-based), edge cases, duplicate handling, boundary behavior.
  • Specify all special conditions: empty input, single element, negative numbers, ties, cycles.
  • State whether comparisons are strict or non-strict.
  • State what to output when no valid answer exists.

STEP 2 ─ Write a Python 3 reference solution (internally, do not expose it).
  • Must be optimal for the given constraints.
  • Must handle ALL edge cases.
  • Write it completely — omitting logic causes wrong expected outputs.

STEP 3 ─ Derive every test case expected output.
  • Mentally execute the reference solution on EACH test input, step by step.
  • Record the EXACT output including whitespace and newlines.
  • NEVER invent, guess, or approximate expected outputs.
  • If you cannot verify an output with certainty, replace that test case with a simpler one you CAN verify.

STEP 4 ─ Self-verify (contradiction detection).
  • Re-read the problem statement.
  • Confirm every example input→output pair matches the statement exactly.
  • If ANY contradiction exists: fix the STATEMENT, not the output.
  • Check: do boundary examples respect the constraints?

STEP 5 ─ Output final JSON (see format below).

════════════════════════════════════════════════════════════
INPUT / OUTPUT FORMAT — strict rules, no exceptions
════════════════════════════════════════════════════════════

• All test case inputs are raw stdin (line-by-line or space-separated tokens).
• All expected outputs are raw stdout.
• NEVER use key=value format in test cases (no "nums=[1,2,3]", no "k=5").
• The stdin format must work identically for Python, JavaScript, Java, and C++.
• Newlines in JSON strings must be escaped as \\n.

VALID input examples:
  "5\\n1 2 3 4 5"           ← n on first line, array on second line
  "3 4\\n1 2 3\\n4 5 6 7"  ← multiple lines
  "hello world"             ← single string

INVALID input examples (do NOT use):
  "nums=[1,2,3],k=5"        ← key=value format
  "{n: 5, arr: [1,2,3]}"   ← JSON object format

════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT FORMAT
════════════════════════════════════════════════════════════

Output ONLY valid JSON. No markdown. No code fences. No commentary.

{
  "title": "Unique descriptive problem title",
  "statement": "Full problem description. Every condition must be explicit. Minimum 3 paragraphs.",
  "constraints": [
    "1 ≤ n ≤ 10^5",
    "-10^9 ≤ a[i] ≤ 10^9",
    "Time complexity: O(n log n)"
  ],
  "inputFormat": "Exact description of stdin lines in reading order.",
  "outputFormat": "Exact description of stdout. Specify trailing newline behavior.",
  "comparisonMode": "token",
  "referenceSolution": "import sys\n\ndef solve():\n    # Complete working optimal Python 3 solution that reads stdin and writes to stdout\n    pass\n\nif __name__ == '__main__':\n    solve()",
  "examples": [
    {
      "input": "5\\n1 2 3 4 5",
      "output": "15",
      "explanation": "Sum of 1+2+3+4+5 = 15."
    }
  ],
  "starterCode": {
    "Python": "import sys\\ninput = sys.stdin.readline\\n\\ndef solve():\\n    pass\\n\\nsolve()",
    "JavaScript": "process.stdin.resume();\\nprocess.stdin.setEncoding('utf8');\\nlet _in = '';\\nprocess.stdin.on('data', d => _in += d);\\nprocess.stdin.on('end', () => {\\n  const lines = _in.trim().split('\\\\n');\\n  let idx = 0;\\n  const rl = () => lines[idx++] || '';\\n  // solve here\\n});",
    "Java": "import java.util.*;\\nimport java.io.*;\\npublic class Main {\\n    static BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\\n    static StringTokenizer st;\\n    static int ni() throws IOException { while(st==null||!st.hasMoreTokens()) st=new StringTokenizer(br.readLine()); return Integer.parseInt(st.nextToken()); }\\n    public static void main(String[] a) throws IOException {\\n        // solve here\\n    }\\n}",
    "C++": "#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){\\n    ios_base::sync_with_stdio(false);\\n    cin.tie(NULL);\\n    // solve here\\n    return 0;\\n}"
  },
  "testCases": [
    { "id": "v1", "name": "Basic example",      "input": "5\\n1 2 3 4 5", "expectedOutput": "15",  "hidden": false },
    { "id": "v2", "name": "Single element",     "input": "1\\n7",          "expectedOutput": "7",   "hidden": false },
    { "id": "v3", "name": "All negative",       "input": "3\\n-1 -2 -3",  "expectedOutput": "-6",  "hidden": false },
    { "id": "v4", "name": "Boundary min",       "input": "...",            "expectedOutput": "...", "hidden": false },
    { "id": "v5", "name": "Edge case",          "input": "...",            "expectedOutput": "...", "hidden": false },
    { "id": "h1", "name": "Hidden - large",     "input": "...",            "expectedOutput": "...", "hidden": true  },
    { "id": "h2", "name": "Hidden - all equal", "input": "...",            "expectedOutput": "...", "hidden": true  },
    { "id": "h3", "name": "Hidden - sorted asc","input": "...",            "expectedOutput": "...", "hidden": true  },
    { "id": "h4", "name": "Hidden - sorted desc","input": "...",           "expectedOutput": "...", "hidden": true  },
    { "id": "h5", "name": "Hidden - adversarial","input": "...",           "expectedOutput": "...", "hidden": true  },
    { "id": "h6", "name": "Hidden - boundary",  "input": "...",            "expectedOutput": "...", "hidden": true  },
    { "id": "h7", "name": "Hidden - random",    "input": "...",            "expectedOutput": "...", "hidden": true  }
  ]
}

════════════════════════════════════════════════════════════
TEST CASE REQUIREMENTS
════════════════════════════════════════════════════════════

Visible test cases (hidden: false) — minimum 5:
  v1  Basic example matching the first example in the problem statement
  v2  Minimum-size input (n=1 or smallest valid)
  v3  All-equal values or special uniform input
  v4  Boundary condition (maximum or minimum value)
  v5  Important edge case specific to this problem

Hidden test cases (hidden: true) — minimum 7:
  h1  Large input (near maximum constraint)
  h2  All-equal values (different from v3)
  h3  Strictly increasing sequence
  h4  Strictly decreasing sequence
  h5  Adversarial input designed to break naive implementations
  h6  Off-by-one or initialization boundary
  h7  Random valid input

════════════════════════════════════════════════════════════
CORRECTNESS RULES — these are hard requirements
════════════════════════════════════════════════════════════

1. Every expectedOutput must equal the exact output of your reference solution on that input.
2. Every input must satisfy every stated constraint.
3. No contradiction is permitted between problem statement and examples.
4. If the problem has multiple valid outputs, state which one is required (e.g., "print the lexicographically smallest").
5. Tie-breaking rules must be explicitly stated if ties are possible.
6. Do NOT combine unrelated algorithms to fake difficulty.
7. The problem must be solvable with standard algorithms for the stated difficulty.`

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export class GeminiQuestionProvider implements QuestionProvider {
  private readonly client: GoogleGenAI

  constructor(private readonly apiKey: string, private readonly model: string) {
    this.client = new GoogleGenAI({ apiKey: this.apiKey })
  }

  // ── Normalize raw AI JSON → GeneratedQuestion ─────────────────────────────
  private normalizeGenerated(raw: any, topic: string, difficulty: Difficulty): GeneratedQuestion {
    // title
    const title = typeof raw?.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : `${topic[0].toUpperCase() + topic.slice(1)} Challenge`

    // statement
    const statement = typeof raw?.statement === 'string' && raw.statement.trim()
      ? raw.statement.trim()
      : `Solve the given ${topic} algorithmic problem efficiently.`

    // constraints
    const constraints = Array.isArray(raw?.constraints) && raw.constraints.length > 0
      ? raw.constraints.map((c: any) => String(c).trim()).filter(Boolean)
      : ['1 ≤ n ≤ 10^5', 'Time complexity: O(n log n)']

    // inputFormat / outputFormat
    const inputFormat = typeof raw?.inputFormat === 'string' && raw.inputFormat.trim()
      ? raw.inputFormat.trim()
      : 'Standard line-separated input values.'

    const outputFormat = typeof raw?.outputFormat === 'string' && raw.outputFormat.trim()
      ? raw.outputFormat.trim()
      : 'Print the computed answer to standard output.'

    // comparisonMode — default token for whitespace-tolerant matching
    const comparisonMode: 'exact' | 'token' | 'json' =
      raw?.comparisonMode === 'exact' ? 'exact'
      : raw?.comparisonMode === 'json' ? 'json'
      : 'token'

    // examples — support both {input,output} and {input,output,explanation}
    const rawExamples = Array.isArray(raw?.examples) && raw.examples.length > 0 ? raw.examples : []
    const examples = rawExamples.length > 0
      ? rawExamples.map((ex: any) => ({
          input: typeof ex?.input === 'string' ? ex.input.trim() : String(ex?.input ?? '').trim(),
          output: (typeof ex?.output === 'string' ? ex.output : typeof ex?.expectedOutput === 'string' ? ex.expectedOutput : String(ex?.output ?? '')).trim(),
        }))
      : [{ input: '1\n0', output: '0' }]

    // starterCode — ALWAYS override with our controlled starters (no solution leakage)
    const starterCode: Record<ProgrammingLanguage, string> = defaultStarters

    // testCases — deduplicate IDs, enforce types, auto-assign hidden flag
    const rawTestCases = Array.isArray(raw?.testCases) && raw.testCases.length > 0 ? raw.testCases : []
    const seenIds = new Set<string>()
    const testCases = rawTestCases.map((tc: any, index: number) => {
      let id = String(tc?.id ?? index + 1).trim()
      if (!id || seenIds.has(id)) id = `tc-${index + 1}`
      seenIds.add(id)

      const name = typeof tc?.name === 'string' && tc.name.trim()
        ? tc.name.trim()
        : `Test Case ${index + 1}`

      const input = typeof tc?.input === 'string'
        ? tc.input.trim()
        : String(tc?.input ?? '').trim()

      const expectedOutput = typeof tc?.expectedOutput === 'string'
        ? tc.expectedOutput.trim()
        : String(tc?.expectedOutput ?? '').trim()

      const hidden = typeof tc?.hidden === 'boolean' ? tc.hidden : index >= 5

      return { id, name, input, expectedOutput, hidden }
    })

    // Ensure at least 2 hidden cases exist
    if (testCases.length >= 2 && !testCases.some((t: any) => t.hidden)) {
      testCases[testCases.length - 1].hidden = true
      if (testCases.length >= 3) testCases[testCases.length - 2].hidden = true
    }

    const referenceSolution = typeof raw?.referenceSolution === 'string' && raw.referenceSolution.trim().length > 10
      ? raw.referenceSolution.trim()
      : undefined

    return { title, statement, constraints, inputFormat, outputFormat, comparisonMode, examples, starterCode, testCases, referenceSolution }
  }

  // ── Strip markdown/BOM and sanitize unescaped chars in JSON ─────────────
  private cleanJson(text: string): string {
    let cleaned = text
      .replace(/^\uFEFF/, '')               // BOM
      .replace(/^```(?:json)?\s*/i, '')     // opening fence
      .replace(/```\s*$/m, '')              // closing fence
      .trim()

    // Try standard parse first
    try {
      JSON.parse(cleaned)
      return cleaned
    } catch {
      // Proceed to repair
    }

    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

    let inString = false
    let escaped = false
    let result = ''

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i]
      if (char === '"' && !escaped) {
        inString = !inString
        result += char
      } else if (inString) {
        if (char === '\\') {
          escaped = !escaped
          result += char
        } else {
          escaped = false
          if (char === '\n') result += '\\n'
          else if (char === '\r') { /* skip */ }
          else if (char === '\t') result += '\\t'
          else result += char
        }
      } else {
        escaped = false
        result += char
      }
    }
    return result
  }

  // ── Main generation method ────────────────────────────────────────────────
  async generate(input: {
    topic: string
    difficulty: Difficulty
    excludeTitles?: string[]
    categories?: string[]
    customPrompt?: string
  }): Promise<GeneratedQuestion> {
    const candidateModels = [
      this.model || 'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.8-flash',
    ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i)

    const seed = randomUUID()
    const timestamp = Date.now()

    // Build exclusion clause
    const exclusionClause = input.excludeTitles && input.excludeTitles.length > 0
      ? `\nDo NOT generate a problem similar to any of these previously seen titles:\n${input.excludeTitles.map(t => `  • ${t}`).join('\n')}\n`
      : ''

    // Build category/topic line
    const topicLine = input.categories && input.categories.length > 1
      ? `Categories (combine ALL into one coherent problem): ${input.categories.join(', ')}`
      : `Category: ${input.topic}`

    // User custom requirement
    const customLine = input.customPrompt?.trim()
      ? `\nUser requirement: ${input.customPrompt.trim()}`
      : ''

    const userPrompt = `${topicLine}
Difficulty: ${input.difficulty}${customLine}
Session seed (use to ensure uniqueness): ${seed}
Timestamp: ${timestamp}
${exclusionClause}
Now follow all 5 steps and produce the JSON output.`

    const maxRetries = candidateModels.length * 2  // try each model twice before giving up
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentModel = candidateModels[attempt % candidateModels.length]

      try {
        const response = await this.client.models.generateContent({
          model: currentModel,
          contents: `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        })

        const text = response.text?.trim()
        if (!text) {
          console.warn(`[GeminiProvider] Empty response from ${currentModel} (attempt ${attempt + 1})`)
          lastError = new Error('Empty response')
          await this.delay(500)
          continue
        }

        let rawObj: unknown
        try {
          rawObj = JSON.parse(this.cleanJson(text))
        } catch {
          console.warn(`[GeminiProvider] JSON parse failed from ${currentModel} (attempt ${attempt + 1})`)
          lastError = new Error('JSON parse failed')
          await this.delay(500)
          continue
        }

        const normalized = this.normalizeGenerated(rawObj, input.topic, input.difficulty)
        const parsed = generatedQuestionSchema.safeParse(normalized)

        if (!parsed.success) {
          console.warn(
            `[GeminiProvider] Schema validation failed from ${currentModel} (attempt ${attempt + 1}):`,
            parsed.error.flatten(),
          )
          lastError = new Error('Schema validation failed')
          await this.delay(500)
          continue
        }

        // Extra sanity: reject if all visible test cases have empty expectedOutput
        const visibleCases = parsed.data.testCases.filter(tc => !tc.hidden)
        const hasValidOutputs = visibleCases.some(tc => tc.expectedOutput.trim().length > 0)
        if (!hasValidOutputs) {
          console.warn(`[GeminiProvider] All visible test cases have empty outputs (attempt ${attempt + 1})`)
          lastError = new Error('Empty test case outputs')
          await this.delay(500)
          continue
        }

        console.info(`[GeminiProvider] Generated "${parsed.data.title}" using ${currentModel} (attempt ${attempt + 1})`)
        return parsed.data

      } catch (error) {
        if (error instanceof HttpError) throw error

        const status = typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as any).status)
          : undefined

        // Don't retry on permanent errors
        if (status === 429) throw new HttpError(429, 'AI provider quota exhausted. Please try again later.', 'AI_RATE_LIMITED')
        if (status === 401 || status === 403) throw new HttpError(502, 'AI provider authentication failed. Check GEMINI_API_KEY.', 'AI_AUTH_FAILED')

        const message = error instanceof Error ? error.message : String(error)
        console.error(`[GeminiProvider] ${currentModel} attempt ${attempt + 1} failed: ${message}`)
        lastError = error
        await this.delay(400)
      }
    }

    // All attempts exhausted
    if (lastError instanceof Error && lastError.message === 'JSON parse failed') {
      throw new HttpError(502, 'AI response could not be parsed as JSON. Please try again.', 'AI_INVALID_JSON')
    }
    if (lastError instanceof Error && lastError.message === 'Schema validation failed') {
      throw new HttpError(502, 'AI returned an incomplete question. Please try again.', 'AI_INVALID_RESPONSE')
    }
    throw new HttpError(503, 'AI question provider is temporarily unavailable.', 'AI_PROVIDER_UNAVAILABLE')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

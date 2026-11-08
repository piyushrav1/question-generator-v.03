import test from 'node:test'
import assert from 'node:assert/strict'
import { generatedQuestionSchema } from '../src/questionSchemas.js'

test('generatedQuestionSchema validates a complete well-formed question', () => {
  const validQuestion = {
    title: 'Two Sum Problem',
    statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9', '-10^9 <= target <= 10^9'],
    inputFormat: 'The first line contains N. The second line contains N integers. The third line contains target.',
    outputFormat: 'Print the two zero-based indices separated by a space.',
    comparisonMode: 'token' as const,
    referenceSolution: 'def solve():\n    pass',
    examples: [
      { input: '4\n2 7 11 15\n9', output: '0 1' },
    ],
    starterCode: {
      Python: 'def solve():\n    pass',
      JavaScript: 'function solve() {}',
      Java: 'public class Main { public static void main(String[] args) {} }',
      'C++': 'int main() { return 0; }',
    },
    testCases: [
      { id: 'tc-1', name: 'Sample 1', input: '4\n2 7 11 15\n9', expectedOutput: '0 1', hidden: false },
      { id: 'tc-2', name: 'Sample 2', input: '3\n3 2 4\n6', expectedOutput: '1 2', hidden: false },
      { id: 'tc-3', name: 'Hidden 1', input: '2\n3 3\n6', expectedOutput: '0 1', hidden: true },
    ],
  }

  const parsed = generatedQuestionSchema.safeParse(validQuestion)
  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.equal(parsed.data.title, 'Two Sum Problem')
    assert.equal(parsed.data.testCases.length, 3)
  }
})

test('generatedQuestionSchema rejects duplicate test case IDs', () => {
  const duplicateIdQuestion = {
    title: 'Valid Title Here',
    statement: 'A sufficiently long problem statement for testing schema validation rules properly.',
    constraints: ['1 <= N <= 100'],
    examples: [{ input: '1', output: '1' }],
    starterCode: {
      Python: 'def solve(): pass',
      JavaScript: 'function solve() {}',
      Java: 'class Main {}',
      'C++': 'int main() {}',
    },
    testCases: [
      { id: 'same-id', name: 'Test 1', input: '1', expectedOutput: '1', hidden: false },
      { id: 'same-id', name: 'Test 2', input: '2', expectedOutput: '2', hidden: false },
      { id: 'different-id', name: 'Test 3', input: '3', expectedOutput: '3', hidden: true },
    ],
  }

  const parsed = generatedQuestionSchema.safeParse(duplicateIdQuestion)
  assert.equal(parsed.success, false)
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.message.includes('unique'))
    assert.ok(issue, 'Should report non-unique test case id')
  }
})

test('generatedQuestionSchema rejects fewer than 3 test cases', () => {
  const fewTestsQuestion = {
    title: 'Valid Title Here',
    statement: 'A sufficiently long problem statement for testing schema validation rules properly.',
    constraints: ['1 <= N <= 100'],
    examples: [{ input: '1', output: '1' }],
    starterCode: {
      Python: 'def solve(): pass',
      JavaScript: 'function solve() {}',
      Java: 'class Main {}',
      'C++': 'int main() {}',
    },
    testCases: [
      { id: 'tc-1', name: 'Test 1', input: '1', expectedOutput: '1', hidden: false },
      { id: 'tc-2', name: 'Test 2', input: '2', expectedOutput: '2', hidden: false },
    ],
  }

  const parsed = generatedQuestionSchema.safeParse(fewTestsQuestion)
  assert.equal(parsed.success, false)
})

test('cleanJson sanitizer handles markdown code blocks and raw control characters', () => {
  const rawWithFences = '```json\n{\n  "title": "Cleaned Title",\n  "code": "print(\\"hello\\\\nworld\\")"\n}\n```'
  const cleaned = rawWithFences
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/m, '')
    .trim()

  const parsed = JSON.parse(cleaned)
  assert.equal(parsed.title, 'Cleaned Title')
})

import { z } from 'zod'

export const generatedQuestionSchema = z.object({
  title: z.string().trim().min(3).max(150),
  statement: z.string().trim().min(20).max(30_000),
  constraints: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  inputFormat: z.string().trim().min(5).max(2000).optional(),
  outputFormat: z.string().trim().min(3).max(2000).optional(),
  comparisonMode: z.enum(['exact', 'token', 'json']).optional().default('token'),
  referenceSolution: z.string().trim().min(10).optional(),
  examples: z.array(z.object({
    input: z.string().trim().min(1).max(10_000),
    output: z.string().trim().min(1).max(10_000),
  })).min(1).max(10),
  starterCode: z.object({
    Python: z.string().trim().min(10).max(10_000),
    JavaScript: z.string().trim().min(10).max(10_000),
    Java: z.string().trim().min(10).max(10_000),
    'C++': z.string().trim().min(10).max(10_000),
  }),
  testCases: z.array(z.object({
    id: z.string().min(1).max(50),
    name: z.string().min(1).max(100),
    input: z.string().max(50_000),
    expectedOutput: z.string().max(50_000),
    hidden: z.boolean(),
  })).min(3).max(100),
}).superRefine((question, context) => {
  const ids = new Set<string>()
  for (const [index, testCase] of question.testCases.entries()) {
    if (ids.has(testCase.id)) {
      context.addIssue({ code: 'custom', message: 'Test-case ids must be unique.', path: ['testCases', index, 'id'] })
    }
    ids.add(testCase.id)
    if (typeof testCase.input !== 'string') {
      context.addIssue({ code: 'custom', message: 'Test-case input must be a string.', path: ['testCases', index, 'input'] })
    }
    if (typeof testCase.expectedOutput !== 'string') {
      context.addIssue({ code: 'custom', message: 'Test-case expectedOutput must be a string.', path: ['testCases', index, 'expectedOutput'] })
    }
  }
})

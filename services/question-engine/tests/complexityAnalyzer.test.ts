import test from 'node:test'
import assert from 'node:assert/strict'
import { ComplexityAnalyzer } from '../src/complexityAnalyzer.js'

test('ComplexityAnalyzer extracts maxN from exponential and standard constraints', () => {
  const constraints1 = ['1 <= N <= 10^5', '-10^9 <= nums[i] <= 10^9']
  assert.equal(ComplexityAnalyzer.extractMaxN(constraints1), 100_000)

  const constraints2 = ['2 <= nums.length <= 10^4', 'target <= 10^9']
  assert.equal(ComplexityAnalyzer.extractMaxN(constraints2), 10_000)

  const constraints3 = ['1 <= n <= 500', '1 <= k <= 500']
  assert.equal(ComplexityAnalyzer.extractMaxN(constraints3), 500)

  const constraints4 = ['No explicit upper bound mentioned']
  assert.equal(ComplexityAnalyzer.extractMaxN(constraints4), null)
})

test('ComplexityAnalyzer derives correct complexity limits based on budget', () => {
  const reqsLarge = ComplexityAnalyzer.deriveRequirements(100_000)
  assert.equal(reqsLarge.recommendedComplexity, 'O(N log N)')
  assert.ok(reqsLarge.acceptableComplexities.includes('O(N)'))
  assert.ok(reqsLarge.unacceptableComplexities.includes('O(N^2)'))

  const reqsMedium = ComplexityAnalyzer.deriveRequirements(500)
  assert.equal(reqsMedium.recommendedComplexity, 'O(N^3)')
  assert.ok(reqsMedium.acceptableComplexities.includes('O(N^2)'))
  assert.ok(reqsMedium.unacceptableComplexities.includes('O(2^N)'))

  const reqsSmall = ComplexityAnalyzer.deriveRequirements(20)
  assert.equal(reqsSmall.recommendedComplexity, 'O(2^N)')
  assert.ok(reqsSmall.acceptableComplexities.includes('O(N^2)'))
})

test('ComplexityAnalyzer validates viable vs TLE complexities', () => {
  const constraints = ['1 <= N <= 10^5', '1 <= A[i] <= 10^6']

  // O(N^2) is unacceptable for N = 10^5
  const resQuadratic = ComplexityAnalyzer.validate(constraints, 'O(N^2)')
  assert.equal(resQuadratic.valid, false)
  assert.ok(resQuadratic.reason.includes('Time Limit Exceeded'))

  // O(N log N) is acceptable for N = 10^5
  const resLinearithmic = ComplexityAnalyzer.validate(constraints, 'O(N log N)')
  assert.equal(resLinearithmic.valid, true)

  // O(N) is acceptable for N = 10^5
  const resLinear = ComplexityAnalyzer.validate(constraints, 'O(N)')
  assert.equal(resLinear.valid, true)

  // For N <= 500, O(N^2) is valid
  const resSmallValid = ComplexityAnalyzer.validate(['1 <= N <= 500'], 'O(N^2)')
  assert.equal(resSmallValid.valid, true)
})

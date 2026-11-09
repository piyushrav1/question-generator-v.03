export type ComplexityClass =
  | 'O(1)'
  | 'O(log N)'
  | 'O(N)'
  | 'O(N log N)'
  | 'O(N^2)'
  | 'O(N^3)'
  | 'O(2^N)'
  | 'O(N!)'

export interface ComplexityRequirement {
  maxN: number
  acceptableComplexities: ComplexityClass[]
  recommendedComplexity: ComplexityClass
  unacceptableComplexities: ComplexityClass[]
}

export class ComplexityAnalyzer {
  /**
   * Extracts maximum input size N from problem constraints strings.
   * Filters out element value bounds (e.g. -10^9 <= nums[i] <= 10^9, target <= 10^6).
   */
  static extractMaxN(constraints: string[]): number | null {
    let largestN = 0

    for (const c of constraints) {
      // Skip value/element bounds like nums[i], arr[i], target, values
      if (/\[i\]|\[j\]|\bval\b|\bvalue\b|\btarget\b|\bcoins\[/i.test(c)) {
        continue
      }

      // Check scientific / exponential notation: 10^5, 10^6, 2*10^5, etc.
      const expMatch = c.match(/(?:<=|<)\s*([0-9]+(?:\.[0-9]+)?)?\s*\*?\s*10\^([0-9]+)/i)
      if (expMatch) {
        const factor = expMatch[1] ? parseFloat(expMatch[1]) : 1
        const power = parseInt(expMatch[2], 10)
        const val = factor * Math.pow(10, power)
        if (val > largestN) largestN = val
        continue
      }

      // Check standard decimal limits (e.g. <= 100000 or <= 500)
      const matches = c.matchAll(/(?:<=|<)\s*([0-9][0-9,]*)/g)
      for (const m of matches) {
        const cleaned = m[1].replace(/,/g, '')
        const val = parseInt(cleaned, 10)
        if (val > largestN && val <= 10_000_000) {
          largestN = val
        }
      }
    }

    return largestN > 0 ? largestN : null
  }

  /**
   * Maps maximum input size N to competitive programming Big-O limits.
   * Assumes ~10^8 operations per second execution budget.
   */
  static deriveRequirements(maxN: number): ComplexityRequirement {
    if (maxN <= 12) {
      return {
        maxN,
        recommendedComplexity: 'O(N!)',
        acceptableComplexities: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)', 'O(N^2)', 'O(2^N)', 'O(N!)'],
        unacceptableComplexities: [],
      }
    }
    if (maxN <= 25) {
      return {
        maxN,
        recommendedComplexity: 'O(2^N)',
        acceptableComplexities: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)', 'O(N^2)', 'O(2^N)'],
        unacceptableComplexities: ['O(N!)'],
      }
    }
    if (maxN <= 500) {
      return {
        maxN,
        recommendedComplexity: 'O(N^3)',
        acceptableComplexities: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)', 'O(N^2)', 'O(N^3)'],
        unacceptableComplexities: ['O(2^N)', 'O(N!)'],
      }
    }
    if (maxN <= 5000) {
      return {
        maxN,
        recommendedComplexity: 'O(N^2)',
        acceptableComplexities: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)', 'O(N^2)'],
        unacceptableComplexities: ['O(N^3)', 'O(2^N)', 'O(N!)'],
      }
    }
    if (maxN <= 200_000) {
      return {
        maxN,
        recommendedComplexity: 'O(N log N)',
        acceptableComplexities: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
        unacceptableComplexities: ['O(N^2)', 'O(N^3)', 'O(2^N)', 'O(N!)'],
      }
    }
    return {
      maxN,
      recommendedComplexity: 'O(N)',
      acceptableComplexities: ['O(1)', 'O(log N)', 'O(N)'],
      unacceptableComplexities: ['O(N^2)', 'O(N^3)', 'O(2^N)', 'O(N!)'],
    }
  }

  /**
   * Validates whether a stated time complexity satisfies the problem's input size constraints.
   */
  static validate(constraints: string[], statedComplexity: string): { valid: boolean; reason: string } {
    const maxN = this.extractMaxN(constraints)
    if (maxN === null) {
      return { valid: true, reason: 'No upper bound on N found in constraints.' }
    }

    const reqs = this.deriveRequirements(maxN)
    const normalized = statedComplexity.trim().toUpperCase().replace(/\s+/g, '')

    for (const unacceptable of reqs.unacceptableComplexities) {
      const target = unacceptable.toUpperCase().replace(/\s+/g, '')
      if (normalized === target || normalized.includes(target)) {
        return {
          valid: false,
          reason: `Input size N <= ${maxN} will cause Time Limit Exceeded (TLE) with ${unacceptable}. Acceptable: ${reqs.acceptableComplexities.join(', ')}.`,
        }
      }
    }

    return {
      valid: true,
      reason: `Stated complexity ${statedComplexity} is viable for input size N <= ${maxN}.`,
    }
  }
}

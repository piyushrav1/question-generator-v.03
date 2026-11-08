import type { QuestionDto } from '../../../packages/shared/src/types.js'

export const curatedQuestions: QuestionDto[] = [
  {
    id: 'curated-stacks-next-greater',
    title: 'Daily Temperatures (Next Greater Element)',
    difficulty: 'medium',
    topic: 'stacks',
    statement: 'Given an array of integers temperatures representing the daily temperatures, return an array answer such that answer[i] is the number of days you have to wait after the i-th day to get a warmer temperature. If there is no future day for which this is possible, keep answer[i] == 0 instead.',
    inputFormat: 'The first line contains an integer N, the number of days. The second line contains N space-separated integers representing the daily temperatures.',
    outputFormat: 'Print N space-separated integers representing the number of days to wait for a warmer temperature for each day.',
    constraints: [
      '1 <= N <= 10^5',
      '30 <= temperatures[i] <= 100',
      'Time complexity target: O(N)',
      'Space complexity target: O(N)',
    ],
    examples: [
      {
        input: '8\n73 74 75 71 69 72 76 73',
        output: '1 1 4 2 1 1 0 0',
      },
      {
        input: '4\n30 40 50 60',
        output: '1 1 1 0',
      },
    ],
    comparisonMode: 'token',
    starterCode: {
      Python: `import sys\n\ndef solve():\n    input = sys.stdin.read\n    data = input().split()\n    if not data: return\n    n = int(data[0])\n    temps = [int(x) for x in data[1:n+1]]\n    # Implement monotonic stack solution\n    pass\n\nif __name__ == '__main__':\n    solve()`,
      JavaScript: `const fs = require('fs');\nfunction solve() {\n  const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!input[0]) return;\n  const n = Number(input[0]);\n  const temps = input.slice(1, n + 1).map(Number);\n  // Implement monotonic stack solution\n}\nsolve();`,
      Java: `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        int n = Integer.parseInt(line.trim());\n        // Implement monotonic stack solution\n    }\n}`,
      'C++': `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> temps(n);\n    for (int i = 0; i < n; i++) cin >> temps[i];\n    // Implement monotonic stack solution\n    return 0;\n}`,
    },
    testCases: [
      { id: 'curated-stack-1', name: 'Sample 1', input: '8\n73 74 75 71 69 72 76 73', expectedOutput: '1 1 4 2 1 1 0 0', hidden: false },
      { id: 'curated-stack-2', name: 'Sample 2', input: '4\n30 40 50 60', expectedOutput: '1 1 1 0', hidden: false },
      { id: 'curated-stack-3', name: 'Decreasing Sequence', input: '5\n90 80 70 60 50', expectedOutput: '0 0 0 0 0', hidden: true },
      { id: 'curated-stack-4', name: 'Single Day', input: '1\n55', expectedOutput: '0', hidden: true },
    ],
  },
  {
    id: 'curated-dp-coin-change',
    title: 'Coin Change (Minimum Coins)',
    difficulty: 'medium',
    topic: 'dynamic-programming',
    statement: 'You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money. Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1. You may assume that you have an infinite number of each kind of coin.',
    inputFormat: 'The first line contains two integers: N (number of coin types) and amount. The second line contains N space-separated integers representing the coin denominations.',
    outputFormat: 'Print a single integer representing the minimum coins required, or -1 if impossible.',
    constraints: [
      '1 <= N <= 12',
      '1 <= coins[i] <= 2^31 - 1',
      '0 <= amount <= 10^4',
    ],
    examples: [
      {
        input: '3 11\n1 2 5',
        output: '3',
      },
      {
        input: '1 3\n2',
        output: '-1',
      },
    ],
    comparisonMode: 'token',
    starterCode: {
      Python: `import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    if not data: return\n    n, amount = int(data[0]), int(data[1])\n    coins = [int(x) for x in data[2:n+2]]\n    # Implement dynamic programming solution\n    pass\n\nif __name__ == '__main__':\n    solve()`,
      JavaScript: `const fs = require('fs');\nfunction solve() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens[0]) return;\n  const n = Number(tokens[0]);\n  const amount = Number(tokens[1]);\n  const coins = tokens.slice(2, n + 2).map(Number);\n  // Implement dynamic programming solution\n}\nsolve();`,
      Java: `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int amount = sc.nextInt();\n        int[] coins = new int[n];\n        for (int i = 0; i < n; i++) coins[i] = sc.nextInt();\n        // Implement dynamic programming solution\n    }\n}`,
      'C++': `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n, amount;\n    if (!(cin >> n >> amount)) return 0;\n    vector<int> coins(n);\n    for (int i = 0; i < n; i++) cin >> coins[i];\n    // Implement dynamic programming solution\n    return 0;\n}`,
    },
    testCases: [
      { id: 'curated-dp-1', name: 'Sample 1', input: '3 11\n1 2 5', expectedOutput: '3', hidden: false },
      { id: 'curated-dp-2', name: 'Sample 2', input: '1 3\n2', expectedOutput: '-1', hidden: false },
      { id: 'curated-dp-3', name: 'Zero Amount', input: '1 0\n1', expectedOutput: '0', hidden: true },
      { id: 'curated-dp-4', name: 'Large Coins Impossible', input: '3 7\n2 4 6', expectedOutput: '-1', hidden: true },
    ],
  },
  {
    id: 'curated-arrays-two-sum',
    title: 'Two Sum Target Pair',
    difficulty: 'easy',
    topic: 'arrays',
    statement: 'Given an array of integers nums and an integer target, find the two distinct indices i and j (0-indexed) such that nums[i] + nums[j] == target. Return the indices sorted in ascending order. You may assume that each input has exactly one valid solution.',
    inputFormat: 'The first line contains two integers: N (size of array) and target. The second line contains N space-separated integers.',
    outputFormat: 'Print the two 0-based indices separated by a space.',
    constraints: [
      '2 <= N <= 10^4',
      '-10^9 <= nums[i] <= 10^9',
      '-10^9 <= target <= 10^9',
    ],
    examples: [
      {
        input: '4 9\n2 7 11 15',
        output: '0 1',
      },
      {
        input: '3 6\n3 2 4',
        output: '1 2',
      },
    ],
    comparisonMode: 'token',
    starterCode: {
      Python: `import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    if not data: return\n    n, target = int(data[0]), int(data[1])\n    nums = [int(x) for x in data[2:n+2]]\n    # Implement two sum solution\n    pass\n\nif __name__ == '__main__':\n    solve()`,
      JavaScript: `const fs = require('fs');\nfunction solve() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens[0]) return;\n  const n = Number(tokens[0]);\n  const target = Number(tokens[1]);\n  const nums = tokens.slice(2, n + 2).map(Number);\n  // Implement two sum solution\n}\nsolve();`,
      Java: `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int target = sc.nextInt();\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();\n        // Implement two sum solution\n    }\n}`,
      'C++': `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n, target;\n    if (!(cin >> n >> target)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    // Implement two sum solution\n    return 0;\n}`,
    },
    testCases: [
      { id: 'curated-arr-1', name: 'Sample 1', input: '4 9\n2 7 11 15', expectedOutput: '0 1', hidden: false },
      { id: 'curated-arr-2', name: 'Sample 2', input: '3 6\n3 2 4', expectedOutput: '1 2', hidden: false },
      { id: 'curated-arr-3', name: 'Duplicate Numbers', input: '2 6\n3 3', expectedOutput: '0 1', hidden: true },
      { id: 'curated-arr-4', name: 'Negative Numbers', input: '4 -8\n-3 -5 2 7', expectedOutput: '0 1', hidden: true },
    ],
  },
]

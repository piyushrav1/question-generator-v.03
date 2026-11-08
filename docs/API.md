# TestMeMan API Reference

Base URL for local development: `http://127.0.0.1:4000`

---

## 1. System Health & Diagnostics

```http
GET /api/health
```

Returns runtime health, uptime, memory statistics, and integration readiness.

### Success Response (200 OK)

```json
{
  "status": "ok",
  "service": "TestMeMan API",
  "timestamp": "2026-11-08T18:30:00.000Z",
  "uptimeSeconds": 245,
  "environment": "development",
  "system": {
    "nodeVersion": "v20.16.0",
    "platform": "win32",
    "memory": {
      "rssMb": 84.2,
      "heapUsedMb": 42.1
    }
  },
  "integrations": {
    "geminiConfigured": true,
    "mongoConfigured": false
  }
}
```

---

## 2. Question Management

### Generate a Question

```http
POST /api/questions/generate
Content-Type: application/json
```

#### Request Body

```json
{
  "topic": "stacks",
  "difficulty": "medium",
  "customPrompt": "A problem requiring a monotonic stack to find next greater elements"
}
```

- `topic` *(string, required)*: Category (`arrays`, `stacks`, `trees`, `graphs`, `dynamic-programming`, etc.)
- `difficulty` *(string, required)*: `easy`, `medium`, or `hard`
- `customPrompt` *(string, optional)*: Specific instructions or problem variations

#### Success Response (200 OK)

Returns a verified `QuestionDto`. Hidden test cases have `expectedOutput` redacted.

```json
{
  "id": "q-17938210-abcdef",
  "title": "Daily Temperatures",
  "difficulty": "medium",
  "topic": "stacks",
  "statement": "Given an array of temperatures...",
  "constraints": ["1 <= N <= 10^5"],
  "inputFormat": "First line contains N...",
  "outputFormat": "Print N space-separated integers...",
  "comparisonMode": "token",
  "examples": [
    { "input": "4\n30 40 50 60", "output": "1 1 1 0" }
  ],
  "starterCode": {
    "Python": "import sys\n...",
    "JavaScript": "const fs = require('fs');\n...",
    "Java": "public class Main {\n...",
    "C++": "#include <bits/stdc++.h>\n..."
  },
  "testCases": [
    { "id": "tc-1", "name": "Sample 1", "input": "4\n30 40 50 60", "expectedOutput": "1 1 1 0", "hidden": false },
    { "id": "tc-2", "name": "Hidden 1", "input": "5\n90 80 70 60 50", "hidden": true }
  ]
}
```

### Get Question by ID

```http
GET /api/questions/:id
```

---

## 3. Submissions & Code Execution

```http
POST /api/submissions
Content-Type: application/json
```

#### Request Body (Standard Evaluation)

```json
{
  "questionId": "q-17938210-abcdef",
  "language": "Python",
  "code": "import sys\n# solution here...",
  "submitted": true
}
```

#### Request Body (Custom Test Run)

```json
{
  "questionId": "q-17938210-abcdef",
  "language": "Python",
  "code": "import sys\n# solution here...",
  "submitted": false,
  "customInput": "4\n20 30 40 50",
  "customExpectedOutput": "1 1 1 0"
}
```

- `language`: `Python`, `JavaScript`, `Java`, or `C++`
- `submitted`: `true` to test against all cases (including hidden), `false` for visible/sample cases only.

#### Success Response (200 OK)

```json
{
  "id": "sub-17938290-xyz",
  "questionId": "q-17938210-abcdef",
  "language": "Python",
  "status": "accepted",
  "submitted": true,
  "totalCases": 4,
  "visiblePassed": 2,
  "visibleTotal": 2,
  "hiddenPassed": 2,
  "hiddenTotal": 2,
  "runtimeMs": 14,
  "caseResults": [
    {
      "id": "tc-1",
      "name": "Sample 1",
      "hidden": false,
      "status": "passed",
      "actualOutput": "1 1 1 0",
      "expectedOutput": "1 1 1 0",
      "runtimeMs": 14
    }
  ]
}
```

Status values: `accepted`, `wrong_answer`, `runtime_error`, `time_limit_exceeded`.

---

## 4. Practice Attempts & Timer State

### Get Active Attempt

```http
GET /api/attempts/active
```

Returns the user's in-progress question attempt, draft code, and countdown timer metadata.

### Update Practice Timer

```http
PATCH /api/attempts/timer
Content-Type: application/json
```

```json
{
  "action": "pause"
}
```

Supported actions: `pause`, `resume`, `reset`, `extend` (with `seconds: 300`).

---

## 5. Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters.",
    "details": {}
  }
}
```

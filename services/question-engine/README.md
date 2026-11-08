# Question Engine

The **Question Engine** is responsible for generating, independently auditing, verifying, and persisting competitive programming questions on the TestMeMan platform.

It implements a **6-stage closed-loop AI verification pipeline** designed to eliminate hallucinations, enforce rigorous competitive programming standards, and ensure 100% mathematical accuracy across all test cases and supported languages.

---

## 6-Stage AI Generation & Verification Pipeline

```text
  ┌────────────────────────────────────────────────────────┐
  │ 1. User Selects Category & Difficulty                  │
  │    (Arrays, Stacks, DP, Graphs, etc. | Easy/Med/Hard)  │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. Gemini Generates Problem Specification              │
  │    - Statement, input/output format, constraints       │
  │    - Sample & hidden test cases (raw stdin)            │
  │    - Reference Python solution                         │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. Independent Question Auditor (Gemini Auditor)       │
  │    - Independent senior CP judge prompt                │
  │    - Audits cycles, edge cases, boundaries, ambiguity  │
  │    - Verdict: APPROVED, REJECTED, or AMBIGUOUS         │
  └───────────┬────────────────────────────────────────────┘
              │ (If REJECTED: critiques fed back to Step 2)
              ▼ (If APPROVED)
  ┌────────────────────────────────────────────────────────┐
  │ 4. Backend Executes Reference Code in Sandbox          │
  │    - Runs Python reference solution in isolated runner │
  │    - Validates execution against all inputs            │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 5. Validate & Compute Real Expected Outputs            │
  │    - Computes authentic stdout from sandbox execution  │
  │    - Replaces AI-generated outputs (0% hallucination)  │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 6. Persist Verified Question to Database               │
  │    - Saves to MongoDB (with in-memory fallback)        │
  │    - Redacts hidden test case outputs from public API  │
  └────────────────────────────────────────────────────────┘
```

---

## Core Architecture & Components

### 1. `questionService.ts` (Pipeline Orchestrator)
- Coordinates question generation requests from API endpoints.
- Orchestrates the 6-step lifecycle: Prompting → Generation → Independent Audit → Sandbox Execution → Output Calculation → Database Persistence.
- Implements **closed-loop retry logic**: if the auditor rejects attempt 1 with specific critiques (e.g. invalid cycle handling or ambiguous constraints), the critique is injected into attempt 2's prompt so the generator immediately corrects it.

### 2. `questionAuditor.ts` (Independent Verification Judge)
- Acts as an independent senior competitive programming judge and software verification engineer.
- Uses a dedicated auditor prompt separate from generation to prevent self-validation bias.
- Rigorously evaluates:
  - Strict vs. non-strict inequalities and tie-breaking rules.
  - Invariant correctness (e.g., XOR sums vs. arithmetic sums).
  - Graph/cycle transitions and recursive base cases.
  - Integer overflow and boundary cases ($N=0$, $N=1$, negative numbers, duplicates).
  - Input/output format consistency and ambiguity.
- Returns structured verdicts:
  - `APPROVED`: Passes all mathematical, logical, and edge-case requirements.
  - `REJECTED`: Fails one or more correctness requirements (with line-by-line feedback).
  - `AMBIGUOUS`: Problem statement admits competing interpretations.

### 3. `geminiProvider.ts` (AI Generation Adapter)
- Interacts with Google Gemini APIs using `@google/genai`.
- Employs resilient model fallback across active Google models:
  `gemini-3.5-flash-lite` $\rightarrow$ `gemini-flash-lite-latest` $\rightarrow$ `gemini-3.5-flash` $\rightarrow$ `gemini-flash-latest` $\rightarrow$ `gemini-3.8-flash`.
- Generates universal raw `stdin` / `stdout` test cases compatible across all languages (Python, JavaScript, Java, C++).
- Includes custom JSON sanitization for escaped newlines, tabs, and multiline Python code strings.

### 4. `questionSchemas.ts` (Contract Validation)
- Zod schemas enforcing strict validation on:
  - Problem title, topic, difficulty, statement, constraints.
  - Input/output format documentation.
  - Structured examples with explanations.
  - Test case collections (up to 100 test cases with visibility flags).
  - Multi-language starter code skeletons (without leaked solutions).
  - Reference Python solution.

### 5. `questionRepository.ts` (Persistence Layer)
- Persistent question storage with dual-engine support:
  - **MongoDB**: Used when `MONGODB_URI` is configured in `apps/api/.env`.
  - **In-Memory Store**: Development fallback with preloaded curated questions for offline testing.
- Enforces data security by ensuring hidden test case outputs and reference solutions are **never leaked** in public question responses.

---

## Universal Multi-Language Support

All generated test cases use raw `stdin` lines and tokens. This ensures problems are 100% interoperable across all supported runtime environments:

| Language | Input Mechanism | Template Style |
|---|---|---|
| **Python 3** | `sys.stdin.readline` | Universal `solve()` runner |
| **JavaScript (Node.js)** | `process.stdin` buffer & line parsing | Universal `readLine()` / `readInts()` |
| **Java 17** | `BufferedReader` + `StringTokenizer` | Standard `Main` entrypoint |
| **C++ (G++20)** | `cin` with fast I/O (`ios_base::sync_with_stdio`) | Standard `main()` |

Starter templates contain clean skeletons (e.g., HackerRank style) and never leak solution logic to the user.

---

## Environment Configuration

Configure the following variables in `apps/api/.env`:

```env
# Gemini API Key for question generation and independent auditor
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Preferred model override (defaults to gemini-3.5-flash-lite with fallback)
GEMINI_MODEL=gemini-3.5-flash-lite

# Optional: MongoDB connection string (falls back to in-memory store if unset)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=testmeman
```

---

## Testing & Verification

Run type checks to verify TypeScript contracts across shared packages:

```powershell
npm.cmd run typecheck
```

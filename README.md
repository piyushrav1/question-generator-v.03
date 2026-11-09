# TestMeMan

TestMeMan is an AI-powered competitive programming and technical interview practice platform. It combines real-time problem generation powered by Google Gemini, an independent AI verification auditor, an isolated multi-language code execution engine, and a Monaco-based coding workspace.

---

## Key Features

- **6-Stage Closed-Loop Question Pipeline**:
  1. Category & difficulty selection (Arrays, Stacks, Trees, DP, Graphs, etc. with Easy/Medium/Hard).
  2. Gemini problem generation with statements, constraints, and raw `stdin` test cases.
  3. **Independent Question Auditor**: A dedicated senior CP judge prompt that scrutinizes mathematical invariants, edge cases, cycle handling, and ambiguity before approving.
  4. Sandbox execution of reference Python solutions.
  5. Authentic expected output computation from reference execution (eliminating hallucinated outputs).
  6. Persistence to database with hidden test cases strictly redacted from public payloads.
- **Universal Multi-Language Runtime**:
  - Full execution support for **Python 3**, **JavaScript (Node.js)**, **Java 17**, and **C++ (G++20)**.
  - Universal raw `stdin` tokenization compatible across all four languages without boilerplate format mismatches.
  - Solution skeletons provided via starter code without leaking answers.
- **Monaco Code Workspace**:
  - Full Monaco editor integration with theme switching (Light, Dark, System), configurable font size, and word wrap.
  - Pinned bottom footer with **Custom test cases**, **Run**, and **Submit** actions.
  - Dual quick-action **Run** and **Submit** controls in the editor toolbar.
  - Keyboard shortcut: `Ctrl + Enter` (or `Cmd + Enter`) to run visible tests immediately.
  - Always-visible test case browser, custom input runner, and detailed per-test execution metrics (runtime ms, actual vs. expected output).
  - **Visual Runtime Badges & Diff Viewer**: Automatic categorization of execution performance (`Fast` < 50ms, `Good` 50-200ms, `Slow` > 200ms) and side-by-side output diff inspection for mismatched test cases.
  - **Code Reset with Safety Modal**: Ability to reset current editor code to problem starter template with accidental discard protection.
  - Interactive practice timer with pause, resume, extend (+5m), and reset controls.
- **Enterprise Platform Robustness**:
  - **Progressive 3-Tier Hint Engine**: Tier 1 (Intuition), Tier 2 (Strategy), and Tier 3 (Edge Cases) tailored per topic.
  - **Theoretical Complexity Analyzer**: Big-O constraint validator analyzing $N$ boundaries against $10^8$ operations per second budget.
  - **Sliding-Window Rate Limiter**: Configurable IP-based rate limiting on compute & generation endpoints with RFC `X-RateLimit-*` headers.
  - **Infinite Loop Safeguards**: Execution engine with 100KB buffer bounds and hard wall-clock execution timeouts.
- **Dual Persistence & Paginated Search**:
  - Production-ready MongoDB repository and in-memory development repository.
  - Paginated search API (`GET /api/questions`) with topic filtering, difficulty filtering, and text querying.
  - Shared domain models and type guards (`packages/shared`).

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Monaco Editor (`@monaco-editor/react`), Lucide React.
- **Backend**: Express, TypeScript, Zod, Helmet, Pino HTTP logging.
- **AI Engine**: Google Gemini API (`@google/genai`) with fallback chains across modern models (`gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-3.5-flash`, etc.).
- **Execution Engine**: Sandboxed code runner supporting Python, JavaScript, Java, and C++.
- **Database**: MongoDB with automatic in-memory fallback.

---

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm
- (Optional) Docker (for containerized execution)
- (Optional) MongoDB instance

### Installation & Environment Setup

```powershell
# 1. Install dependencies across all monorepo packages
npm.cmd install

# 2. Set up environment configuration files
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Open `apps/api/.env` and provide your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=4000
# Optional: MONGODB_URI=mongodb://localhost:27017
# Optional: MONGODB_DB_NAME=testmeman
```

### Running the Application

```powershell
# Start both Frontend and API together
npm.cmd run dev:all
```

- **Frontend Application**: `http://localhost:5173`
- **Backend API**: `http://localhost:4000`
- **API Health Check**: `http://localhost:4000/api/health`

Alternatively, you can run them in separate terminals:

```powershell
# Terminal 1: API Server
npm.cmd run server

# Terminal 2: Web Client
npm.cmd run dev
```

---

## Available Commands

| Command | Description |
|---|---|
| `npm.cmd run dev:all` | Start both the frontend and backend concurrently |
| `npm.cmd run dev` | Start the Vite development server for the web app |
| `npm.cmd run server` | Start the Express backend with hot-reload (`tsx watch`) |
| `npm.cmd run typecheck` | Perform TypeScript type checks across client and server |
| `npm.cmd run build` | Build the web frontend for production |
| `npm.cmd run check` | Run both type checks and the production build |

---

## Project Structure

```text
├── apps/
│   ├── api/                     # Express REST API
│   │   ├── server/src/          # Routes, controllers, middlewares, and server bootstrap
│   │   └── tsconfig.server.json
│   └── web/                     # React 19 + Vite frontend
│       ├── src/                 # Workspace UI, Monaco configuration, services
│       └── vite.config.ts
├── services/
│   ├── question-engine/         # AI generation, independent CP auditor, repository
│   │   ├── src/geminiProvider.ts
│   │   ├── src/questionAuditor.ts
│   │   ├── src/questionService.ts
│   │   └── src/questionRepository.ts
│   └── execution-engine/        # Code execution, Docker sandbox runner, submission evaluator
│       ├── src/codeRunner.ts
│       ├── src/dockerCodeRunner.ts
│       └── src/submissionService.ts
├── packages/
│   ├── shared/                  # Common TypeScript interfaces, DTOs, and schemas
│   └── ui/                      # Reusable UI component library
└── docs/
    └── architecture/            # Architecture decision records and platform specs
```

---

## Security & Production Guidelines

- **Sandbox Isolation**: Never execute untrusted user-submitted code directly within the Express server host process. The execution engine is designed to delegate code execution to isolated Docker containers or ephemeral sandbox runners with strict CPU, memory, timeout, and network isolation limits.
- **Credential & Test Case Protection**: Hidden test case outputs and reference solutions are scrubbed by `QuestionRepository` and `QuestionService` prior to returning responses to client applications.

---

## License

MIT

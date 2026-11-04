import type { ProgrammingLanguage, SubmissionCaseResultDto, SubmissionRequest, SubmissionResultDto } from '../../../packages/shared/src/types.js'
import { QuestionRepository } from '../../question-engine/src/questionRepository.js'
import { HttpError } from '../../../packages/shared/src/errors/httpError.js'
import { DockerCodeRunner } from './dockerCodeRunner.js'
import type { CodeRunner } from './codeRunner.js'

export class SubmissionService {
  constructor(
    private readonly repository: QuestionRepository,
    private readonly runner: CodeRunner = new DockerCodeRunner(),
    private readonly timeoutMs = 3000,
  ) {}

  async evaluate(input: SubmissionRequest, ownerId = 'anonymous'): Promise<SubmissionResultDto> {
    const question = await this.repository.findById(input.questionId)
    if (!question) {
      throw new HttpError(404, 'Question not found.', 'QUESTION_NOT_FOUND')
    }
    const timerMetadata = await this.getSubmissionTimerMetadata(ownerId, input.questionId, input.submitted)

    const mismatch = this.detectLanguageMismatch(input.language, input.code)
    if (mismatch) {
      const mismatchResult: SubmissionResultDto = {
        id: `sub-${Date.now().toString(36)}`,
        questionId: input.questionId,
        language: input.language,
        status: 'runtime_error',
        submitted: input.submitted,
        totalCases: 1,
        visiblePassed: 0,
        visibleTotal: 0,
        hiddenPassed: 0,
        hiddenTotal: 0,
        runtimeMs: 0,
        memoryMb: null,
        message: mismatch,
        ...timerMetadata,
        caseResults: [{
          id: 'language-mismatch',
          name: 'Language check',
          hidden: false,
          status: 'runtime_error',
          actualOutput: undefined,
          expectedOutput: undefined,
          runtimeMs: 0,
        }],
      }
      await this.repository.saveSubmission(ownerId, mismatchResult)
      return mismatchResult
    }

    if (typeof input.customInput === 'string') {
      const result = await this.runner.execute({
        language: input.language,
        code: this.prepareCode(input.language, input.code),
        input: input.customInput,
        timeoutMs: this.timeoutMs,
      })
      const hasExpectedOutput = typeof input.customExpectedOutput === 'string' && input.customExpectedOutput.trim().length > 0
      const comparisonMode = question.comparisonMode ?? 'token'
      const status = result.timedOut
        ? 'time_limit_exceeded'
        : result.runtimeError
          ? 'runtime_error'
          : hasExpectedOutput
            ? this.compareOutput(result.stdout, input.customExpectedOutput ?? '', comparisonMode) ? 'accepted' : 'wrong_answer'
            : 'accepted'
      const mismatch = hasExpectedOutput
        ? this.findMismatch(result.stdout, input.customExpectedOutput ?? '', comparisonMode)
        : undefined
      const customResult: SubmissionResultDto = {
        id: `sub-${Date.now().toString(36)}`,
        questionId: input.questionId,
        language: input.language,
        status,
        submitted: false,
        totalCases: 1,
        visiblePassed: 0,
        visibleTotal: 1,
        hiddenPassed: 0,
        hiddenTotal: 0,
        runtimeMs: result.runtimeMs,
        memoryMb: null,
        message: status === 'time_limit_exceeded'
          ? 'Custom test execution exceeded the allowed time limit.'
          : status === 'runtime_error'
            ? result.stderr || 'Custom test could not be executed.'
            : 'Custom test completed.',
        ...timerMetadata,
        caseResults: [{
          id: 'custom',
          name: 'Custom Test',
          hidden: false,
          status: status === 'accepted' ? 'passed' : status,
          actualOutput: result.stdout.trim(),
          expectedOutput: hasExpectedOutput ? input.customExpectedOutput?.trim() : undefined,
          runtimeMs: result.runtimeMs,
          mismatchLine: mismatch?.line,
          mismatchColumn: mismatch?.column,
        }],
      }
      await this.repository.saveSubmission(ownerId, customResult)
      return customResult
    }

    const visibleCases = question.testCases.filter((testCase) => !testCase.hidden)
    const hiddenCases = input.submitted ? question.testCases.filter((testCase) => testCase.hidden) : []
    const comparisonMode = question.comparisonMode ?? 'token'
    const visiblePassed = await this.countPassed(visibleCases, input, comparisonMode)
    const hiddenPassed = await this.countPassed(hiddenCases, input, comparisonMode)
    const runtimeError = visiblePassed.error || hiddenPassed.error
    const timedOut = visiblePassed.timedOut || hiddenPassed.timedOut
    const passedAll = visiblePassed.count === visibleCases.length && hiddenPassed.count === hiddenCases.length
    const status = timedOut
      ? 'time_limit_exceeded'
      : runtimeError
        ? 'runtime_error'
        : passedAll
          ? 'accepted'
          : 'wrong_answer'
    const runtimeValues = [...visiblePassed.runtimeMs, ...hiddenPassed.runtimeMs]

    const result: SubmissionResultDto = {
      id: `sub-${Date.now().toString(36)}`,
      questionId: input.questionId,
      language: input.language,
      status,
      submitted: input.submitted,
      totalCases: question.testCases.length,
      visiblePassed: visiblePassed.count,
      visibleTotal: visibleCases.length,
      hiddenPassed: hiddenPassed.count,
      hiddenTotal: hiddenCases.length,
      runtimeMs: runtimeValues.length ? Math.round(runtimeValues.reduce((sum, value) => sum + value, 0) / runtimeValues.length) : null,
      memoryMb: null,
      caseResults: [...visiblePassed.caseResults, ...hiddenPassed.caseResults],
      message: status === 'accepted'
        ? 'All visible and hidden test cases passed.'
        : status === 'time_limit_exceeded'
          ? 'Execution exceeded the allowed time limit.'
          : status === 'runtime_error'
            ? (visiblePassed.stderr || hiddenPassed.stderr || 'Your submission could not be executed. Check the language and syntax.')
            : 'One or more test cases failed.',
      ...timerMetadata,
    }

    await this.repository.saveSubmission(ownerId, result)
    return result
  }

  private async getSubmissionTimerMetadata(
    ownerId: string,
    questionId: string,
    submitted: boolean,
  ): Promise<Pick<SubmissionResultDto, 'submittedAfterDeadline' | 'remainingSecondsAtSubmission'>> {
    if (!submitted) return {}
    const attempt = await this.repository.findActiveAttempt(ownerId)
    if (!attempt || attempt.questionId !== questionId) return { submittedAfterDeadline: false, remainingSecondsAtSubmission: 0 }

    const timer = this.repository.normalizeTimer(attempt)
    if (timer.status === 'running' && timer.expiresAt) {
      const remainingSeconds = Math.max(0, Math.ceil((Date.parse(timer.expiresAt) - Date.now()) / 1000))
      return {
        submittedAfterDeadline: remainingSeconds === 0,
        remainingSecondsAtSubmission: remainingSeconds,
      }
    }
    return {
      submittedAfterDeadline: timer.status === 'expired',
      remainingSecondsAtSubmission: timer.remainingSeconds,
    }
  }

  // ── Language-mismatch heuristic ───────────────────────────────────────────
  private detectLanguageMismatch(language: ProgrammingLanguage, code: string): string | null {
    const looksCpp = /#include\s*<|using\s+namespace\s+std;|std::|<bits\/stdc\+\+\.h>/.test(code)
    const looksPython = /^\s*(from\s+\S+\s+import|def\s+\w+\s*\(|class\s+Solution\s*:|import\s+sys\b)/m.test(code)
    const looksJava = /\bpublic\s+(class|static)\b.*|import\s+java\./.test(code)
    // JS detection: only flag if there's clear node/browser-specific API, not generic code
    const looksJavaScript = /\b(process\.stdin|readFileSync|console\.log\(|require\s*\()\b/.test(code)

    if (looksCpp && language !== 'C++') {
      return `Language mismatch: C++ syntax detected but ${language} is selected. Switch language to C++.`
    }
    if (looksPython && language !== 'Python') {
      return `Language mismatch: Python syntax detected but ${language} is selected. Switch language to Python.`
    }
    if (looksJava && !looksCpp && !looksJavaScript && language !== 'Java') {
      return `Language mismatch: Java syntax detected but ${language} is selected. Switch language to Java.`
    }
    if (looksJavaScript && !looksCpp && !looksPython && !looksJava && language !== 'JavaScript') {
      return `Language mismatch: JavaScript syntax detected but ${language} is selected. Switch language to JavaScript.`
    }
    return null
  }

  // ── Prepare code — only wrap LeetCode-style class Solution submissions ────
  //
  //   Our generated starter code always includes a proper main/entry point,
  //   so we pass it straight through. We ONLY apply the wrapper heuristics
  //   when the user submits a bare "class Solution" snippet (LeetCode style).
  //
  private prepareCode(language: ProgrammingLanguage, code: string): string {
    if (language === 'JavaScript') {
      // Pass through if the code already handles its own stdin reading
      if (/\b(readFileSync|process\.stdin|stdin)\b/.test(code)) return code
      // Wrap only bare class/function snippets
      return this.prepareJavaScriptCode(code)
    }

    if (language === 'C++') {
      // Pass through if main() is present
      if (/\bint\s+main\s*\(/.test(code)) return code
      return this.prepareCppCode(code)
    }

    if (language === 'Java') {
      // Pass through if main or Main class is present
      if (/\bpublic\s+(?:static\s+)?void\s+main\s*\(/.test(code) || /\bpublic\s+class\s+Main\b/.test(code)) return code
      return this.prepareJavaCode(code)
    }

    // Python: only wrap bare "class Solution" LeetCode style
    if (language !== 'Python' || !/\bclass\s+Solution\b/.test(code)) {
      return code
    }
    return this.preparePythonSolutionCode(code)
  }

  // ── normalizeTestInput ────────────────────────────────────────────────────
  //
  //   Test case inputs are ALWAYS raw plain stdin (line-by-line or tokens).
  //   We do NOT convert them to key=value or JSON — that format was for
  //   LeetCode-style class Solution wrappers only.
  //
  //   This method now only sanitizes line endings and BOM characters.
  //   It passes all other content through unchanged so the runner gets
  //   exactly what the problem's input format specifies.
  //
  private normalizeTestInput(input: string): string {
    return input
      .replace(/\uFEFF/g, '')      // strip BOM if present
      .replace(/\r\n/g, '\n')      // normalize CRLF → LF
      .replace(/\r/g, '\n')        // normalize lone CR → LF
  }

  // ── Output comparison ─────────────────────────────────────────────────────
  private compareOutput(actual: string, expected: string, mode: 'exact' | 'token' | 'json'): boolean {
    const actualText = actual.replace(/\r\n/g, '\n').trimEnd()
    const expectedText = expected.replace(/\r\n/g, '\n').trimEnd()

    if (mode === 'token') {
      // Split on any whitespace, compare token sequences
      const normalizeTokens = (s: string) => s.trim().split(/\s+/).filter(Boolean).join(' ')
      return normalizeTokens(actualText) === normalizeTokens(expectedText)
    }
    if (mode === 'json') {
      try {
        return JSON.stringify(JSON.parse(actualText)) === JSON.stringify(JSON.parse(expectedText))
      } catch {
        return false
      }
    }
    // exact mode: trim trailing whitespace only, preserve internal structure
    return actualText === expectedText
  }

  private findMismatch(actual: string, expected: string, mode: 'exact' | 'token' | 'json'): { line: number; column: number } | undefined {
    if (this.compareOutput(actual, expected, mode)) return undefined
    if (mode === 'json') return { line: 1, column: 1 }

    const actualText = actual.replace(/\r\n/g, '\n').trim()
    const expectedText = expected.replace(/\r\n/g, '\n').trim()
    const sourceText = mode === 'token' ? actualText.split(/\s+/).filter(Boolean).join(' ') : actualText
    const targetText = mode === 'token' ? expectedText.split(/\s+/).filter(Boolean).join(' ') : expectedText

    let index = 0
    while (index < sourceText.length && index < targetText.length && sourceText[index] === targetText[index]) index++
    const prefix = sourceText.slice(0, index)
    const line = prefix.split('\n').length
    const lastBreak = prefix.lastIndexOf('\n')
    return { line, column: index - lastBreak }
  }

  // ── Run test cases against submitted code ─────────────────────────────────
  private async countPassed(
    testCases: Array<{ id: string; name: string; input: string; expectedOutput?: string; hidden: boolean }>,
    input: SubmissionRequest,
    comparisonMode: 'exact' | 'token' | 'json' = 'token',
  ): Promise<{ count: number; error: boolean; timedOut: boolean; runtimeMs: number[]; stderr: string; caseResults: SubmissionCaseResultDto[] }> {
    let count = 0
    let error = false
    let timedOut = false
    let stderr = ''
    const runtimeMs: number[] = []
    const caseResults: SubmissionCaseResultDto[] = []

    const preparedCode = this.prepareCode(input.language, input.code)

    for (const testCase of testCases) {
      const result = await this.runner.execute({
        language: input.language,
        code: preparedCode,
        input: this.normalizeTestInput(testCase.input),
        timeoutMs: this.timeoutMs,
      })
      runtimeMs.push(result.runtimeMs)
      if (result.stderr) stderr = result.stderr
      if (result.timedOut) timedOut = true
      if (result.runtimeError) error = true

      const passed = !result.timedOut && !result.runtimeError
        && this.compareOutput(result.stdout, testCase.expectedOutput ?? '', comparisonMode)
      const mismatch = passed ? undefined : this.findMismatch(result.stdout, testCase.expectedOutput ?? '', comparisonMode)
      if (passed) count++

      caseResults.push({
        id: testCase.id,
        name: testCase.hidden ? 'Hidden Test Case' : testCase.name,
        hidden: testCase.hidden,
        status: result.timedOut
          ? 'time_limit_exceeded'
          : result.runtimeError
            ? 'runtime_error'
            : passed
              ? 'passed'
              : 'wrong_answer',
        actualOutput: testCase.hidden ? undefined : result.stdout.trim(),
        expectedOutput: testCase.hidden ? undefined : testCase.expectedOutput,
        runtimeMs: result.runtimeMs,
        mismatchLine: testCase.hidden ? undefined : mismatch?.line,
        mismatchColumn: testCase.hidden ? undefined : mismatch?.column,
      })
    }

    return { count, error, timedOut, runtimeMs, stderr, caseResults }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LeetCode-style "class Solution" wrapper code (only used when needed)
  // ══════════════════════════════════════════════════════════════════════════

  private preparePythonSolutionCode(code: string): string {
    const futureImport = code.match(/^from\s+__future__\s+import\s+[^\n]+(?:\n|$)/)?.[0] ?? ''
    const sourceWithoutFuture = futureImport ? code.slice(futureImport.length) : code

    return `${futureImport}from typing import Any, Dict, List, Optional, Set, Tuple
${sourceWithoutFuture}

if __name__ == "__main__":
    import ast
    import json
    import re
    import sys

    raw = sys.stdin.read().strip()
    values = {}

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            values.update(parsed)
        elif isinstance(parsed, list):
            values["args"] = [parsed]
    except Exception:
        pass

    for name, value_text in re.findall(
        r"([A-Za-z_]\w*)\s*=\s*(\[[^\]]*\]|-?\d+(?:\.\d+)?)",
        raw,
        re.S,
    ):
        try:
            values[name] = ast.literal_eval(value_text)
        except Exception:
            values[name] = value_text

    if not values:
        parts = [part.strip() for part in raw.splitlines() if part.strip()]
        positional = []
        for part in parts:
            try:
                positional.append(ast.literal_eval(part))
            except Exception:
                positional.append(part)
        values["args"] = positional

    solution = Solution()
    method = next(
        (
            getattr(solution, name)
            for name in dir(solution)
            if not name.startswith("_") and callable(getattr(solution, name))
        ),
        None,
    )

    if method is None:
        print("")
    else:
        function = getattr(method, "__func__", method)
        parameter_names = list(function.__code__.co_varnames[1:function.__code__.co_argcount])
        arguments = []
        fallback = values.get("args", [])
        defaults = function.__defaults__ or ()
        default_names = parameter_names[-len(defaults):] if defaults else []

        for index, parameter_name in enumerate(parameter_names):
            if parameter_name in values:
                arguments.append(values[parameter_name])
            elif index < len(fallback):
                arguments.append(fallback[index])
            elif parameter_name in default_names:
                arguments.append(defaults[default_names.index(parameter_name)])
            else:
                arguments.append(None)

        result = method(*arguments)
        if isinstance(result, (dict, list, tuple)):
            print(json.dumps(result))
        else:
            print(result)
`
  }

  private prepareJavaScriptCode(code: string): string {
    const standalone = code.match(/(?:function\s+([A-Za-z_]\w*)\s*\(([^)]*)\))/)
    const method = code.match(/(?:async\s+)?([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/)
    const methodName = standalone?.[1] ?? method?.[1]
    const parameterText = standalone?.[2] ?? method?.[2] ?? ''
    const parameterNames = parameterText.split(',').map((name) => name.trim().replace(/^.../, '')).filter(Boolean)

    return `${code}

if (typeof require !== "undefined" && require.main === module) {
  let raw = "";
  if (typeof process !== "undefined") {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => execute(raw));
  }

  function execute(raw) {
    raw = raw.trim();
    let values = {};
    if (raw.startsWith("{")) {
      try { values = JSON.parse(raw); } catch (_) {}
    }
    if (raw.startsWith("[") && !raw.includes("=")) {
      try { values.args = [JSON.parse(raw)]; } catch (_) {}
    }
    for (const match of raw.matchAll(/([A-Za-z_]\w*)\s*=\s*(\[[^\]]*\]|-?\d+(?:\.\d+)?)/g)) {
      try { values[match[1]] = JSON.parse(match[2]); } catch (_) { values[match[1]] = match[2]; }
    }
    const names = ${JSON.stringify(parameterNames)};
    const args = names.map((name, index) => {
      if (values[name] !== undefined) return values[name];
      const arrayMatch = raw.match(new RegExp(name + "\\\\s*=\\\\s*(\\\\[[^\\\\]]*\\\\])"));
      if (arrayMatch) { try { return JSON.parse(arrayMatch[1]); } catch (_) {} }
      const valueMatch = raw.match(new RegExp(name + "\\\\s*=\\\\s*(-?\\\\d+(?:\\\\.\\\\d+)?)"));
      if (valueMatch) return Number(valueMatch[1]);
      return values.args?.[index];
    });
    let result;
    if (typeof Solution === "function") {
      const instance = new Solution();
      result = instance.${methodName || 'solve'}(...args);
    } else if (typeof ${methodName ? methodName : 'undefined'} === "function") {
      result = ${methodName ? methodName : 'undefined'}(...args);
    }
    if (typeof result === "object") console.log(JSON.stringify(result));
    else console.log(String(result ?? ""));
  }
}`
  }

  private prepareCppCode(code: string): string {
    const hasSolution = /\bclass\s+Solution\b/.test(code)
    if (!hasSolution) {
      const standaloneMatch = code.match(/(?:^|\n)\s*(?:int64_t|long\s+long|int|long|bool|double|float|string|vector<[^>]+>|char)\s+(?!main\b)([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/m)
      if (!standaloneMatch) return code

      const functionName = standaloneMatch[1]
      const returnType = standaloneMatch[0].match(/^\s*(.*?)\s+[A-Za-z_]\w*\s*\(/)?.[1]?.trim()
      const parameters = standaloneMatch[2].split(',').map((item) => item.trim()).filter(Boolean)
      const declarations: string[] = []
      const invocationArguments: string[] = []

      parameters.forEach((parameter, index) => {
        const match = parameter.match(/^(.*?)\s*([*&]?\s*[A-Za-z_]\w*)$/)
        const name = match?.[2]?.replace(/[*&]/g, '').trim() ?? `arg${index}`
        const type = match?.[1]?.replace(/\s+/g, ' ').trim() ?? 'int'
        if (type.includes('vector')) {
          declarations.push(`vector<int> ${name}; parseIntVector("${name}", raw, ${name});`)
        } else if (type.includes('string')) {
          declarations.push(`string ${name} = parseString("${name}", raw);`)
        } else {
          declarations.push(`int64_t ${name} = parseInteger("${name}", raw);`)
        }
        invocationArguments.push(name)
      })

      const returnVector = Boolean(returnType?.includes('vector'))
      const sourceWithoutMain = code.replace(/\bint\s+main\s*\(/g, 'int testmeman_original_main(')

      return `#include <bits/stdc++.h>
using namespace std;

${sourceWithoutMain}

int64_t parseInteger(const string& name, const string& raw) {
  size_t pos = raw.find(name + "=");
  if (pos == string::npos) return 0;
  pos += name.size() + 1;
  while (pos < raw.size() && isspace(raw[pos])) pos++;
  size_t end = pos;
  while (end < raw.size() && (isdigit(raw[end]) || raw[end] == '-')) end++;
  return stoll(raw.substr(pos, end - pos));
}

string parseString(const string& name, const string& raw) {
  size_t pos = raw.find(name + "=");
  if (pos == string::npos) return "";
  pos += name.size() + 1;
  while (pos < raw.size() && isspace(raw[pos])) pos++;
  if (raw[pos] == '"') pos++;
  size_t end = raw.find_first_of(",}\n", pos);
  string value = raw.substr(pos, end - pos);
  if (!value.empty() && value.back() == '"') value.pop_back();
  return value;
}

void parseIntVector(const string& name, const string& raw, vector<int>& output) {
  size_t pos = raw.find(name + "=");
  if (pos == string::npos && name == "nums") pos = raw.find("[");
  if (pos == string::npos) return;
  pos = raw.find("[", pos);
  size_t end = raw.find("]", pos);
  if (pos == string::npos || end == string::npos) return;
  string body = raw.substr(pos + 1, end - pos - 1);
  stringstream stream(body);
  string value;
  while (getline(stream, value, ',')) {
    if (!value.empty()) output.push_back(stoi(value));
  }
}

int main() {
  string raw((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
  ${declarations.join('\n  ')}
  auto result = ${functionName}(${invocationArguments.join(', ')});
  ${returnVector
        ? 'cout << "["; for (size_t i = 0; i < result.size(); ++i) { if (i) cout << ","; cout << result[i]; } cout << "]";'
        : 'cout << result;'}
  return 0;
}`
    }

    const method = code.match(/(?:public:\s*)?([\\w:<>,\[\] \t*&]+)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:const\s*)?\{/)
    if (!method) return code
    const methodName = method[2]
    const returnTypeMatch = code.match(new RegExp(`([A-Za-z_][\\w:<>,\\[\\] ]*?)\\s+${methodName}\\s*\\(`))
    const returnsVector = returnTypeMatch?.[1].includes('vector') ?? false
    const parameters = method[3].split(',').map((item) => item.trim()).filter(Boolean)
    const argumentCalls: string[] = []
    const parseDeclarations: string[] = []
    parameters.forEach((parameter, index) => {
      const match = parameter.match(/^(.*?)\s*([*&]?\s*[A-Za-z_]\w*)\s*(?:=\s*[^,]+)?$/)
      const name = match?.[2]?.replace(/[*&]/g, '').trim() ?? `arg${index}`
      const type = match?.[1]?.replace(/\s+/g, ' ').trim() ?? 'int'
      parseDeclarations.push(
        type.includes('vector') ? `vector<int> ${name}; parseIntVector("${name}", numsText, ${name});`
          : type.includes('string') ? `string ${name} = parseString("${name}", raw);`
            : `int64_t ${name} = parseInteger("${name}", raw);`,
      )
      argumentCalls.push(name)
    })

    return `#include <bits/stdc++.h>
using namespace std;

${code}

int64_t parseInteger(const string& name, const string& raw) {
  string pattern = name + "=";
  size_t pos = raw.find(pattern);
  if (pos == string::npos) return 0;
  pos += pattern.size();
  size_t end = pos;
  while (end < raw.size() && (isdigit(raw[end]) || raw[end] == '-' || raw[end] == '.')) end++;
  return stoll(raw.substr(pos, end - pos));
}

string parseString(const string& name, const string& raw) {
  string pattern = name + "=";
  size_t pos = raw.find(pattern);
  if (pos == string::npos) return "";
  pos += pattern.size();
  size_t end = raw.find_first_of(",\n}", pos);
  if (raw[pos] == '"') return raw.substr(pos + 1, end - pos - 2);
  return raw.substr(pos, end - pos);
}

void parseIntVector(const string& name, const string& raw, vector<int>& output) {
  size_t pos = raw.find(name + "=");
  if (pos == string::npos && name == "nums") pos = raw.find("[");
  if (pos == string::npos) return;
  pos = raw.find("[", pos);
  size_t end = raw.find("]", pos);
  string body = raw.substr(pos + 1, end - pos - 1);
  stringstream stream(body);
  string value;
  while (getline(stream, value, ',')) {
    if (!value.empty()) output.push_back(stoi(value));
  }
}

int main() {
  string raw((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
  if (!raw.empty() && raw.back() == '\n') raw.pop_back();
  string numsText = raw;
  ${parseDeclarations.join('\n  ')}
  Solution solution;
  auto result = solution.${methodName}(${argumentCalls.join(', ')});
  ${returnsVector ? `{
    cout << "[";
    for (size_t i = 0; i < result.size(); ++i) {
      if (i) cout << ",";
      cout << result[i];
    }
    cout << "]";
  }` : 'cout << result;'}
  return 0;
}`
  }

  private prepareJavaCode(code: string): string {
    const normalizedCode = code.replace(/\bpublic\s+class\s+Solution\b/g, 'class Solution')
    const method = normalizedCode.match(/(?:public\s+)?(?:static\s+)?([\w.<>,\[\] ]+)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/)
    if (!method) return `import java.util.*;\n${normalizedCode}`

    const methodName = method[2]
    const parameters = method[3].split(',').map((item) => item.trim()).filter(Boolean)
    const declarations: string[] = []
    const invocationArguments: string[] = []

    parameters.forEach((parameter, index) => {
      const match = parameter.match(/^([\w.<>,\[\] ]+)\s+([A-Za-z_]\w*)$/)
      const type = match?.[1]?.trim() ?? 'int'
      const name = match?.[2]?.trim() ?? `arg${index}`
      if (type.includes('[]')) {
        declarations.push(`int[] ${name} = parseIntArray(raw, "${name}");`)
      } else if (type === 'String') {
        declarations.push(`String ${name} = parseString(raw, "${name}");`)
      } else {
        declarations.push(`int ${name} = parseInt(raw, "${name}");`)
      }
      invocationArguments.push(name)
    })

    const importBlock = normalizedCode.includes('import ') ? '' : 'import java.util.*;\n'
    return `${importBlock}
${normalizedCode}

class Main {
  private static int parseInt(String raw, String name) {
    java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(name + "\\\\s*=\\\\s*(-?\\\\d+)").matcher(raw);
    return matcher.find() ? Integer.parseInt(matcher.group(1)) : 0;
  }

  private static String parseString(String raw, String name) {
    java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(name + "\\\\s*=\\\\s*([^,\\\\n}]+)").matcher(raw);
    return matcher.find() ? matcher.group(1).trim() : "";
  }

  private static int[] parseIntArray(String raw, String name) {
    java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(name + "\\\\s*=\\\\s*(\\\\[[^\\\\]]*\\\\])|\\\\[([^\\\\]]+)\\\\]").matcher(raw);
    String body = "";
    if (matcher.find()) body = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
    if (body == null) return new int[0];
    body = body.replace("[", "").replace("]", "").trim();
    if (body.isEmpty()) return new int[0];
    String[] parts = body.split(",");
    int[] values = new int[parts.length];
    for (int i = 0; i < parts.length; i++) values[i] = Integer.parseInt(parts[i].trim());
    return values;
  }

  public static void main(String[] args) throws Exception {
    String raw = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).trim();
    ${declarations.join('\n    ')}
    Solution solution = new Solution();
    Object result = solution.${methodName}(${invocationArguments.join(', ')});
    if (result instanceof int[]) {
      int[] values = (int[]) result;
      System.out.print("[");
      for (int i = 0; i < values.length; i++) {
        if (i > 0) System.out.print(",");
        System.out.print(values[i]);
      }
      System.out.print("]");
    } else {
      System.out.print(result);
    }
  }
}`
  }
}

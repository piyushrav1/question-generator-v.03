import { useEffect, useRef, useState } from 'react'
import {
  Bell, ChevronDown, ChevronUp, Code2, Copy, Play, RefreshCw,
  Sparkles, Send, Settings, Terminal, CheckCircle2, Sun, Moon, Monitor, RotateCcw, Maximize2,
  ArrowRight, Layers3, Clock3, Trophy, Shuffle,
  Pause, LogOut, X, Check, Command,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { apiClient } from './services'
import type { AttemptDto, PracticeTimerDto, ProgrammingLanguage, QuestionDto, SubmissionResultDto } from '../../../packages/shared/src/types'

const defaultStarterCode: Record<string, string> = {
  Python: `import sys
input = sys.stdin.readline

def solve():
    # Read input and implement your solution
    pass

if __name__ == '__main__':
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

  // Write your solution here
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

    public static void main(String[] args) throws IOException {
        // Write your solution here
    }
}`,
  'C++': `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Write your solution here

    return 0;
}`,
}

const formatTimer = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const practiceCategories = [
  { id: 'arrays', name: 'Arrays', description: 'Indexing, two pointers, and sliding windows', icon: Layers3 },
  { id: 'strings', name: 'Strings', description: 'Parsing, matching, and string transforms', icon: Code2 },
  { id: 'linked-lists', name: 'Linked Lists', description: 'Pointers, cycles, and list manipulation', icon: Layers3 },
  { id: 'stacks', name: 'Stacks & Queues', description: 'Ordered processing and monotonic structures', icon: Terminal },
  { id: 'trees', name: 'Trees', description: 'Traversals, recursion, and BSTs', icon: Layers3 },
  { id: 'graphs', name: 'Graphs', description: 'Shortest paths, traversal, and connectivity', icon: Sparkles },
  { id: 'dynamic-programming', name: 'Dynamic Programming', description: 'Optimization with overlapping subproblems', icon: Trophy },
  { id: 'sorting-searching', name: 'Sorting & Searching', description: 'Binary search and efficient ordering', icon: Shuffle },
  { id: 'recursion', name: 'Recursion', description: 'Divide, conquer, and backtracking', icon: RefreshCw },
  { id: 'hashing', name: 'Hashing', description: 'Maps, sets, and frequency analysis', icon: Layers3 },
  { id: 'math', name: 'Math', description: 'Number theory and arithmetic reasoning', icon: Sparkles },
  { id: 'bit-manipulation', name: 'Bit Manipulation', description: 'Bitmasks and binary operations', icon: Terminal },
] as const

function App() {
  const [practiceView, setPracticeView] = useState<'landing' | 'workspace'>('landing')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('testmeman.preferredCategories') || '["arrays"]') } catch { return ['arrays'] }
  })
  const [selectedTopic, setSelectedTopic] = useState<string>(
    localStorage.getItem('testmeman.preferredTopic') || 'arrays',
  )
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>(
    (localStorage.getItem('testmeman.preferredDifficulty') as 'easy' | 'medium' | 'hard') || 'medium',
  )
  const [customPromptText, setCustomPromptText] = useState<string>('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [copiedInput, setCopiedInput] = useState(false)
  const [resumeAttempt, setResumeAttempt] = useState<AttemptDto | null>(null)
  const [language, setLanguage] = useState<ProgrammingLanguage>('Python')
  const [code, setCode] = useState(defaultStarterCode.Python)
  const [question, setQuestion] = useState<QuestionDto | null>(null)
  const [activeTab, setActiveTab] = useState<'testcases' | 'custom' | 'result'>('testcases')
  const [outputCollapsed, setOutputCollapsed] = useState(false)
  const [editorTab, setEditorTab] = useState<'solution' | 'submissions'>('solution')
  const [selectedTest, setSelectedTest] = useState(0)
  const [running, setRunning] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<SubmissionResultDto | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionResultDto[]>([])
  const [customInput, setCustomInput] = useState('')
  const [customOutput, setCustomOutput] = useState('')
  const [customExpectedOutput, setCustomExpectedOutput] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [activeAttempt, setActiveAttempt] = useState<AttemptDto | null>(null)
  const [practiceTimer, setPracticeTimer] = useState<PracticeTimerDto | null>(null)
  const [quitDialogOpen, setQuitDialogOpen] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const [draftStatus, setDraftStatus] = useState<'saved' | 'saving'>('saved')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const revisionRef = useRef(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [fontSize, setFontSize] = useState(13)
  const [wordWrap, setWordWrap] = useState(false)
  useEffect(() => {
    localStorage.removeItem('testmeman.hasVisited')
  }, [])

  const [problemWidth, setProblemWidth] = useState(() => {
    const saved = Number(localStorage.getItem('testmeman.layout.problemWidth'))
    return saved >= 320 && saved <= 700 ? saved : Math.min(540, Math.floor(window.innerWidth * 0.45))
  })
  const [outputHeight, setOutputHeight] = useState(() => {
    const saved = Number(localStorage.getItem('testmeman.layout.outputHeight'))
    return saved >= 140 && saved <= 450 ? saved : 200
  })
  const visibleTests = question ? question.testCases.filter((test) => !test.hidden) : []

  useEffect(() => {
    if (practiceView !== 'landing') return
    let cancelled = false
    apiClient.resumeActiveAttempt()
      .then((attempt) => {
        if (!cancelled) setResumeAttempt(attempt)
      })
      .catch(() => {
        if (!cancelled) setResumeAttempt(null)
      })
    return () => {
      cancelled = true
    }
  }, [practiceView])

  useEffect(() => {
    if (practiceView !== 'workspace') return
    let cancelled = false
    apiClient.getActiveAttempt()
      .then((attempt) => {
        if (cancelled) return
        setActiveAttempt(attempt)
        setPracticeTimer(attempt.timer ?? null)
        setQuestion(attempt.question)
        revisionRef.current = attempt.revision + 1

        const cached = localStorage.getItem(`testmeman:draft:${attempt.id}`)
        let restoredCode = attempt.code
        let restoredLanguage = attempt.language
        if (cached) {
          try {
            const draft = JSON.parse(cached) as { code?: string; language?: ProgrammingLanguage; revision?: number }
            if (typeof draft.code === 'string' && (draft.revision ?? 0) >= attempt.revision) {
              restoredCode = draft.code
            }
            if (draft.language) restoredLanguage = draft.language
          } catch {
            // Ignore malformed browser drafts.
          }
        }
        setLanguage(restoredLanguage)
        setCode(restoredCode || attempt.question.starterCode[restoredLanguage])
        setSelectedTest(0)
        apiClient.getSubmissions(attempt.questionId)
          .then((history) => {
            if (!cancelled) setSubmissionHistory(history)
          })
          .catch(() => {
            if (!cancelled) setSubmissionHistory([])
          })
      })
      .catch((error) => {
        if (!cancelled) {
          setGenerationError(error instanceof Error ? error.message : 'Unable to resume the active attempt.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [practiceView])

  useEffect(() => {
    if (!activeAttempt?.timer) return
    setPracticeTimer(activeAttempt.timer)
  }, [activeAttempt])

  useEffect(() => {
    if (!practiceTimer) return
    if (practiceTimer.status !== 'running' || !practiceTimer.expiresAt) {
      setPracticeTimer((current) => current ? { ...current, remainingSeconds: current.remainingSeconds } : current)
      document.title = practiceTimer.status === 'paused'
        ? '(Timer paused) TestMeMan'
        : practiceTimer.status === 'expired'
          ? '(Time expired) TestMeMan'
          : 'TestMeMan'
      return
    }
    const update = () => {
      const remainingSeconds = Math.max(0, Math.ceil((Date.parse(practiceTimer.expiresAt as string) - Date.now()) / 1000))
      setPracticeTimer((current) => remainingSeconds === 0
        ? current ? { ...current, status: 'expired', remainingSeconds: 0, expiredAt: current.expiredAt ?? new Date().toISOString() } : current
        : current ? { ...current, remainingSeconds } : current)
      document.title = remainingSeconds > 0 ? `(${formatTimer(remainingSeconds)}) TestMeMan` : '(Time expired) TestMeMan'
    }
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [practiceTimer?.status, practiceTimer?.expiresAt])

  useEffect(() => {
    if (!activeAttempt) return
    setDraftStatus('saving')
    const timer = window.setTimeout(() => {
      const revision = revisionRef.current++
      localStorage.setItem(`testmeman:draft:${activeAttempt.id}`, JSON.stringify({
        code,
        language,
        revision,
        updatedAt: new Date().toISOString(),
      }))
      apiClient.saveAttemptDraft({
        attemptId: activeAttempt.id,
        language,
        code,
        revision,
      })
        .then(() => setDraftStatus('saved'))
        .catch(() => setDraftStatus('saving'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [activeAttempt, code, language])

  useEffect(() => {
    const savedTheme = localStorage.getItem('testmeman.theme') as 'light' | 'dark' | 'system' | null
    const savedFontSize = Number(localStorage.getItem('testmeman.fontSize'))
    const savedWrap = localStorage.getItem('testmeman.wordWrap')
    if (savedTheme) setTheme(savedTheme)
    if (savedFontSize >= 11 && savedFontSize <= 18) setFontSize(savedFontSize)
    if (savedWrap) setWordWrap(savedWrap === 'true')
  }, [])

  useEffect(() => {
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    applyTheme()
    localStorage.setItem('testmeman.theme', theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('testmeman.fontSize', String(fontSize))
    localStorage.setItem('testmeman.wordWrap', String(wordWrap))
  }, [fontSize, wordWrap])

  useEffect(() => {
    if (!quitDialogOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !quitting) setQuitDialogOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [quitDialogOpen, quitting])

  useEffect(() => {
    if (!resetModalOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetModalOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resetModalOpen])

  useEffect(() => {
    localStorage.setItem('testmeman.layout.problemWidth', String(problemWidth))
  }, [problemWidth])

  useEffect(() => {
    localStorage.setItem('testmeman.layout.outputHeight', String(outputHeight))
  }, [outputHeight])

  const startVerticalResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = problemWidth
    const move = (pointerEvent: PointerEvent) => {
      const maximumWidth = Math.min(700, Math.max(320, window.innerWidth - 520 - 6))
      setProblemWidth(Math.min(maximumWidth, Math.max(320, startWidth + pointerEvent.clientX - startX)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('resizing', 'resizing-row')
    }
    document.body.classList.add('resizing', 'resizing-row')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const startHorizontalResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = outputHeight
    const move = (pointerEvent: PointerEvent) => {
      setOutputHeight(Math.min(500, Math.max(170, startHeight + startY - pointerEvent.clientY)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const changeLanguage = (value: ProgrammingLanguage) => {
    setLanguage(value)
    setCode(question?.starterCode?.[value] || defaultStarterCode[value] || '')
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      return next.length === 0 ? prev : next // keep at least one
    })
    setSelectedTopic(id) // keep selectedTopic in sync with last-clicked
  }

  const startPractice = () => {
    setGenerating(true)
    setGenerationError('')
    const topic = selectedCategories[0] ?? 'arrays'
    localStorage.setItem('testmeman.preferredTopic', topic)
    localStorage.setItem('testmeman.preferredDifficulty', selectedDifficulty)
    localStorage.setItem('testmeman.preferredCategories', JSON.stringify(selectedCategories))
    apiClient.createNewAttempt({
      topic,
      difficulty: selectedDifficulty,
      categories: selectedCategories,
      customPrompt: customPromptText.trim() || undefined,
    })
      .then((attempt) => {
        setActiveAttempt(attempt)
        setPracticeTimer(attempt.timer ?? null)
        setQuestion(attempt.question)
        setLanguage(attempt.language)
        setCode(attempt.question.starterCode?.[attempt.language] ?? defaultStarterCode[attempt.language])
        revisionRef.current = attempt.revision + 1
        setSelectedTest(0)
        setSubmitted(false)
        setSubmissionResult(null)
        setSubmissionHistory([])
        setHasSubmitted(false)
        setActiveTab('testcases')
        setCustomMode(false)
        setCustomInput('')
        setCustomOutput('')
        setPracticeView('workspace')
      })
      .catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Question generation failed.')
      })
      .finally(() => setGenerating(false))
  }

  const resumePractice = () => {
    setPracticeView('workspace')
  }

  const updatePracticeTimer = (
    action: 'pause' | 'resume' | 'reset' | 'extend',
    seconds = 300,
  ) => {
    if (!activeAttempt) return
    apiClient.updateAttemptTimer(activeAttempt.id, action, seconds)
      .then((timer) => setPracticeTimer(timer))
      .catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Unable to update the timer.')
      })
  }

  const quitTest = () => {
    if (!activeAttempt || quitting) return
    setQuitting(true)
    const revision = revisionRef.current++
    localStorage.setItem(`testmeman:draft:${activeAttempt.id}`, JSON.stringify({
      code,
      language,
      revision,
      updatedAt: new Date().toISOString(),
    }))
    apiClient.quitAttempt(activeAttempt.id, { language, code, revision })
      .then(() => {
        localStorage.removeItem(`testmeman:draft:${activeAttempt.id}`)
        setQuitDialogOpen(false)
        setPracticeTimer(null)
        setActiveAttempt(null)
        document.title = 'TestMeMan'
        setPracticeView('landing')
      })
      .catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Unable to quit the test.')
        setQuitDialogOpen(false)
      })
      .finally(() => setQuitting(false))
  }

  const runCode = () => {
    if (!question) return
    setRunning(true)
    setHasSubmitted(true)
    setOutputCollapsed(false)
    setActiveTab('result')
    apiClient.submit({
      questionId: question.id,
      language,
      code,
      submitted: false,
    })
      .then((result) => {
        setSubmitted(false)
        setSubmissionResult(result)
        setActiveTab('result')
      })
      .catch((error) => {
        setSubmissionResult({
          id: `sub-${Date.now().toString(36)}`,
          questionId: question.id,
          language,
          status: 'runtime_error',
          submitted: false,
          totalCases: visibleTests.length,
          visiblePassed: 0,
          visibleTotal: visibleTests.length,
          hiddenPassed: 0,
          hiddenTotal: 0,
          runtimeMs: null,
          memoryMb: null,
          message: error instanceof Error ? error.message : 'Unable to run the solution.',
        })
      })
      .finally(() => {
        setRunning(false)
      })
  }

  const copyInputToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedInput(true)
      setTimeout(() => setCopiedInput(false), 2000)
    })
  }

  useEffect(() => {
    const handleCtrlEnter = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!running) runCode()
      }
    }
    window.addEventListener('keydown', handleCtrlEnter)
    return () => window.removeEventListener('keydown', handleCtrlEnter)
  }, [code, language, question, running])

  const submitCode = () => {
    if (!question) return
    setRunning(true)
    setOutputCollapsed(false)
    apiClient.submit({
      questionId: question.id,
      language,
      code,
      submitted: true,
    })
      .then((result) => {
        setSubmitted(result.status === 'accepted')
        setSubmissionResult(result)
        setSubmissionHistory((history) => [result, ...history].slice(0, 20))
        setHasSubmitted(true)
        setActiveTab('result')
      })
      .catch(() => {
        setSubmitted(false)
        setSubmissionResult({
          id: `sub-${Date.now().toString(36)}`,
          questionId: question.id,
          language,
          status: 'runtime_error',
          submitted: true,
          totalCases: visibleTests.length,
          visiblePassed: 0,
          visibleTotal: visibleTests.length,
          hiddenPassed: 0,
          hiddenTotal: 0,
          runtimeMs: null,
          memoryMb: null,
          message: 'Unable to submit the solution. Check that the API server is running.',
        })
        setHasSubmitted(true)
        setActiveTab('result')
      })
      .finally(() => setRunning(false))
  }

  const runCustomTest = () => {
    if (!question) return
    setRunning(true)
    setHasSubmitted(true)
    setOutputCollapsed(false)
    setCustomMode(true)
    setActiveTab('custom')
    setCustomOutput('Running...')
    apiClient.submit({
      questionId: question.id,
      language,
      code,
      submitted: false,
      customInput,
      customExpectedOutput,
    })
      .then((result) => {
        setSubmitted(false)
        setSubmissionResult(result)
        setCustomOutput(result.caseResults?.[0]?.actualOutput ?? '')
      })
      .catch((error) => {
        const result: SubmissionResultDto = {
          id: `sub-${Date.now().toString(36)}`,
          questionId: question.id,
          language,
          status: 'runtime_error',
          submitted: false,
          totalCases: 1,
          visiblePassed: 0,
          visibleTotal: 1,
          hiddenPassed: 0,
          hiddenTotal: 0,
          runtimeMs: null,
          memoryMb: null,
          message: error instanceof Error ? error.message : 'Unable to run the custom test.',
        }
        setSubmissionResult(result)
        setCustomOutput(result.message)
      })
      .finally(() => setRunning(false))
  }

  const generateQuestion = () => {
    setGenerating(true)
    apiClient.createNewAttempt({
      topic: selectedCategories[0] ?? selectedTopic,
      difficulty: selectedDifficulty,
      categories: selectedCategories,
    })
      .then((attempt) => {
        setActiveAttempt(attempt)
        setPracticeTimer(attempt.timer ?? null)
        setQuestion(attempt.question)
        setLanguage(attempt.language)
        setCode(attempt.question.starterCode?.[attempt.language] ?? defaultStarterCode[attempt.language])
        revisionRef.current = attempt.revision + 1
        setSelectedTest(0)
        setSubmitted(false)
        setSubmissionResult(null)
        setHasSubmitted(false)
        setGenerationError('')
        setActiveTab('testcases')
        setCustomMode(false)
        setCustomInput('')
        setCustomOutput('')
      })
      .catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Question generation failed.')
      })
      .finally(() => setGenerating(false))
  }

  if (practiceView === 'landing') {
    const selectedCategory = practiceCategories.find((category) => category.id === selectedTopic) ?? practiceCategories[0]
    const LandingIcon = selectedCategory.icon

    return (
      <main className="landing-page">
        <header className="landing-header">
          <button className="landing-brand" onClick={() => setPracticeView('landing')} aria-label="TestMeMan home">
            <span className="brand-mark"><Code2 size={20} strokeWidth={2.5} /></span>
            <span>TestMeMan</span>
          </button>
          <div className="landing-header-actions">
            <button
              className="landing-theme-button"
              aria-label="Toggle theme"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <div className="landing-content">
          <section className="landing-hero">
            <div className="landing-kicker"><Sparkles size={14} /> AI-powered coding practice</div>
            <h1>Build stronger algorithms,<br /><span>one challenge at a time.</span></h1>
            <p>Choose your topic and difficulty. TestMeMan will generate a focused coding challenge with visible and hidden test cases.</p>

            {resumeAttempt && (
              <button className="continue-card" onClick={resumePractice}>
                <div className="continue-icon"><Clock3 size={18} /></div>
                <div>
                  <span>Continue where you left off</span>
                  <strong>{resumeAttempt.question.title}</strong>
                </div>
                <ArrowRight size={18} />
              </button>
            )}

            <div className="hero-preview">
              <div className="preview-topline">
                <span className="preview-dot red" /><span className="preview-dot yellow" /><span className="preview-dot green" />
                <span>AI Challenge</span>
              </div>
              <div className="preview-body">
                <div className="preview-category"><LandingIcon size={15} /> {selectedCategory.name}</div>
                <strong>{selectedDifficulty === 'hard' ? 'Optimize the complete solution' : selectedDifficulty === 'easy' ? 'Solve the core problem' : 'Design an efficient approach'}</strong>
                <div className="preview-tags">
                  <span>{selectedDifficulty}</span><span>{selectedCategories.length > 1 ? `${selectedCategories.length} topics` : selectedCategories[0] ?? 'arrays'}</span><span>Hidden tests</span>
                  <span><Clock3 size={10} /> {selectedDifficulty === 'easy' ? '30 min' : selectedDifficulty === 'hard' ? '60 min' : '45 min'}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="practice-selector" aria-label="Practice configuration">
            <div className="selector-heading">
              <span>01</span>
              <div><strong>Choose categories</strong><small>Select one or more topics to combine in your challenge</small></div>
            </div>
            <div className="category-grid" role="group" aria-label="Coding categories">
              {practiceCategories.map((category) => {
                const Icon = category.icon
                const selected = selectedCategories.includes(category.id)
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    className={`category-card ${selected ? 'selected' : ''}`}
                    onClick={() => toggleCategory(category.id)}
                  >
                    <span className="category-icon"><Icon size={18} /></span>
                    <span className="category-copy"><strong>{category.name}</strong><small>{category.description}</small></span>
                    <span className="selection-check"><CheckCircle2 size={16} /></span>
                  </button>
                )
              })}
            </div>

            <div className="selector-row">
              <div>
                <div className="selector-heading compact">
                  <span>02</span>
                  <div><strong>Difficulty</strong><small>Choose your challenge level</small></div>
                </div>
                <div className="difficulty-options" role="radiogroup" aria-label="Difficulty">
                  {(['easy', 'medium', 'hard'] as const).map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      role="radio"
                      aria-checked={selectedDifficulty === difficulty}
                      className={selectedDifficulty === difficulty ? 'active' : ''}
                      onClick={() => setSelectedDifficulty(difficulty)}
                    >
                      <span className={`difficulty-dot ${difficulty}`} />
                      {difficulty[0].toUpperCase() + difficulty.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="selector-heading compact" style={{ marginTop: '1.25rem' }}>
              <span>03</span>
              <div><strong>Custom requirements</strong><small>Optionally describe what type of problem you want</small></div>
            </div>
            <input
              type="text"
              className="custom-prompt-input"
              placeholder="e.g. graph traversal with dynamic programming, matrix rotation..."
              value={customPromptText}
              onChange={(e) => setCustomPromptText(e.target.value)}
              maxLength={500}
            />

            {generationError && <div className="landing-generation-error" role="alert">{generationError}</div>}
            <button className="start-practice-button" onClick={startPractice} disabled={generating}>
              {generating ? <RefreshCw size={18} className="spin" /> : <Sparkles size={18} />}
              {generating ? 'Generating your challenge...' : 'Start Practicing'}
              {!generating && <ArrowRight size={18} />}
            </button>
          </section>
        </div>
      </main>
    )
  }

  if (!question || generating) {
    return (
      <main className="landing-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '1.5rem' }}>
        <Sparkles size={40} className="spin" style={{ color: '#6366f1' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Generating Unique AI Challenge...</h2>
        <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.95rem' }}>Crafting original problem statement, test cases, and starter code with Gemini AI.</p>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand workspace-brand-button"
          type="button"
          aria-label="Open practice landing page"
          onClick={() => setPracticeView('landing')}
        >
          <div className="brand-mark"><Code2 size={20} strokeWidth={2.5} /></div>
          <span>TestMeMan</span>
        </button>
        <nav className="main-nav">
          <a href="#">Practice</a>
          <a href="#">Compete</a>
          <a href="#">Leaderboard</a>
          <a href="#">AI Generator</a>
        </nav>
        <div className="top-actions">
          <button
            className="quit-test-button"
            type="button"
            onClick={() => setQuitDialogOpen(true)}
            disabled={!activeAttempt || quitting}
          >
            <LogOut size={15} />
            Quit Test
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <Command size={18} />
          </button>
          <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
          <button className="avatar-button"><span>PR</span></button>
        </div>
      </header>

      <main className="workspace" style={{ gridTemplateColumns: `${problemWidth}px 6px minmax(360px, 1fr)` }}>
        <section className="problem-pane">
          <div className="problem-toolbar">
            <div className="breadcrumb">
              <span>Practice</span>
              <span>/</span>
              <strong>{question ? (question.topic.charAt(0).toUpperCase() + question.topic.slice(1)) : 'Problem'}</strong>
            </div>
            <button className="generate-button" onClick={generateQuestion}>
              <RefreshCw size={15} className={generating ? 'spin' : ''} />
              {generating ? 'Generating...' : 'Generate New'}
            </button>
          </div>
          {generationError && <div className="generation-error" role="alert">{generationError}</div>}

          <div className="problem-scroll">
            <div className="problem-heading">
              <div>
                <div className="title-row">
                  <h1>{question.title}</h1>
                  {submitted && <span className="solved-chip"><CheckCircle2 size={14} /> Solved</span>}
                </div>
                <div className="meta-row">
                  <span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span>
                  <span className="meta-item"><Sparkles size={14} /> AI Generated</span>
                </div>
              </div>
            </div>

            <article className="problem-content">
              <p>{question.statement}</p>
              {question.inputFormat && (
                <>
                  <h2>Input Format</h2>
                  <p>{question.inputFormat}</p>
                </>
              )}
              {question.outputFormat && (
                <>
                  <h2>Output Format</h2>
                  <p>{question.outputFormat}</p>
                </>
              )}

              {question.examples.map((example, index) => (
                <div key={`${example.input}-${index}`}>
                  <h2>Example {index + 1}</h2>
                  <div className="example-box">
                    <div><span>Input:</span> {example.input}</div>
                    <div><span>Output:</span> {example.output}</div>
                  </div>
                </div>
              ))}

              <h2>Constraints</h2>
              <ul>
                {question.constraints.map((constraint, index) => <li key={`${constraint}-${index}`}><code>{constraint}</code></li>)}
              </ul>
            </article>
          </div>
        </section>

        <div
          className="vertical-resizer"
          role="separator"
          aria-label="Resize problem and editor panels"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={startVerticalResize}
          onDoubleClick={() => setProblemWidth(560)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setProblemWidth((width) => Math.max(320, width - 20))
            if (event.key === 'ArrowRight') setProblemWidth((width) => Math.min(700, width + 20))
          }}
        />
        <section className={`editor-pane ${outputCollapsed ? 'output-collapsed' : ''}`}>
          <div className="editor-toolbar">
            <div className="tabs">
              <button className={`tab ${editorTab === 'solution' ? 'active' : ''}`} onClick={() => setEditorTab('solution')}>Solution</button>
              <button className={`tab ${editorTab === 'submissions' ? 'active' : ''}`} onClick={() => setEditorTab('submissions')}>Submissions</button>
            </div>
            <div className="editor-actions">
              <button className="toolbar-run-button" type="button" onClick={runCode} disabled={running} title="Run visible test cases (Ctrl+Enter)">
                <Play size={13} fill="currentColor" /> Run
              </button>
              <button className="toolbar-submit-button" type="button" onClick={submitCode} disabled={running} title="Submit solution">
                {running ? <RefreshCw size={13} className="spin" /> : <Send size={13} />}
                Submit
              </button>
              {activeAttempt && <span className={`draft-status ${draftStatus}`}>{draftStatus === 'saved' ? 'Draft saved' : 'Saving draft...'}</span>}
              {practiceTimer && (
                <div className={`practice-timer ${practiceTimer.status} ${practiceTimer.remainingSeconds <= 300 ? 'warning' : ''}`}>
                  <Clock3 size={14} />
                  <strong>{formatTimer(practiceTimer.remainingSeconds)}</strong>
                  {practiceTimer.status === 'running' ? (
                    <button type="button" aria-label="Pause timer" onClick={() => updatePracticeTimer('pause')}><Pause size={12} /></button>
                  ) : practiceTimer.status === 'paused' ? (
                    <button type="button" aria-label="Resume timer" onClick={() => updatePracticeTimer('resume')}><Play size={12} /></button>
                  ) : null}
                  <button type="button" aria-label="Reset timer" onClick={() => updatePracticeTimer('reset')}><RotateCcw size={12} /></button>
                  <button type="button" aria-label="Extend timer by 5 minutes" onClick={() => updatePracticeTimer('extend', 300)}>+5</button>
                </div>
              )}
              <button className="language-button">
                {language} <ChevronDown size={14} />
                <select id="programming-language" name="programmingLanguage" value={language} onChange={(event) => changeLanguage(event.target.value as ProgrammingLanguage)} aria-label="Select language">
                  <option>Python</option>
                  <option>JavaScript</option>
                  <option>Java</option>
                  <option>C++</option>
                </select>
              </button>
              <button
                className="icon-button"
                aria-label="Reset code to starter template"
                title="Reset code to starter template"
                type="button"
                onClick={() => setResetModalOpen(true)}
              >
                <RotateCcw size={16} />
              </button>
              <div className="settings-wrap">
                <button
                  className="icon-button"
                  aria-label="Editor settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <Settings size={17} />
                </button>
                {settingsOpen && (
                  <div className="settings-menu">
                    <div className="settings-heading">Appearance & editor</div>
                    <div className="theme-options" role="radiogroup" aria-label="Theme">
                      {([
                        ['light', 'Light', Sun],
                        ['dark', 'Dark', Moon],
                        ['system', 'System', Monitor],
                      ] as const).map(([value, label, Icon]) => (
                        <button
                          key={value}
                          className={theme === value ? 'active' : ''}
                          role="radio"
                          aria-checked={theme === value}
                          onClick={() => setTheme(value)}
                        >
                          <Icon size={14} /> {label}
                        </button>
                      ))}
                    </div>
                    <label className="settings-row">
                      <span>Font size</span>
                      <select id="editor-font-size" name="editorFontSize" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}>
                        {[11, 12, 13, 14, 16, 18].map((size) => <option key={size} value={size}>{size}px</option>)}
                      </select>
                    </label>
                    <label className="settings-row">
                      <span>Word wrap</span>
                      <input id="editor-word-wrap" name="editorWordWrap" type="checkbox" checked={wordWrap} onChange={(event) => setWordWrap(event.target.checked)} />
                    </label>
                    <button
                      className="reset-layout-button"
                      onClick={() => {
                        setProblemWidth(560)
                        setOutputHeight(220)
                        setOutputCollapsed(false)
                      }}
                    >
                      <RotateCcw size={14} /> Reset layout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {editorTab === 'submissions' ? (
            <div className="submission-history">
              <div className="history-heading">
                <span>Status</span><span>Language</span><span>Visible</span><span>Hidden</span><span>Runtime</span>
              </div>
              {submissionHistory.length === 0 ? (
                <div className="history-empty">No submissions yet.</div>
              ) : submissionHistory.map((item) => (
                <button
                  key={item.id}
                  className="history-row"
                  onClick={() => {
                    setSubmissionResult(item)
                    setHasSubmitted(true)
                    setSubmitted(item.status === 'accepted')
                    setActiveTab('result')
                    setEditorTab('solution')
                  }}
                >
                  <span className={`history-status ${item.status}`}>{item.status.replace(/_/g, ' ')}</span>
                  <span>{item.language}</span>
                  <span>{item.visiblePassed}/{item.visibleTotal}</span>
                  <span>{item.hiddenPassed}/{item.hiddenTotal}</span>
                  <span>{item.runtimeMs ? `${item.runtimeMs} ms` : 'N/A'}</span>
                </button>
              ))}
            </div>
          ) : (
          <>
          <div className="code-area">
            <div className="code-area-inner">
              <Editor
              height="100%"
              language={{
                Python: 'python',
                JavaScript: 'javascript',
                Java: 'java',
                'C++': 'cpp',
              }[language]}
              value={code}
              onChange={(value) => setCode(value ?? '')}
              theme={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'vs-dark' : 'light'}
              options={{
                fontSize,
                lineNumbers: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
                wordWrap: wordWrap ? 'on' : 'off',
                padding: { top: 14 },
                fontFamily: '"JetBrains Mono", monospace',
                suggestOnTriggerCharacters: true,
                formatOnPaste: true,
                smoothScrolling: true,
              }}
              />
            </div>
          </div>

          {!outputCollapsed && (
            <div
              className="horizontal-resizer"
              role="separator"
              aria-label="Resize editor and test panels"
              aria-orientation="horizontal"
              tabIndex={0}
              onPointerDown={startHorizontalResize}
              onDoubleClick={() => setOutputHeight(220)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') setOutputHeight((height) => Math.min(500, height + 20))
                if (event.key === 'ArrowDown') setOutputHeight((height) => Math.max(170, height - 20))
              }}
            />
          )}
          <div
            className={`output-panel ${outputCollapsed ? 'collapsed' : ''}`}
            style={{
              height: outputCollapsed ? 42 : outputHeight,
              maxHeight: 'calc(100% - 240px)',
            }}
          >
            <div className="output-tabs">
                  <button
                    className={activeTab === 'testcases' ? 'active' : ''}
                    onClick={() => {
                      setCustomMode(false)
                      setActiveTab('testcases')
                    }}
                  >
                    Test Cases
                  </button>
                  <button
                    className={activeTab === 'custom' ? 'active' : ''}
                    onClick={() => {
                      setCustomMode(true)
                      setActiveTab('custom')
                    }}
                  >
                    Custom Test
                  </button>
                  <button
                    className={activeTab === 'result' ? 'active' : ''}
                    onClick={() => setActiveTab('result')}
                  >
                    Test Result
                  </button>
                  <button
                    className="collapse-output-button"
                    aria-label={outputCollapsed ? 'Expand test panel' : 'Collapse test panel'}
                    onClick={() => setOutputCollapsed((collapsed) => !collapsed)}
                  >
                    {outputCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button
                    className="maximize-output-button"
                    aria-label="Maximize test panel"
                    onClick={() => {
                      setOutputCollapsed(false)
                      setOutputHeight((height) => height >= 500 ? 220 : 500)
                    }}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
                <div className="output-content">
              {activeTab === 'custom' ? (
                  <div className="custom-layout">
                    <div>
                      <label htmlFor="custom-test-input">Custom input</label>
                      <textarea
                        id="custom-test-input"
                        name="customTestInput"
                        value={customInput}
                        onChange={(event) => setCustomInput(event.target.value)}
                        placeholder="Enter custom test input"
                      />
                      <label htmlFor="custom-expected-output">Expected output (optional)</label>
                      <textarea
                        id="custom-expected-output"
                        name="customExpectedOutput"
                        value={customExpectedOutput}
                        onChange={(event) => setCustomExpectedOutput(event.target.value)}
                        placeholder="Enter expected output to compare"
                        className="custom-expected-output"
                      />
                      <button className="custom-run-button" onClick={runCustomTest} disabled={running || !customInput.trim()}>
                        <Play size={14} /> Run custom test
                      </button>
                    </div>
                    <div>
                      <label>Output</label>
                      <pre>{running ? 'Running...' : customOutput || 'No output yet'}</pre>
                    </div>
                  </div>
              ) : activeTab === 'testcases' ? (
                <div className="test-layout">
                  <div className="test-list">
                    {visibleTests.map((test, index) => (
                      <button
                        key={test.name}
                        className={selectedTest === index ? 'selected' : ''}
                        onClick={() => setSelectedTest(index)}
                      >
                        <CheckCircle2 size={14} />
                        Test Case {index + 1}
                      </button>
                    ))}
                    <button className="add-test"><span>+</span> Add test case</button>
                  </div>
                  <div className="test-details">
                    <label>Input</label>
                    <div className="test-value">
                      <code>{visibleTests[selectedTest]?.input ?? ''}</code>
                      <button
                        aria-label="Copy input"
                        title={copiedInput ? 'Copied!' : 'Copy input'}
                        onClick={() => copyInputToClipboard(visibleTests[selectedTest]?.input ?? '')}
                      >{copiedInput ? <Check size={14} className="copy-success" /> : <Copy size={14} />}</button>
                    </div>
                    <label>Expected output</label>
                    <div className="expected-value">{visibleTests[selectedTest]?.expectedOutput ?? ''}</div>
                  </div>
                </div>
              ) : (
                <div className="result-view">
                  {!hasSubmitted && !running ? (
                    <div className="submission-placeholder">
                      <span>Click <strong>Run</strong> to test your code or <strong>Submit</strong> to evaluate all test cases.</span>
                    </div>
                  ) : running ? (
                    <div className="running-state"><RefreshCw size={18} className="spin" /> Running test cases...</div>
                  ) : (submitted || submissionResult?.status === 'accepted') ? (
                    <>
                      <div className="result-summary success">
                        <CheckCircle2 size={20} />
                        <div><strong>Accepted</strong><span>{submissionResult?.message}</span></div>
                      </div>
                      <div className="result-stats">
                        <div><span>Runtime</span><strong>{submissionResult?.runtimeMs ? `${submissionResult.runtimeMs} ms` : 'N/A'}</strong></div>
                        <div><span>Visible</span><strong>{submissionResult ? `${submissionResult.visiblePassed}/${submissionResult.visibleTotal}` : 'N/A'}</strong></div>
                        <div><span>Hidden</span><strong>{submissionResult ? `${submissionResult.hiddenPassed}/${submissionResult.hiddenTotal}` : 'N/A'}</strong></div>
                        <div><span>Language</span><strong>{language}</strong></div>
                        {submissionResult?.submittedAfterDeadline && <div><span>Deadline</span><strong>Submitted late</strong></div>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="result-summary error">
                        <Terminal size={20} />
                        <div><strong>{submissionResult?.status === 'time_limit_exceeded' ? 'Time Limit Exceeded' : submissionResult?.status === 'runtime_error' ? 'Runtime Error' : 'Wrong Answer'}</strong><span>{submissionResult?.message ?? 'Submission failed.'}</span></div>
                      </div>
                      <div className="result-stats">
                        <div><span>Visible</span><strong>{submissionResult ? `${submissionResult.visiblePassed}/${submissionResult.visibleTotal}` : 'N/A'}</strong></div>
                        <div><span>Hidden</span><strong>{submissionResult ? `${submissionResult.hiddenPassed}/${submissionResult.hiddenTotal}` : 'N/A'}</strong></div>
                        <div><span>Language</span><strong>{language}</strong></div>
                        {submissionResult?.submittedAfterDeadline && <div><span>Deadline</span><strong>Submitted late</strong></div>}
                      </div>
                    </>
                  )}
                      {!running && submissionResult?.caseResults && submissionResult.caseResults.length > 0 && (
                        <div className="case-results">
                          {submissionResult.caseResults.map((test, index) => (
                            <div className="case-result" key={`${test.id}-${index}`}>
                              <button
                                className="case-result-row"
                                onClick={() => setExpandedCase((current) => current === `${test.id}-${index}` ? null : `${test.id}-${index}`)}
                              >
                                <span className={`case-status ${test.status}`}>
                                  {test.status === 'passed' ? <CheckCircle2 size={14} /> : <Terminal size={14} />}
                                  {test.hidden ? `Hidden Test ${index + 1}` : `Test Case ${index + 1}`}
                                </span>
                                <span className="case-status-label">{test.status.replace(/_/g, ' ')}</span>
                                <span className="case-runtime-wrap">
                                  <span className={`runtime-badge ${test.runtimeMs < 50 ? 'runtime-fast' : test.runtimeMs <= 200 ? 'runtime-normal' : 'runtime-slow'}`}>
                                    {test.runtimeMs < 50 ? 'Fast' : test.runtimeMs <= 200 ? 'Good' : 'Slow'}
                                  </span>
                                  <span className="case-runtime-num">{test.runtimeMs} ms</span>
                                </span>
                              </button>
                              {expandedCase === `${test.id}-${index}` && (
                                <div className="case-result-details">
                                  {test.status !== 'passed' && test.expectedOutput !== undefined && test.actualOutput !== undefined ? (
                                    <div className="diff-viewer-card">
                                      <div className="diff-header">
                                        <span className="diff-title">Output Diff Analysis</span>
                                        {test.mismatchLine !== undefined && (
                                          <span className="diff-mismatch-badge">Mismatch at line {test.mismatchLine}, col {test.mismatchColumn ?? 1}</span>
                                        )}
                                      </div>
                                      <div className="diff-grid">
                                        <div className="diff-col diff-expected">
                                          <span className="diff-col-title">Expected</span>
                                          <pre>{test.expectedOutput}</pre>
                                        </div>
                                        <div className="diff-col diff-actual">
                                          <span className="diff-col-title">Actual</span>
                                          <pre>{test.actualOutput || '(no output)'}</pre>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {test.expectedOutput !== undefined && <div><span>Expected</span><code>{test.expectedOutput}</code></div>}
                                      {test.actualOutput !== undefined && <div><span>Actual</span><code>{test.actualOutput || '(empty output)'}</code></div>}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                </div>
              )}
                </div>
          </div>

          <footer className="editor-footer">
            <button
              className="custom-test-button"
              onClick={() => {
                setCustomMode(true)
                setHasSubmitted(true)
                setOutputCollapsed(false)
                setActiveTab('custom')
              }}
            >
              <Terminal size={16} /> Custom test cases
            </button>
            <div className="submit-actions">
              <button className="run-button" onClick={runCode} disabled={running}>
                <Play size={16} fill="currentColor" /> Run
              </button>
              <button className="submit-button" onClick={submitCode} disabled={running}>
                {running ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                Submit
              </button>
            </div>
          </footer>
          </>
          )}
        </section>

      </main>
      {shortcutsOpen && (
        <div className="quit-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShortcutsOpen(false)
        }}>
          <div className="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-dialog-title">
            <div className="shortcuts-header">
              <h2 id="shortcuts-dialog-title">Keyboard Shortcuts</h2>
              <button
                className="quit-dialog-close"
                type="button"
                aria-label="Close shortcuts dialog"
                onClick={() => setShortcutsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="shortcuts-list">
              <div className="shortcut-row">
                <span>Run visible test cases</span>
                <kbd className="shortcut-key">Ctrl + Enter</kbd>
              </div>
              <div className="shortcut-row">
                <span>Run visible test cases (macOS)</span>
                <kbd className="shortcut-key">Cmd + Enter</kbd>
              </div>
              <div className="shortcut-row">
                <span>Close modal / dialog</span>
                <kbd className="shortcut-key">Esc</kbd>
              </div>
              <div className="shortcut-row">
                <span>Reset pane dimensions</span>
                <kbd className="shortcut-key">Double click resizers</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
      {quitDialogOpen && (
        <div className="quit-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !quitting) setQuitDialogOpen(false)
        }}>
          <div className="quit-dialog" role="dialog" aria-modal="true" aria-labelledby="quit-dialog-title" aria-describedby="quit-dialog-description">
            <button
              className="quit-dialog-close"
              type="button"
              aria-label="Close quit confirmation"
              onClick={() => setQuitDialogOpen(false)}
              disabled={quitting}
            >
              <X size={18} />
            </button>
            <div className="quit-dialog-icon"><LogOut size={20} /></div>
            <h2 id="quit-dialog-title">Quit this test?</h2>
            <p id="quit-dialog-description">
              Your current attempt will end and you will return to the home page. Your latest code will be saved before quitting.
            </p>
            <div className="quit-dialog-actions">
              <button type="button" className="quit-cancel-button" onClick={() => setQuitDialogOpen(false)} disabled={quitting}>
                Cancel
              </button>
              <button type="button" className="quit-confirm-button" onClick={quitTest} disabled={quitting}>
                {quitting ? <RefreshCw size={15} className="spin" /> : <LogOut size={15} />}
                {quitting ? 'Quitting...' : 'Quit Test'}
              </button>
            </div>
          </div>
        </div>
      )}
      {resetModalOpen && (
        <div className="quit-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setResetModalOpen(false)
        }}>
          <div className="quit-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-description">
            <button
              className="quit-dialog-close"
              type="button"
              aria-label="Close reset confirmation"
              onClick={() => setResetModalOpen(false)}
            >
              <X size={18} />
            </button>
            <div className="quit-dialog-icon"><RotateCcw size={20} /></div>
            <h2 id="reset-dialog-title">Reset Code Template</h2>
            <p id="reset-dialog-description">
              Are you sure you want to restore the default starter code for <strong>{language}</strong>? Any unsaved edits in your editor will be discarded.
            </p>
            <div className="quit-dialog-actions">
              <button type="button" className="quit-cancel-button" onClick={() => setResetModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="quit-confirm-button"
                onClick={() => {
                  const starter = question?.starterCode?.[language] || defaultStarterCode[language]
                  setCode(starter)
                  setResetModalOpen(false)
                }}
              >
                <RotateCcw size={15} />
                Reset Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

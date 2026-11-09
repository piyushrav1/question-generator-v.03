import type { AttemptDto, Difficulty, OutputComparisonMode, PracticeTimerDto, ProgrammingLanguage, QuestionDto, QuestionSearchQueryDto, QuestionSearchResultDto, TestCaseDto } from '../../../packages/shared/src/types.js'
import { MongoClient, type Db } from 'mongodb'
import type { SubmissionResultDto } from '../../../packages/shared/src/types.js'
import { randomUUID } from 'node:crypto'
import { curatedQuestions } from './curatedQuestions.js'

export class QuestionRepository {
  private readonly questions = new Map<string, QuestionDto>()
  private readonly attempts = new Map<string, AttemptDto>()
  private readonly submissions = new Map<string, SubmissionResultDto[]>()
  private readonly client?: MongoClient
  private readonly databaseName: string
  private db?: Db

  constructor(mongoUri?: string, databaseName = 'testmeman') {
    this.databaseName = databaseName
    this.client = mongoUri ? new MongoClient(mongoUri) : undefined
    for (const q of curatedQuestions) {
      this.questions.set(q.id, q)
    }
  }

  async findAttemptedQuestionIds(ownerId: string): Promise<string[]> {
    const db = await this.getDatabase()
    if (db) {
      const attempts = await db.collection<AttemptDto & { ownerId: string }>('attempts')
        .find({ ownerId })
        .project<{ questionId: string }>({ questionId: 1 })
        .toArray()
      return attempts.map((a) => a.questionId).filter(Boolean)
    }
    return Array.from(this.attempts.values())
      .filter((a) => (a as AttemptDto & { ownerId?: string }).ownerId === ownerId)
      .map((a) => a.questionId)
  }

  async findAttemptedQuestionTitles(ownerId: string): Promise<string[]> {
    const ids = await this.findAttemptedQuestionIds(ownerId)
    const titles: string[] = []
    for (const id of ids) {
      const q = await this.findById(id)
      if (q?.title) titles.push(q.title)
    }
    return titles
  }

  async save(input: {
    topic: string
    difficulty: Difficulty
    generated: {
      title: string
      statement: string
      constraints: string[]
      examples: Array<{ input: string; output: string }>
      starterCode: Record<ProgrammingLanguage, string>
      testCases: TestCaseDto[]
      inputFormat?: string
      outputFormat?: string
      comparisonMode?: OutputComparisonMode
    }
  }): Promise<QuestionDto> {
    const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const validTestCases = input.generated.testCases.filter((testCase) =>
      typeof testCase.input === 'string' && testCase.input.trim().length > 0,
    )
    const question: QuestionDto = {
      id,
      title: input.generated.title,
      difficulty: input.difficulty,
      topic: input.topic,
      statement: input.generated.statement,
      constraints: input.generated.constraints,
      examples: input.generated.examples,
      starterCode: input.generated.starterCode,
      testCases: validTestCases,
      inputFormat: input.generated.inputFormat,
      outputFormat: input.generated.outputFormat,
      comparisonMode: input.generated.comparisonMode,
    }
    this.questions.set(id, question)
    await this.persistQuestion(question)
    return question
  }

  async findById(id: string): Promise<QuestionDto | undefined> {
    const inMemory = this.questions.get(id)
    if (inMemory) {
      return {
        ...inMemory,
        testCases: inMemory.testCases.filter((testCase) => typeof testCase.input === 'string' && testCase.input.trim().length > 0),
      }
    }
    const db = await this.getDatabase()
    if (!db) return undefined
    const stored = await db.collection<QuestionDto>('questions').findOne({ id })
    if (!stored) return undefined
    return {
      ...stored,
      testCases: stored.testCases.filter((testCase) => typeof testCase.input === 'string' && testCase.input.trim().length > 0),
    }
  }

  async search(filter: QuestionSearchQueryDto = {}): Promise<QuestionSearchResultDto> {
    const page = Math.max(1, filter.page ?? 1)
    const limit = Math.max(1, Math.min(50, filter.limit ?? 10))
    const skip = (page - 1) * limit

    const db = await this.getDatabase()
    if (db) {
      const query: Record<string, any> = {}
      if (filter.topic) {
        query.topic = { $regex: new RegExp(`^${filter.topic}$`, 'i') }
      }
      if (filter.difficulty) {
        query.difficulty = filter.difficulty
      }
      if (filter.query) {
        const escaped = filter.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        query.$or = [
          { title: { $regex: escaped, $options: 'i' } },
          { statement: { $regex: escaped, $options: 'i' } },
        ]
      }
      const total = await db.collection<QuestionDto>('questions').countDocuments(query)
      const items = await db.collection<QuestionDto>('questions')
        .find(query)
        .skip(skip)
        .limit(limit)
        .toArray()

      return {
        items: items.map((stored) => ({
          ...stored,
          testCases: stored.testCases.filter((testCase) => typeof testCase.input === 'string' && testCase.input.trim().length > 0),
        })),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      }
    }

    let matches = Array.from(this.questions.values())
    if (filter.topic) {
      const topicLower = filter.topic.toLowerCase()
      matches = matches.filter((q) => q.topic.toLowerCase() === topicLower)
    }
    if (filter.difficulty) {
      matches = matches.filter((q) => q.difficulty === filter.difficulty)
    }
    if (filter.query) {
      const qLower = filter.query.toLowerCase()
      matches = matches.filter((q) =>
        q.title.toLowerCase().includes(qLower) || q.statement.toLowerCase().includes(qLower),
      )
    }

    const total = matches.length
    const paged = matches.slice(skip, skip + limit).map((inMemory) => ({
      ...inMemory,
      testCases: inMemory.testCases.filter((testCase) => typeof testCase.input === 'string' && testCase.input.trim().length > 0),
    }))

    return {
      items: paged,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  async findActiveAttempt(ownerId: string): Promise<AttemptDto | undefined> {
    const db = await this.getDatabase()
    if (!db) {
      return Array.from(this.attempts.values()).find((attempt) => {
        const stored = attempt as AttemptDto & { ownerId?: string }
        return stored.ownerId === ownerId && attempt.status === 'active'
      })
    }
    const stored = await db.collection<AttemptDto & { ownerId: string }>('attempts').findOne({
      ownerId,
      status: 'active',
    })
    if (!stored) return undefined
    const question = await this.findById(stored.questionId)
    return question ? { ...stored, question } : undefined
  }

  async createAttempt(ownerId: string, question: QuestionDto, language: ProgrammingLanguage, code: string): Promise<AttemptDto> {
    const now = new Date().toISOString()
    const durationSeconds = question.difficulty === 'easy' ? 30 * 60 : question.difficulty === 'hard' ? 60 * 60 : 45 * 60
    const attempt: AttemptDto = {
      id: `a-${randomUUID()}`,
      questionId: question.id,
      question,
      language,
      code,
      status: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
      timer: {
        durationSeconds,
        remainingSeconds: durationSeconds,
        startedAt: now,
        expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
        status: 'running',
        pauseCount: 0,
      },
    }
    const db = await this.getDatabase()
    if (!db) {
      const key = `${ownerId}:${attempt.id}`
      this.attempts.set(key, Object.assign(attempt, { ownerId }))
      return attempt
    }
    await db.collection('attempts').insertOne({ ...attempt, ownerId })
    return attempt
  }

  async saveAttemptDraft(ownerId: string, attemptId: string, language: ProgrammingLanguage, code: string, revision: number): Promise<AttemptDto | undefined> {
    const db = await this.getDatabase()
    if (!db) {
      let stored = Array.from(this.attempts.entries()).find(([key, attempt]) =>
        key.startsWith(`${ownerId}:`) && attempt.id === attemptId,
      )
      if (!stored) {
        stored = Array.from(this.attempts.entries()).find(([_, attempt]) => attempt.id === attemptId)
      }
      if (!stored) return undefined
      const attempt = stored[1]
      attempt.language = language
      attempt.code = code
      attempt.revision = Math.max(attempt.revision, revision)
      attempt.updatedAt = new Date().toISOString()
      return attempt
    }
    let result = await db.collection<AttemptDto & { ownerId: string }>('attempts').findOneAndUpdate(
      { id: attemptId, ownerId, status: 'active', revision: { $lte: revision } },
      { $set: { language, code, revision, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' },
    )
    if (!result) {
      result = await db.collection<AttemptDto & { ownerId: string }>('attempts').findOneAndUpdate(
        { id: attemptId, status: 'active' },
        { $set: { ownerId, language, code, revision, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
    }
    if (!result) return undefined
    const question = await this.findById(result.questionId)
    return question ? { ...result, question } : undefined
  }

  async findAttempt(ownerId: string, attemptId: string): Promise<AttemptDto | undefined> {
    const db = await this.getDatabase()
    if (!db) {
      let stored = Array.from(this.attempts.entries()).find(([key, attempt]) =>
        key === `${ownerId}:${attemptId}`,
      )
      if (!stored) {
        stored = Array.from(this.attempts.entries()).find(([_, attempt]) => attempt.id === attemptId)
      }
      if (!stored) return undefined
      const attempt = stored[1] as AttemptDto
      const question = await this.findById(attempt.questionId)
      return question ? { ...attempt, question } : undefined
    }
    let stored = await db.collection<AttemptDto & { ownerId: string }>('attempts').findOne({
      id: attemptId,
      ownerId,
      status: 'active',
    })
    if (!stored) {
      stored = await db.collection<AttemptDto & { ownerId: string }>('attempts').findOne({
        id: attemptId,
        status: 'active',
      })
    }
    if (!stored) return undefined
    const question = await this.findById(stored.questionId)
    return question ? { ...stored, question } : undefined
  }

  async updateAttemptTimer(
    ownerId: string,
    attemptId: string,
    action: 'pause' | 'resume' | 'reset' | 'extend',
    seconds = 300,
  ): Promise<AttemptDto | undefined> {
    const attempt = await this.findAttempt(ownerId, attemptId)
    if (!attempt) return undefined
    const now = Date.now()
    let timer = this.normalizeTimer(attempt)

    if (timer.status === 'running' && timer.expiresAt && Date.parse(timer.expiresAt) <= now) {
      timer = { ...timer, status: 'expired', remainingSeconds: 0, expiresAt: timer.expiresAt, expiredAt: timer.expiredAt ?? new Date(now).toISOString() }
    } else if (timer.status === 'running' && timer.expiresAt) {
      timer.remainingSeconds = Math.max(0, Math.ceil((Date.parse(timer.expiresAt) - now) / 1000))
    }

    if (action === 'pause' && timer.status === 'running') {
      timer = { ...timer, status: 'paused', expiresAt: null, pauseCount: timer.pauseCount + 1 }
    } else if (action === 'resume' && timer.status === 'paused' && timer.remainingSeconds > 0) {
      timer = { ...timer, status: 'running', expiresAt: new Date(now + timer.remainingSeconds * 1000).toISOString() }
    } else if (action === 'reset') {
      timer = {
        ...timer,
        remainingSeconds: timer.durationSeconds,
        startedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + timer.durationSeconds * 1000).toISOString(),
        status: 'running',
        expiredAt: undefined,
      }
    } else if (action === 'extend' && timer.status !== 'expired') {
      timer.remainingSeconds += seconds
      timer.durationSeconds += seconds
      if (timer.status === 'running') {
        timer.expiresAt = new Date(now + timer.remainingSeconds * 1000).toISOString()
      }
    } else if (action === 'extend' && timer.status === 'expired') {
      timer.remainingSeconds = seconds
      timer.durationSeconds += seconds
      timer.status = 'running'
      timer.startedAt = new Date(now).toISOString()
      timer.expiresAt = new Date(now + seconds * 1000).toISOString()
      timer.expiredAt = undefined
    }

    attempt.timer = timer
    attempt.updatedAt = new Date(now).toISOString()
    const db = await this.getDatabase()
    if (!db) {
      const key = `${ownerId}:${attemptId}`
      const stored = this.attempts.get(key)
      if (stored) Object.assign(stored, { timer, updatedAt: attempt.updatedAt })
      return attempt
    }
    const result = await db.collection<AttemptDto & { ownerId: string }>('attempts').findOneAndUpdate(
      { id: attemptId, ownerId, status: 'active' },
      { $set: { timer, updatedAt: attempt.updatedAt } },
      { returnDocument: 'after' },
    )
    if (!result) return undefined
    return { ...result, question: attempt.question }
  }

  normalizeTimer(attempt: AttemptDto): PracticeTimerDto {
    if (attempt.timer) {
      const timer = attempt.timer
      if (timer.status === 'running' && timer.expiresAt) {
        const remaining = Math.max(0, Math.ceil((Date.parse(timer.expiresAt) - Date.now()) / 1000))
        if (remaining === 0) {
          return { ...timer, status: 'expired', remainingSeconds: 0, expiredAt: timer.expiredAt ?? new Date().toISOString() }
        }
        return { ...timer, remainingSeconds: remaining }
      }
      return timer
    }
    const durationSeconds = attempt.question.difficulty === 'easy' ? 1800 : attempt.question.difficulty === 'hard' ? 3600 : 2700
    const startedAt = attempt.createdAt
    const expiresAt = new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString()
    const remainingSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000))
    return remainingSeconds === 0
      ? { durationSeconds, remainingSeconds: 0, startedAt, expiresAt, status: 'expired', pauseCount: 0, expiredAt: expiresAt }
      : { durationSeconds, remainingSeconds, startedAt, expiresAt, status: 'running', pauseCount: 0 }
  }

  async abandonAttempt(ownerId: string, attemptId: string): Promise<void> {
    const db = await this.getDatabase()
    if (!db) {
      const stored = Array.from(this.attempts.entries()).find(([key, attempt]) =>
        key.startsWith(`${ownerId}:`) && attempt.id === attemptId,
      )
      if (stored) {
        stored[1].status = 'abandoned'
        stored[1].updatedAt = new Date().toISOString()
      }
      return
    }
    await db.collection('attempts').updateOne(
      { id: attemptId, ownerId, status: 'active' },
      { $set: { status: 'abandoned', updatedAt: new Date().toISOString() } },
    )
  }

  async saveSubmission(ownerId: string, result: SubmissionResultDto): Promise<void> {
    const db = await this.getDatabase()
    if (!db) {
      const key = `${ownerId}:${result.questionId}`
      const history = this.submissions.get(key) ?? []
      this.submissions.set(key, [result, ...history].slice(0, 20))
      return
    }
    await db.collection<SubmissionResultDto & { ownerId: string }>('submissions').insertOne({ ...result, ownerId })
  }

  async findSubmissions(ownerId: string, questionId: string): Promise<SubmissionResultDto[]> {
    const db = await this.getDatabase()
    if (!db) return this.submissions.get(`${ownerId}:${questionId}`) ?? []
    return db.collection<SubmissionResultDto & { ownerId: string }>('submissions')
      .find({ ownerId, questionId, submitted: true })
      .sort({ _id: -1 })
      .limit(20)
      .toArray()
      .then((rows) => rows.map(({ ownerId: _ownerId, ...result }) => result))
  }

  private async getDatabase(): Promise<Db | undefined> {
    if (!this.client) return undefined
    if (!this.db) {
      await this.client.connect()
      this.db = this.client.db(this.databaseName)
      await this.db.collection('questions').createIndex({ id: 1 }, { unique: true })
      await this.db.collection('submissions').createIndex({ questionId: 1, id: 1 })
      await this.db.collection('attempts').createIndex({ ownerId: 1, status: 1, updatedAt: -1 })
      await this.db.collection('attempts').createIndex({ id: 1 }, { unique: true })
    }
    return this.db
  }

  private async persistQuestion(question: QuestionDto): Promise<void> {
    const db = await this.getDatabase()
    if (!db) return
    await db.collection<QuestionDto>('questions').replaceOne(
      { id: question.id },
      question,
      { upsert: true },
    )
  }
}

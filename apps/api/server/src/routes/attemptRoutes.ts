import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { DIFFICULTIES, PROGRAMMING_LANGUAGES, type AttemptDto, type ProgrammingLanguage } from '../../../../../packages/shared/src/types.js'
import { QuestionRepository } from '../../../../../services/question-engine/src/questionRepository.js'
import { QuestionService } from '../../../../../services/question-engine/src/questionService.js'
import { validateBody } from '../middleware/validateRequest.js'

const COOKIE_NAME = 'testmeman_session'
const draftSchema = z.object({
  attemptId: z.string().trim().min(1).max(100),
  language: z.enum(PROGRAMMING_LANGUAGES),
  code: z.string().max(100_000).default(''),
  revision: z.coerce.number().int().min(1).default(1),
})
const quitAttemptSchema = z.object({
  language: z.enum(PROGRAMMING_LANGUAGES),
  code: z.string().max(100_000).default(''),
  revision: z.coerce.number().int().min(1).default(1),
})
const newAttemptSchema = z.object({
  topic: z.string().trim().min(1).max(50).default('arrays'),
  difficulty: z.enum(DIFFICULTIES).default('medium'),
  language: z.enum(PROGRAMMING_LANGUAGES).default('Python'),
  categories: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  customPrompt: z.string().trim().max(500).optional(),
})

export function getOwnerId(request: Request, response: Response): string {
  const headerSession = request.headers['x-session-id']
  if (typeof headerSession === 'string' && headerSession.trim()) {
    return headerSession.trim()
  }

  const cookie = request.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`))
  const existing = cookie?.slice(COOKIE_NAME.length + 1)
  if (existing) return decodeURIComponent(existing)

  const ownerId = randomUUID()
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(ownerId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`,
  )
  return ownerId
}

function publicAttempt(attempt: AttemptDto): AttemptDto {
  if (!attempt.timer) {
    const durationSeconds = attempt.question.difficulty === 'easy' ? 1800 : attempt.question.difficulty === 'hard' ? 3600 : 2700
    const expiresAt = new Date(Date.parse(attempt.createdAt) + durationSeconds * 1000).toISOString()
    const remainingSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000))
    attempt.timer = remainingSeconds === 0
      ? { durationSeconds, remainingSeconds: 0, startedAt: attempt.createdAt, expiresAt, status: 'expired', pauseCount: 0, expiredAt: expiresAt }
      : { durationSeconds, remainingSeconds, startedAt: attempt.createdAt, expiresAt, status: 'running', pauseCount: 0 }
  } else if (attempt.timer.status === 'running' && attempt.timer.expiresAt) {
    const remainingSeconds = Math.max(0, Math.ceil((Date.parse(attempt.timer.expiresAt) - Date.now()) / 1000))
    attempt.timer = remainingSeconds === 0
      ? { ...attempt.timer, status: 'expired', remainingSeconds: 0, expiredAt: attempt.timer.expiredAt ?? new Date().toISOString() }
      : { ...attempt.timer, remainingSeconds }
  }
  return {
    ...attempt,
    question: {
      ...attempt.question,
      testCases: attempt.question.testCases.map((testCase) =>
        testCase.hidden
          ? { id: testCase.id, name: testCase.name, input: '', hidden: true }
          : testCase,
      ),
    },
  }
}

export function createAttemptRouter(repository: QuestionRepository, questionService: QuestionService): Router {
  const router = Router()

  router.get('/active', async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const attempt = await repository.findActiveAttempt(ownerId)
      if (!attempt) {
        response.status(404).json({ error: { message: 'No active attempt found.', code: 'NO_ACTIVE_ATTEMPT' } })
        return
      }
      response.json(publicAttempt(attempt))
    } catch (error) {
      next(error)
    }
  })

  router.get('/resume', async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const attempt = await repository.findActiveAttempt(ownerId)
      response.json(attempt ? publicAttempt(attempt) : null)
    } catch (error) {
      next(error)
    }
  })

  router.get('/:attemptId/timer', async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const attempt = await repository.findAttempt(ownerId, request.params.attemptId)
      if (!attempt) {
        response.status(404).json({ error: { message: 'Active attempt not found.', code: 'ATTEMPT_NOT_FOUND' } })
        return
      }
      response.json(publicAttempt(attempt).timer)
    } catch (error) {
      next(error)
    }
  })

  router.post('/:attemptId/timer/:action', async (request, response, next) => {
    try {
      const action = request.params.action
      if (!['pause', 'resume', 'reset', 'extend'].includes(action)) {
        response.status(400).json({ error: { message: 'Invalid timer action.', code: 'INVALID_TIMER_ACTION' } })
        return
      }
      const ownerId = getOwnerId(request, response)
      const seconds = typeof request.body?.seconds === 'number' ? Math.min(3600, Math.max(60, request.body.seconds)) : 300
      const attempt = await repository.updateAttemptTimer(ownerId, request.params.attemptId, action as 'pause' | 'resume' | 'reset' | 'extend', seconds)
      if (!attempt) {
        response.status(404).json({ error: { message: 'Active attempt not found.', code: 'ATTEMPT_NOT_FOUND' } })
        return
      }
      response.json(publicAttempt(attempt).timer)
    } catch (error) {
      next(error)
    }
  })

  router.post('/new', validateBody(newAttemptSchema), async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const active = await repository.findActiveAttempt(ownerId)
      if (active) await repository.abandonAttempt(ownerId, active.id)

      const excludeIds = await repository.findAttemptedQuestionIds(ownerId)
      const excludeTitles = await repository.findAttemptedQuestionTitles(ownerId)

      const question = await questionService.generate(request.body.topic, request.body.difficulty, {
        excludeIds,
        excludeTitles,
        categories: request.body.categories,
        customPrompt: request.body.customPrompt,
      })
      const language = request.body.language as ProgrammingLanguage
      const attempt = await repository.createAttempt(ownerId, question, language, question.starterCode[language])
      response.status(201).json(publicAttempt(attempt))
    } catch (error) {
      next(error)
    }
  })

  router.put('/draft', validateBody(draftSchema), async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const attempt = await repository.saveAttemptDraft(
        ownerId,
        request.body.attemptId,
        request.body.language,
        request.body.code,
        request.body.revision,
      )
      if (!attempt) {
        response.status(404).json({ error: { message: 'Active attempt not found.', code: 'ATTEMPT_NOT_FOUND' } })
        return
      }
      response.json(publicAttempt(attempt))
    } catch (error) {
      next(error)
    }
  })

  router.post('/:attemptId/quit', validateBody(quitAttemptSchema), async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const attemptId = Array.isArray(request.params.attemptId)
        ? request.params.attemptId[0]
        : request.params.attemptId
      const saved = await repository.saveAttemptDraft(
        ownerId,
        attemptId,
        request.body.language,
        request.body.code,
        request.body.revision,
      )
      if (!saved) {
        response.status(404).json({ error: { message: 'Active attempt not found.', code: 'ATTEMPT_NOT_FOUND' } })
        return
      }
      await repository.abandonAttempt(ownerId, attemptId)
      response.json({ status: 'abandoned' })
    } catch (error) {
      next(error)
    }
  })

  return router
}

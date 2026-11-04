import { Router } from 'express'
import { z } from 'zod'
import { PROGRAMMING_LANGUAGES } from '../../../../../packages/shared/src/types.js'
import { validateBody } from '../middleware/validateRequest.js'
import { SubmissionService } from '../../../../../services/execution-engine/src/submissionService.js'
import { QuestionRepository } from '../../../../../services/question-engine/src/questionRepository.js'
import { getOwnerId } from './attemptRoutes.js'

const submissionSchema = z.object({
  questionId: z.string().trim().min(1).max(100),
  language: z.enum(PROGRAMMING_LANGUAGES),
  code: z.string().min(20).max(100_000),
  submitted: z.boolean().default(false),
  customInput: z.string().max(10_000).optional(),
  customExpectedOutput: z.string().max(10_000).optional(),
})

export function createSubmissionRouter(service: SubmissionService, repository: QuestionRepository): Router {
  const router = Router()

  router.get('/', async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      const questionId = typeof request.query.questionId === 'string' ? request.query.questionId : ''
      if (!questionId) {
        response.status(400).json({ error: { message: 'questionId is required.', code: 'QUESTION_ID_REQUIRED' } })
        return
      }
      response.json(await repository.findSubmissions(ownerId, questionId))
    } catch (error) {
      next(error)
    }
  })

  router.post('/', validateBody(submissionSchema), async (request, response, next) => {
    try {
      const ownerId = getOwnerId(request, response)
      response.status(201).json(await service.evaluate(request.body, ownerId))
    } catch (error) {
      next(error)
    }
  })

  return router
}

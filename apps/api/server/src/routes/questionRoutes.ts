import { Router } from 'express'
import { z } from 'zod'
import { DIFFICULTIES } from '../../../../../packages/shared/src/types.js'
import { validateBody } from '../middleware/validateRequest.js'
import { QuestionService } from '../../../../../services/question-engine/src/questionService.js'

const generateSchema = z.object({
  topic: z.string().trim().min(1).max(50).default('arrays'),
  difficulty: z.enum(DIFFICULTIES).default('medium'),
})

export function createQuestionRouter(service: QuestionService): Router {
  const router = Router()

  router.post('/generate', validateBody(generateSchema), async (request, response, next) => {
    try {
      const result = await service.generate(request.body.topic, request.body.difficulty)
      response.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', async (request, response, next) => {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id
    try {
      response.json(await service.getById(id))
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/hints', async (request, response, next) => {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id
    const level = typeof request.body?.level === 'number' ? request.body.level : 1
    try {
      response.json(await service.getHint(id, level))
    } catch (error) {
      next(error)
    }
  })

  return router
}

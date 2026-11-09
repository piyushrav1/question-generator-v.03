import test from 'node:test'
import assert from 'node:assert/strict'
import { QuestionService } from '../src/questionService.js'
import { QuestionRepository } from '../src/questionRepository.js'

test('QuestionService delivers progressive 3-tier hints for curated problems', async () => {
  const repo = new QuestionRepository()
  const service = new QuestionService(repo)

  // Tier 1: Intuition
  const hint1 = await service.getHint('curated-stacks-next-greater', 1)
  assert.equal(hint1.level, 1)
  assert.equal(hint1.totalLevels, 3)
  assert.ok(hint1.title.includes('Tier 1'))
  assert.ok(hint1.content.toLowerCase().includes('stack'))

  // Tier 2: Approach
  const hint2 = await service.getHint('curated-stacks-next-greater', 2)
  assert.equal(hint2.level, 2)
  assert.ok(hint2.title.includes('Tier 2'))
  assert.ok(hint2.content.toLowerCase().includes('monotonic stack'))

  // Tier 3: Edge cases
  const hint3 = await service.getHint('curated-stacks-next-greater', 3)
  assert.equal(hint3.level, 3)
  assert.ok(hint3.title.includes('Tier 3'))
  assert.ok(hint3.content.toLowerCase().includes('decreasing'))
})

test('QuestionService clamps out-of-bounds requested hint levels to [1, 3]', async () => {
  const repo = new QuestionRepository()
  const service = new QuestionService(repo)

  const lowHint = await service.getHint('curated-dp-coin-change', -5)
  assert.equal(lowHint.level, 1)

  const highHint = await service.getHint('curated-dp-coin-change', 100)
  assert.equal(highHint.level, 3)
})

test('QuestionService throws 404 when requesting hint for non-existent question', async () => {
  const repo = new QuestionRepository()
  const service = new QuestionService(repo)

  await assert.rejects(
    service.getHint('invalid-non-existent-question-id'),
    { message: 'Question not found.' },
  )
})

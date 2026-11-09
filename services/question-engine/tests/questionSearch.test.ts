import test from 'node:test'
import assert from 'node:assert/strict'
import { QuestionRepository } from '../src/questionRepository.js'
import { QuestionService } from '../src/questionService.js'

test('QuestionRepository.search returns all curated questions paginated by default', async () => {
  const repo = new QuestionRepository()
  const result = await repo.search()

  assert.ok(result.total >= 3, `Expected at least 3 curated questions, got ${result.total}`)
  assert.equal(result.page, 1)
  assert.equal(result.limit, 10)
  assert.ok(result.items.length > 0)
})

test('QuestionRepository.search filters by topic case-insensitively', async () => {
  const repo = new QuestionRepository()
  const result = await repo.search({ topic: 'stacks' })

  assert.ok(result.total >= 1)
  assert.ok(result.items.every((q) => q.topic.toLowerCase() === 'stacks'))
})

test('QuestionRepository.search filters by difficulty', async () => {
  const repo = new QuestionRepository()
  const result = await repo.search({ difficulty: 'medium' })

  assert.ok(result.total >= 1)
  assert.ok(result.items.every((q) => q.difficulty === 'medium'))
})

test('QuestionRepository.search filters by text query across title and statement', async () => {
  const repo = new QuestionRepository()
  const result = await repo.search({ query: 'Two Sum' })

  assert.ok(result.total >= 1)
  assert.ok(result.items.some((q) => q.title.toLowerCase().includes('two sum')))
})

test('QuestionRepository.search paginates results accurately', async () => {
  const repo = new QuestionRepository()
  const page1 = await repo.search({ limit: 2, page: 1 })
  const page2 = await repo.search({ limit: 2, page: 2 })

  assert.equal(page1.items.length, 2)
  assert.equal(page1.page, 1)
  assert.equal(page2.page, 2)
  assert.notEqual(page1.items[0].id, page2.items[0].id)
})

test('QuestionService.search redacts hidden test cases from results', async () => {
  const repo = new QuestionRepository()
  const service = new QuestionService(repo)
  const result = await service.search({ topic: 'arrays' })

  assert.ok(result.items.length > 0)
  for (const item of result.items) {
    for (const tc of item.testCases) {
      if (tc.hidden) {
        assert.equal(tc.input, '', 'Hidden test case input must be redacted')
      }
    }
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from '../server/src/middleware/rateLimiter.js'

function createMockReqRes(ip = '127.0.0.1') {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let jsonBody: any = null

  const req = {
    ip,
    socket: { remoteAddress: ip },
  } as any

  const res = {
    setHeader(name: string, val: string) {
      headers[name] = val
    },
    status(code: number) {
      statusCode = code
      return res
    },
    json(body: any) {
      jsonBody = body
      return res
    },
  } as any

  return { req, res, getHeaders: () => headers, getStatus: () => statusCode, getBody: () => jsonBody }
}

test('rateLimiter permits requests within the limit and sets headers', () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 3 })
  const { req, res, getHeaders, getStatus } = createMockReqRes()

  let nextCalled = false
  limiter(req, res, () => { nextCalled = true })

  assert.equal(nextCalled, true)
  assert.equal(getStatus(), 200)
  assert.equal(getHeaders()['X-RateLimit-Limit'], '3')
  assert.equal(getHeaders()['X-RateLimit-Remaining'], '2')
})

test('rateLimiter blocks requests exceeding maxRequests with 429', () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 2, message: 'Too many calls.' })
  const { req, res, getStatus, getBody } = createMockReqRes()

  // First 2 requests should succeed
  limiter(req, res, () => {})
  limiter(req, res, () => {})

  // 3rd request should be blocked
  let nextCalled = false
  limiter(req, res, () => { nextCalled = true })

  assert.equal(nextCalled, false)
  assert.equal(getStatus(), 429)
  assert.equal(getBody()?.error?.code, 'RATE_LIMIT_EXCEEDED')
  assert.equal(getBody()?.error?.message, 'Too many calls.')
})

test('rateLimiter isolates different clients', () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 })

  const clientA = createMockReqRes('10.0.0.1')
  const clientB = createMockReqRes('10.0.0.2')

  let clientANext = false
  limiter(clientA.req, clientA.res, () => { clientANext = true })
  assert.equal(clientANext, true)

  // Client A should now be rate limited on 2nd request
  let clientASecond = false
  limiter(clientA.req, clientA.res, () => { clientASecond = true })
  assert.equal(clientASecond, false)
  assert.equal(clientA.getStatus(), 429)

  // Client B should still be allowed
  let clientBNext = false
  limiter(clientB.req, clientB.res, () => { clientBNext = true })
  assert.equal(clientBNext, true)
  assert.equal(clientB.getStatus(), 200)
})

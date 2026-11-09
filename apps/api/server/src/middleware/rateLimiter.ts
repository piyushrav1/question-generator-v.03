import type { Request, Response, NextFunction } from 'express'

export interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  message?: string
  keyGenerator?: (req: Request) => string
}

interface ClientRecord {
  timestamps: number[]
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-client',
  } = options

  const clients = new Map<string, ClientRecord>()

  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of clients.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs)
      if (record.timestamps.length === 0) {
        clients.delete(key)
      }
    }
  }, Math.max(windowMs, 30_000))
  cleanupInterval.unref?.()

  return function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = keyGenerator(req)
    const now = Date.now()

    let record = clients.get(key)
    if (!record) {
      record = { timestamps: [] }
      clients.set(key, record)
    }

    // Filter timestamps within current window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs)

    const remaining = Math.max(0, maxRequests - record.timestamps.length)
    const oldestTimestamp = record.timestamps[0] ?? now
    const resetSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000)

    res.setHeader('X-RateLimit-Limit', String(maxRequests))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining - 1)))
    res.setHeader('X-RateLimit-Reset', String(Math.max(0, resetSeconds)))

    if (record.timestamps.length >= maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, resetSeconds)))
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfterSeconds: Math.max(1, resetSeconds),
        },
      })
      return
    }

    record.timestamps.push(now)
    next()
  }
}

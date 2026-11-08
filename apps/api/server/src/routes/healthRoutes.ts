import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  const mem = process.memoryUsage()
  response.json({
    status: 'ok',
    service: 'TestMeMan API',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
    },
    integrations: {
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder_gemini_key'),
      mongoConfigured: Boolean(process.env.MONGODB_URI),
    },
  })
})

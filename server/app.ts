/** Fastify 应用装配（启动与测试共用）。 */
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import type { DB } from './db/connection'
import type { AppConfig } from './env'
import { registerAuthRoutes } from './routes/auth'
import { registerMeRoutes } from './routes/me'
import { registerBooksRoutes } from './routes/books'
import { registerTodayRoutes } from './routes/today'
import { registerStatsRoutes } from './routes/stats'

/** 前端构建产物目录（dist/client），存在且为生产模式时托管。 */
export function clientDistDir(): string {
  return path.resolve(__dirname, '../../dist/client')
}

export async function buildApp(db: DB, config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProd ? true : { level: 'warn' },
  })

  await app.register(cookie)

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }))

  registerAuthRoutes(app, db, config)
  registerMeRoutes(app, db)
  registerBooksRoutes(app, db)
  registerTodayRoutes(app, db)
  registerStatsRoutes(app, db)

  // 统一错误输出：不吞异常，也不向客户端泄漏内部细节
  app.setErrorHandler((err, request, reply) => {
    app.log.error(err, `error on ${request.method} ${request.url}`)
    reply.code(500).send({ error: 'INTERNAL_ERROR' })
  })

  const staticRoot = clientDistDir()
  const serveStatic = config.isProd && existsSync(staticRoot)
  if (serveStatic) {
    await app.register(fastifyStatic, { root: staticRoot })
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'NOT_FOUND' })
      return
    }
    if (serveStatic && request.method === 'GET') {
      // SPA fallback：非 API 的 GET 一律回 index.html（前端路由接管）
      return reply.sendFile('index.html')
    }
    reply.code(404).send({ error: 'NOT_FOUND' })
  })

  return app
}

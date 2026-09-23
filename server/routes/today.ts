import type { FastifyInstance } from 'fastify'
import type { DB } from '../db/connection'
import { requireAuth } from '../auth/session'
import { getTodayInfo, getQueue, submitAnswer, BizError, type AnswerBody } from '../study-service'
import { todayInShanghai } from '../core/dates'
import { STUDY_MODES, type StudyMode } from '../../shared/types'

export function registerTodayRoutes(app: FastifyInstance, db: DB): void {
  const auth = requireAuth(db)

  app.get('/api/today', { preHandler: auth }, async (request) => {
    return getTodayInfo(db, request.user!, todayInShanghai())
  })

  app.get('/api/study/queue', { preHandler: auth }, async (request, reply) => {
    const query = request.query as { mode?: string }
    if (!query.mode || !STUDY_MODES.includes(query.mode as StudyMode)) {
      reply.code(400).send({ error: 'BAD_MODE' })
      return
    }
    return getQueue(db, request.user!, query.mode as StudyMode, todayInShanghai())
  })

  app.post('/api/study/answer', { preHandler: auth }, async (request, reply) => {
    const body = request.body as AnswerBody | null
    if (!body || typeof body !== 'object') {
      reply.code(400).send({ error: 'BAD_BODY' })
      return
    }
    if (!body.mode || !STUDY_MODES.includes(body.mode)) {
      reply.code(400).send({ error: 'BAD_MODE' })
      return
    }
    try {
      return submitAnswer(db, request.user!, body, new Date())
    } catch (err) {
      if (err instanceof BizError) {
        reply.code(err.code).send({ error: err.error })
        return
      }
      throw err
    }
  })
}

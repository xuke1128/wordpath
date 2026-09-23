import type { FastifyInstance } from 'fastify'
import type { DB } from '../db/connection'
import * as repo from '../db/repo'
import { requireAuth } from '../auth/session'
import { getBook } from '../db/repo'
import type { MeDTO, StudyMode } from '../../shared/types'
import { STUDY_MODES } from '../../shared/types'

function toMeDTO(db: DB, userId: string): MeDTO | null {
  const user = repo.getUser(db, userId)
  if (!user) return null
  let activeBook: MeDTO['activeBook'] = null
  if (user.active_book_id) {
    const book = getBook(db, user.active_book_id)
    if (book) activeBook = { id: book.id, name: book.name }
  }
  return {
    user: { id: user.id, nickname: user.nickname, provider: user.provider },
    settings: { dailyNewLimit: user.daily_new_limit, lastMode: user.last_mode },
    activeBook,
  }
}

export function registerMeRoutes(app: FastifyInstance, db: DB): void {
  const auth = requireAuth(db)

  app.get('/api/me', { preHandler: auth }, async (request) => {
    const dto = toMeDTO(db, request.user!.id)
    if (!dto) throw new Error('user vanished')
    return dto
  })

  app.patch('/api/me/settings', { preHandler: auth }, async (request, reply) => {
    const body = (request.body ?? {}) as { dailyNewLimit?: unknown; lastMode?: unknown }
    const patch: Parameters<typeof repo.updateUser>[2] = {}

    if (body.dailyNewLimit !== undefined) {
      const n = body.dailyNewLimit
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 5 || n > 100) {
        reply.code(400).send({ error: 'BAD_DAILY_NEW_LIMIT', message: '每日新词量需为 5-100 的整数' })
        return
      }
      patch.daily_new_limit = n
    }
    if (body.lastMode !== undefined) {
      if (typeof body.lastMode !== 'string' || !STUDY_MODES.includes(body.lastMode as StudyMode)) {
        reply.code(400).send({ error: 'BAD_LAST_MODE' })
        return
      }
      patch.last_mode = body.lastMode as StudyMode
    }
    repo.updateUser(db, request.user!.id, patch)
    const dto = toMeDTO(db, request.user!.id)
    if (!dto) throw new Error('user vanished')
    return dto
  })
}

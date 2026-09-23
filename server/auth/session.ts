/** 会话 cookie 处理与鉴权预处理器。 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UserRow } from '../db/repo'
import { getSessionUser } from '../db/repo'
import type { DB } from '../db/connection'

export const SESSION_COOKIE = 'wp_session'
export const DEVICE_COOKIE = 'wp_device'
export const OAUTH_STATE_COOKIE = 'wp_oauth_state'
export const SESSION_TTL_DAYS = 30
export const DEVICE_TTL_DAYS = 365

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow
  }
}

export function readSessionToken(request: FastifyRequest): string | null {
  return request.cookies[SESSION_COOKIE] ?? null
}

/** requireAuth 预处理器：未登录回 401；已登录把 user 挂到 request.user。 */
export function requireAuth(db: DB) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = readSessionToken(request)
    const user = token ? getSessionUser(db, token) : null
    if (!user) {
      await reply.code(401).send({ error: 'UNAUTHORIZED' })
      return
    }
    request.user = user
  }
}

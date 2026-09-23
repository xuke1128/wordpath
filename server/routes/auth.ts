import type { FastifyInstance } from 'fastify'
import type { DB } from '../db/connection'
import * as repo from '../db/repo'
import { SESSION_COOKIE, DEVICE_COOKIE, OAUTH_STATE_COOKIE, SESSION_TTL_DAYS, DEVICE_TTL_DAYS } from '../auth/session'
import { buildAuthorizeUrl, exchangeCode, newState, type WechatCreds } from '../auth/wechat'
import type { AppConfig } from '../env'
import type { AuthConfigDTO } from '../../shared/types'

export function registerAuthRoutes(app: FastifyInstance, db: DB, config: AppConfig): void {
  const creds: WechatCreds | null = config.wechat

  app.get('/api/auth/config', async () => {
    const body: AuthConfigDTO = { mock: true, wechat: creds !== null }
    return body
  })

  app.post('/api/auth/mock', async (_request, reply) => {
    // 设备 cookie：同一浏览器重复体验登录复用账号（US1）
    let deviceId = _request.cookies[DEVICE_COOKIE]
    if (!deviceId) deviceId = `d_${newState()}`
    const user = repo.findMockUserByDevice(db, deviceId) ?? repo.createUser(db, {
      provider: 'mock',
      providerId: deviceId,
      nickname: `体验用户 #${1000 + Math.floor(Math.random() * 9000)}`,
      deviceId,
    })
    const { token, expiresAt } = repo.createSession(db, user.id, SESSION_TTL_DAYS)
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      expires: expiresAt,
    })
    reply.setCookie(DEVICE_COOKIE, deviceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: DEVICE_TTL_DAYS * 24 * 3600,
    })
    return { user: { id: user.id, nickname: user.nickname, provider: user.provider } }
  })

  app.get('/api/auth/wechat/authorize', async (_request, reply) => {
    if (!creds) {
      reply.code(404).send({ error: 'WECHAT_NOT_CONFIGURED' })
      return
    }
    const state = newState()
    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      path: '/api/auth/wechat',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 600,
    })
    return { url: buildAuthorizeUrl(creds, state) }
  })

  // 微信授权回调：code 换 openid → 建/复用账号 → 回前端
  app.get('/api/auth/wechat/callback', async (request, reply) => {
    const failTo = `${config.frontendOrigin}/login?wechat=fail`
    if (!creds) return reply.redirect(failTo)
    const query = request.query as { code?: string; state?: string }
    const expectedState = request.cookies[OAUTH_STATE_COOKIE]
    if (!query.code || !query.state || query.state !== expectedState) {
      return reply.redirect(`${failTo}&reason=state`)
    }
    const token = await exchangeCode(creds, query.code, config.wechatFetch)
    if (!token.ok || !token.openid) {
      return reply.redirect(`${failTo}&reason=exchange`)
    }
    const user =
      repo.findUserByProvider(db, 'wechat', token.openid) ??
      repo.createUser(db, {
        provider: 'wechat',
        providerId: token.openid,
        nickname: token.nickname?.trim() || '微信用户',
      })
    const session = repo.createSession(db, user.id, SESSION_TTL_DAYS)
    reply.setCookie(SESSION_COOKIE, session.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      expires: session.expiresAt,
    })
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/wechat' })
    return reply.redirect(`${config.frontendOrigin}/today`)
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) repo.deleteSession(db, token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })
}

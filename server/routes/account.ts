/**
 * 账号认领与头像（v1.3）：
 * - POST /api/account/claim  认领/编辑：昵称 + PIN（当前登录用户）
 * - POST /api/account/reclaim 找回：昵称 + PIN 登录到本设备（换设备/清缓存后用）
 * - POST/DELETE /api/me/avatar 上传/移除头像（客户端 canvas 缩图，服务端校验类型与大小）
 * - GET  /api/avatar/:userId  读取头像（公开，ETag + 长缓存）
 */
import type { FastifyInstance } from 'fastify'
import type { DB } from '../db/connection'
import * as repo from '../db/repo'
import { requireAuth, SESSION_COOKIE, DEVICE_COOKIE, SESSION_TTL_DAYS, DEVICE_TTL_DAYS } from '../auth/session'
import { hashPin, verifyPin } from '../auth/pin'

const MAX_AVATAR_BYTES = 200 * 1024
const PIN_RE = /^[A-Za-z0-9]{4,12}$/

/** 控制字符（含 DEL）会破坏展示与存储，直接拒绝。 */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** 昵称：去首尾空白后 1-16 个字符，不含控制字符；禁止占用系统自动昵称前缀。 */
function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const nickname = raw.trim().replace(/\s+/g, ' ')
  if (nickname.length < 1 || nickname.length > 16) return null
  if (hasControlChars(nickname)) return null
  if (nickname.startsWith('体验用户')) return null
  return nickname
}

const claimedKeyOf = (nickname: string) => nickname.toLowerCase()

/** 解析 dataURL → { mime, bytes }；类型白名单 + 魔数校验 + 大小上限。 */
function parseAvatarDataUrl(raw: unknown): { mime: string; bytes: Uint8Array } | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  const mime = m[1]
  let bytes: Uint8Array
  try {
    bytes = Buffer.from(m[2], 'base64')
  } catch {
    return null
  }
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return null
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isWebp =
    bytes[8] === 0x52 &&
    bytes[9] === 0x49 &&
    bytes[10] === 0x46 &&
    bytes[11] === 0x46 &&
    bytes[12] === 0x57 &&
    bytes[13] === 0x45 &&
    bytes[14] === 0x42 &&
    bytes[15] === 0x50
  const magicOk = mime === 'image/jpeg' ? isJpeg : mime === 'image/png' ? isPng : isWebp
  if (!magicOk) return null
  return { mime, bytes }
}

/** 找回尝试限流：每 IP 每小时 10 次（内存实现，单进程语义足够 MVP）。 */
function createReclaimLimiter() {
  const hits = new Map<string, number[]>()
  return (ip: string): boolean => {
    const now = Date.now()
    const windowStart = now - 3600_000
    const list = (hits.get(ip) ?? []).filter((t) => t > windowStart)
    if (list.length >= 10) {
      hits.set(ip, list)
      return false
    }
    list.push(now)
    hits.set(ip, list)
    return true
  }
}

export function registerAccountRoutes(app: FastifyInstance, db: DB): void {
  const auth = requireAuth(db)
  const allowReclaim = createReclaimLimiter()

  app.post('/api/account/claim', { preHandler: auth }, async (request, reply) => {
    const body = (request.body ?? {}) as { nickname?: unknown; pin?: unknown }
    const nickname = normalizeNickname(body.nickname)
    const pin = typeof body.pin === 'string' ? body.pin : ''
    if (!nickname) {
      reply.code(400).send({ error: 'BAD_NICKNAME', message: '昵称需为 1-16 个字符，且不能以「体验用户」开头' })
      return
    }
    if (!PIN_RE.test(pin)) {
      reply.code(400).send({ error: 'BAD_PIN', message: 'PIN 需为 4-12 位字母或数字' })
      return
    }
    const key = claimedKeyOf(nickname)
    const owner = repo.findClaimedUser(db, key)
    if (owner && owner.id !== request.user!.id) {
      reply.code(409).send({ error: 'NICKNAME_TAKEN', message: '这个昵称已被认领，换一个试试' })
      return
    }
    repo.setClaim(db, request.user!.id, nickname, key, hashPin(pin))
    return { nickname, claimed: true }
  })

  app.post('/api/account/reclaim', async (request, reply) => {
    if (!allowReclaim(request.ip)) {
      reply.code(429).send({ error: 'TOO_MANY_ATTEMPTS', message: '尝试太频繁，请一小时后再试' })
      return
    }
    const body = (request.body ?? {}) as { nickname?: unknown; pin?: unknown }
    const nickname = normalizeNickname(body.nickname)
    const pin = typeof body.pin === 'string' ? body.pin : ''
    const user = nickname ? repo.findClaimedUser(db, claimedKeyOf(nickname)) : null
    if (!user || !user.pin_hash || !verifyPin(pin, user.pin_hash)) {
      reply.code(401).send({ error: 'BAD_CREDENTIALS', message: '昵称或 PIN 不对' })
      return
    }
    // 绑定当前设备：设备 cookie 复用该账号；已存在的其他会话不受影响
    let deviceId = request.cookies[DEVICE_COOKIE]
    if (!deviceId) deviceId = `d_${user.id.slice(-8)}${Date.now().toString(36)}`
    repo.bindDevice(db, user.id, deviceId)
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
    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        provider: user.provider,
        hasAvatar: repo.hasAvatar(db, user.id),
        claimed: true,
      },
    }
  })

  app.post('/api/me/avatar', { preHandler: auth }, async (request, reply) => {
    const body = (request.body ?? {}) as { image?: unknown }
    const parsed = parseAvatarDataUrl(body.image)
    if (!parsed) {
      reply.code(400).send({ error: 'BAD_IMAGE', message: '仅支持 JPEG/PNG/WebP，且不超过 200KB' })
      return
    }
    repo.setAvatar(db, request.user!.id, parsed.mime, parsed.bytes)
    return { hasAvatar: true }
  })

  app.delete('/api/me/avatar', { preHandler: auth }, async (request) => {
    repo.deleteAvatar(db, request.user!.id)
    return { hasAvatar: false }
  })

  app.get('/api/avatar/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const avatar = repo.getAvatar(db, userId)
    if (!avatar) {
      reply.code(404).send({ error: 'NOT_FOUND' })
      return
    }
    reply.header('ETag', `"${avatar.updated_at}"`)
    reply.header('Cache-Control', 'public, max-age=86400')
    if (request.headers['if-none-match'] === `"${avatar.updated_at}"`) {
      reply.code(304)
      return
    }
    reply.type(avatar.mime).send(Buffer.from(avatar.data))
  })
}

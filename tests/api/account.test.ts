/**
 * v1.3 账号认领与头像 —— API 层验收：
 * - 认领：昵称/PIN 校验、昵称唯一（409）、排行榜昵称与 hasAvatar 同步；
 * - 找回：昵称+PIN 跨设备登录、错误凭据 401、限流 429；
 * - 头像：上传/读取/304/删除，类型魔数与大小校验。
 * 注意：所有多用户场景都在同一个 app（同一内存库）内用不同设备 cookie 构造。
 */
import { describe, expect, it } from 'vitest'
import { makeApp, mockLogin, getJSON, postJSON, cookieHeader, responseCookies } from './helpers'
import type { FastifyInstance } from 'fastify'
import type { LeaderboardDTO, MeDTO } from '../../shared/types'

/** 1×1 透明 PNG。 */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
/** JPEG 魔数开头但声明为 PNG 的伪造型 dataURL（服务端应拒绝）。 */
const FAKE_PNG =
  'data:image/png;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDA1NDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/vwooooA//9k='

/** 在同一 app 内认领当前登录用户；返回可继续使用的 jar。 */
async function claimOn(
  app: FastifyInstance,
  jar: Record<string, string>,
  nickname: string,
  pin: string,
): Promise<void> {
  const r = await postJSON<{ nickname: string }>(app, jar, '/api/account/claim', { nickname, pin })
  expect(r.status, `认领 ${nickname}`).toBe(200)
}

describe('账号认领（v1.3）', () => {
  it('认领后：/api/me 反映昵称/claimed；排行榜显示昵称与 hasAvatar', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'c-1')
    await claimOn(app, jar, '背单词选手', 'abcd5678')

    const me = await getJSON<MeDTO>(app, jar, '/api/me')
    expect(me.body.user.nickname).toBe('背单词选手')
    expect(me.body.user.claimed).toBe(true)
    expect(me.body.user.hasAvatar).toBe(false)

    const board = await getJSON<LeaderboardDTO>(app, jar, '/api/stats/leaderboard')
    const mine = board.body.entries.find((e) => e.isMe)
    expect(mine?.nickname).toBe('背单词选手')
    expect(mine?.hasAvatar).toBe(false)
  })

  it('昵称被他人认领 → 409；非法 PIN / 系统前缀昵称 → 400；本人重复认领同昵称 → 200', async () => {
    const { app } = await makeApp()
    const jarA = await mockLogin(app, 'n-a')
    const jarB = await mockLogin(app, 'n-b')
    await claimOn(app, jarA, '月亮', '1111')

    const dup = await postJSON(app, jarB, '/api/account/claim', { nickname: '月亮', pin: '2222' })
    expect(dup.status).toBe(409)
    const badPin = await postJSON(app, jarA, '/api/account/claim', { nickname: '月亮改', pin: '12' })
    expect(badPin.status).toBe(400)
    const sys = await postJSON(app, jarA, '/api/account/claim', { nickname: '体验用户0099', pin: '1111' })
    expect(sys.status).toBe(400)
    const self = await postJSON(app, jarA, '/api/account/claim', { nickname: '月亮', pin: '1111' })
    expect(self.status).toBe(200)
  })

  it('大小写昵称视为同一认领键（Moon 与 moon 冲突）', async () => {
    const { app } = await makeApp()
    const jarA = await mockLogin(app, 'n-c')
    const jarB = await mockLogin(app, 'n-d')
    await claimOn(app, jarA, 'Moon', '1111')
    const r = await postJSON(app, jarB, '/api/account/claim', { nickname: 'moon', pin: '2222' })
    expect(r.status).toBe(409)
  })
})

describe('账号找回（v1.3）', () => {
  it('新设备凭昵称+PIN 登录到原账号，并绑定本设备', async () => {
    const { app } = await makeApp()
    // 设备 A：登录并认领
    const jarA = await mockLogin(app, 'device-a')
    await claimOn(app, jarA, '小舟', 'pass99')
    // 设备 B：同应用、不同设备 cookie → 是另一个账号
    const jarB = await mockLogin(app, 'device-b')
    const meB = await getJSON<MeDTO>(app, jarB, '/api/me')
    expect(meB.body.user.nickname).not.toBe('小舟')

    // 设备 B 找回 → 新会话切到原账号（响应 set-cookie 需并入 jar）
    const res = await app.inject({
      method: 'POST',
      url: '/api/account/reclaim',
      headers: { cookie: cookieHeader(jarB), 'content-type': 'application/json' },
      payload: { nickname: '小舟', pin: 'pass99' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { user: { nickname: string } }).user.nickname).toBe('小舟')
    const jarB2 = { ...jarB, ...responseCookies(res) }

    const meAfter = await getJSON<MeDTO>(app, jarB2, '/api/me')
    expect(meAfter.body.user.nickname).toBe('小舟')
    expect(meAfter.body.user.claimed).toBe(true)

    // 未认领的新用户不能被「找回」
    const ghost = await postJSON(app, {}, '/api/account/reclaim', { nickname: '小舟', pin: '错密码' })
    expect(ghost.status).toBe(401)
  })

  it('昵称或 PIN 错误 → 401（不区分账号不存在/密码错）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'n-e')
    await claimOn(app, jar, '石头的词', '7777')
    const wrong = await postJSON(app, {}, '/api/account/reclaim', { nickname: '石头的词', pin: '0000' })
    expect(wrong.status).toBe(401)
    const unknown = await postJSON(app, {}, '/api/account/reclaim', { nickname: '不存在的昵称', pin: '7777' })
    expect(unknown.status).toBe(401)
  })

  it('找回限流：同 IP 连续失败 10 次后 → 429', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'n-f')
    await claimOn(app, jar, '限流同学', '8888')
    let last = 0
    for (let i = 0; i < 11; i++) {
      const r = await postJSON(app, {}, '/api/account/reclaim', { nickname: '限流同学', pin: 'wrong' })
      last = r.status
      if (r.status === 429) break
    }
    expect(last).toBe(429)
  })
})

describe('头像（v1.3）', () => {
  it('上传 → /api/me.hasAvatar → 读取字节一致 → ETag 304 → 删除后 404', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'a-1')
    await claimOn(app, jar, '头像侠', '1234')

    const up = await postJSON<{ hasAvatar: boolean }>(app, jar, '/api/me/avatar', { image: PNG_1PX })
    expect(up.status).toBe(200)
    expect(up.body.hasAvatar).toBe(true)

    const me = await getJSON<MeDTO>(app, jar, '/api/me')
    expect(me.body.user.hasAvatar).toBe(true)
    const uid = me.body.user.id

    const res = await app.inject({ method: 'GET', url: `/api/avatar/${uid}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
    expect(res.rawPayload.equals(Buffer.from(PNG_1PX.split(',')[1], 'base64'))).toBe(true)
    const etag = res.headers.etag as string
    expect(etag).toBeTruthy()

    const notMod = await app.inject({ method: 'GET', url: `/api/avatar/${uid}`, headers: { 'if-none-match': etag } })
    expect(notMod.statusCode).toBe(304)

    const board = await getJSON<LeaderboardDTO>(app, jar, '/api/stats/leaderboard')
    expect(board.body.entries.find((e) => e.isMe)?.hasAvatar).toBe(true)

    const del = await app.inject({ method: 'DELETE', url: '/api/me/avatar', headers: { cookie: cookieHeader(jar) } })
    expect(del.statusCode).toBe(200)
    const gone = await app.inject({ method: 'GET', url: `/api/avatar/${uid}` })
    expect(gone.statusCode).toBe(404)
  })

  it('类型/魔数/大小校验：伪 PNG → 400；GIF → 400；空 body → 400', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'a-2')
    const fake = await postJSON(app, jar, '/api/me/avatar', { image: FAKE_PNG })
    expect(fake.status).toBe(400)
    const gif = await postJSON(app, jar, '/api/me/avatar', {
      image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    })
    expect(gif.status).toBe(400)
    const empty = await postJSON(app, jar, '/api/me/avatar', {})
    expect(empty.status).toBe(400)
    const oversize = await postJSON(app, jar, '/api/me/avatar', {
      image: `data:image/png;base64,${'A'.repeat(300 * 1024)}`,
    })
    expect(oversize.status).toBe(400)
  })

  it('未上传头像的用户 GET /api/avatar/:id → 404', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'a-3')
    const me = await getJSON<MeDTO>(app, jar, '/api/me')
    const r = await app.inject({ method: 'GET', url: `/api/avatar/${me.body.user.id}` })
    expect(r.statusCode).toBe(404)
  })
})

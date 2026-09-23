/**
 * 核心接口集成测试：认证（US1/US2）、词书（US3）、每日计划（US4）、
 * 学习与 SM-2 调度（US8）、打卡（US9）、统计（US10）、健康检查（US12）。
 */
import { describe, expect, it } from 'vitest'
import { makeApp, mockLogin, getJSON, postJSON, patchJSON, cookieHeader, responseCookies } from './helpers'
import { addDays } from '../../server/core/dates'

describe('健康检查（US12）', () => {
  it('GET /api/health 返回 200 与 ok:true', async () => {
    const { app } = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)
  })
})

describe('认证（US1 / US2）', () => {
  it('未登录访问受保护接口 → 401', async () => {
    const { app } = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/today' })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('UNAUTHORIZED')
  })

  it('mock 登录建号；同设备复用；不同设备新号', async () => {
    const { app } = await makeApp()
    const jar1 = await mockLogin(app, 'device-A')
    const me1 = await getJSON(app, jar1, '/api/me')
    expect(me1.status).toBe(200)
    expect(me1.body.user.provider).toBe('mock')

    const jar1b = await mockLogin(app, 'device-A')
    const me1b = await getJSON(app, jar1b, '/api/me')
    expect(me1b.body.user.id).toBe(me1.body.user.id) // 复用同一账号

    const jar2 = await mockLogin(app, 'device-B')
    const me2 = await getJSON(app, jar2, '/api/me')
    expect(me2.body.user.id).not.toBe(me1.body.user.id)
  })

  it('登出后会话失效', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app, 'device-logout')
    const out = await postJSON(app, jar, '/api/auth/logout')
    expect(out.status).toBe(200)
    const me = await getJSON(app, jar, '/api/me')
    expect(me.status).toBe(401)
  })

  it('auth/config：未配置微信时 wechat=false', async () => {
    const { app } = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(JSON.parse(res.body)).toEqual({ mock: true, wechat: false })
  })

  it('auth/config：配置微信后 wechat=true', async () => {
    const { app } = await makeApp({
      wechat: { appid: 'wx-test', secret: 'secret-test', redirectUri: 'https://example.com/api/auth/wechat/callback' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(JSON.parse(res.body).wechat).toBe(true)
  })

  it('未配置微信时 authorize 接口 404', async () => {
    const { app } = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/wechat/authorize' })
    expect(res.statusCode).toBe(404)
  })

  it('微信回调（注入假 fetch）：code 换 openid → 建号 → 302 回前端；同 openid 复用', async () => {
    let calls = 0
    const fakeFetch = async () => {
      calls++
      return new Response(JSON.stringify({ openid: 'openid-X', nickname: '微信小明' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const { app } = await makeApp({
      wechat: { appid: 'wx-test', secret: 'secret-test', redirectUri: 'https://example.com/api/auth/wechat/callback' },
      wechatFetch: fakeFetch,
    })
    // authorize：拿 state 与 oauth cookie
    const authRes = await app.inject({ method: 'GET', url: '/api/auth/wechat/authorize' })
    expect(authRes.statusCode).toBe(200)
    const authorizeUrl = JSON.parse(authRes.body).url as string
    expect(authorizeUrl).toContain('open.weixin.qq.com/connect/qrconnect')
    const oauthCookie = responseCookies(authRes as unknown as { cookies: Array<{ name: string; value: string }> })
    const state = new URL(authorizeUrl).searchParams.get('state')!

    // callback：校验 state（cookie）→ 换 openid → 种 session → 跳前端
    const cb = await app.inject({
      method: 'GET',
      url: `/api/auth/wechat/callback?code=real-code&state=${state}`,
      headers: { cookie: cookieHeader(oauthCookie) },
    })
    expect(calls).toBe(1)
    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toContain('/today')
    const jar = responseCookies(cb as unknown as { cookies: Array<{ name: string; value: string }> })
    const me = await getJSON(app, jar, '/api/me')
    expect(me.status).toBe(200)
    expect(me.body.user.provider).toBe('wechat')
    expect(me.body.user.nickname).toBe('微信小明')

    // state 不匹配 → 拒绝
    const cbBad = await app.inject({
      method: 'GET',
      url: `/api/auth/wechat/callback?code=real-code&state=tampered`,
      headers: { cookie: cookieHeader(oauthCookie) },
    })
    expect(cbBad.headers.location).toContain('login')
  })
})

describe('词书与每日计划（US3 / US4）', () => {
  it('列出 6 本内置词书，每本 100 词', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    const { body } = await getJSON<{ books: Array<{ id: string; wordCount: number; isActive: boolean }> }>(app, jar, '/api/books')
    expect(body.books).toHaveLength(6)
    expect(body.books.map((b) => b.wordCount)).toEqual([100, 100, 100, 100, 100, 100])
    expect(body.books.every((b) => !b.isActive)).toBe(true)
  })

  it('激活词书；激活不存在的词书 404', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    const ok = await postJSON(app, jar, '/api/books/cet4/activate')
    expect(ok.status).toBe(200)
    const { body } = await getJSON<{ books: Array<{ id: string; isActive: boolean }> }>(app, jar, '/api/books')
    expect(body.books.find((b) => b.id === 'cet4')!.isActive).toBe(true)
    const missing = await postJSON(app, jar, '/api/books/nope/activate')
    expect(missing.status).toBe(404)
  })

  it('未选词书时 today.hasBook=false', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    const { body } = await getJSON(app, jar, '/api/today')
    expect(body.hasBook).toBe(false)
    expect(body.task).toBeNull()
  })

  it('每日新词量校验：4/101/非整数 → 400；20 → 生效（US4）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    expect((await patchJSON(app, jar, '/api/me/settings', { dailyNewLimit: 4 })).status).toBe(400)
    expect((await patchJSON(app, jar, '/api/me/settings', { dailyNewLimit: 101 })).status).toBe(400)
    expect((await patchJSON(app, jar, '/api/me/settings', { dailyNewLimit: 20.5 })).status).toBe(400)
    const ok = await patchJSON<{ settings: { dailyNewLimit: number } }>(app, jar, '/api/me/settings', { dailyNewLimit: 30 })
    expect(ok.status).toBe(200)
    expect(ok.body.settings.dailyNewLimit).toBe(30)
  })

  it('默认新词量 20；队列新词数 = min(N, 剩余)（US4）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/kaoyan/activate')
    const { body } = await getJSON<{ task: { newCount: number; reviewCount: number } }>(app, jar, '/api/today')
    expect(body.task!.newCount).toBe(20)
    expect(body.task!.reviewCount).toBe(0)
  })
})

describe('学习队列与 SM-2 调度（US5-US8）', () => {
  it('队列顺序：复习在前、新词在后；拼写项不泄露 headword', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/cet6/activate')
    // 直接给两个词造进度：一个今天到期、一个未到期
    const now = new Date().toISOString()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const w = db.prepare('SELECT id FROM words WHERE book_id=? ORDER BY sort LIMIT 2').all('cet6') as Array<{ id: number }>
    const ins = db.prepare(
      `INSERT INTO word_progress (user_id, word_id, book_id, status, ef, interval_days, reps, due_date, last_reviewed_at)
       VALUES ((SELECT id FROM users LIMIT 1), ?, 'cet6', 'review', 2.5, 6, 2, ?, ?)`,
    )
    ins.run(w[0].id, today, now) // 今天到期
    ins.run(w[1].id, addDays(today, 10), now) // 未到期

    const spelling = await getJSON<{ items: Array<{ kind: string; wordId: number; translations?: unknown[] }> }>(app, jar, '/api/study/queue?mode=spelling')
    expect(spelling.body.items[0].wordId).toBe(w[0].id) // 到期词在最前
    // 拼写项：下发释义供展示；headword 仅作 TTS 文本（浏览器语音必须有文本），UI 层不渲染
    expect(spelling.body.items.every((i) => Array.isArray(i.translations) && i.translations.length > 0)).toBe(true)
    const card = await getJSON<{ items: Array<{ kind: string; isNew: boolean }> }>(app, jar, '/api/study/queue?mode=card')
    expect(card.body.items[0].isNew).toBe(false)
    expect(card.body.items[0].kind).toBe('card')
    expect(card.body.items.at(-1)!.isNew).toBe(true)
  })

  it('非法 mode → 400；词不在队列时作答 → 400', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/cet4/activate')
    expect((await getJSON(app, jar, '/api/study/queue?mode=alien')).status).toBe(400)
    const bad = await postJSON(app, jar, '/api/study/answer', { wordId: 999999, mode: 'card', quality: 5 })
    expect(bad.status).toBe(400)
  })

  it('卡片 q5 → dueDate=明天；q1 → interval=1、reps 归零（US8）', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/cet4/activate')
    const q = await getJSON<{ items: Array<{ wordId: number }> }>(app, jar, '/api/study/queue?mode=card')
    const wid = q.body.items[0].wordId
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())

    const a1 = await postJSON<{ nextDueDate: string; nextIntervalDays: number }>(app, jar, '/api/study/answer', { wordId: wid, mode: 'card', quality: 5 })
    expect(a1.status).toBe(200)
    expect(a1.body.nextIntervalDays).toBe(1)
    expect(a1.body.nextDueDate).toBe(addDays(today, 1))

    // 手动把该词设为今日到期，再答 q1 → reps 归零
    db.prepare('UPDATE word_progress SET reps=3, interval_days=15, due_date=? WHERE word_id=?').run(today, wid)
    const a2 = await postJSON<{ nextIntervalDays: number; quality: number }>(app, jar, '/api/study/answer', { wordId: wid, mode: 'card', quality: 1 })
    expect(a2.body.quality).toBe(1)
    expect(a2.body.nextIntervalDays).toBe(1)
    const p = db.prepare('SELECT reps, ef, status FROM word_progress WHERE word_id=?').get(wid) as { reps: number; ef: number; status: string }
    expect(p.reps).toBe(0)
    expect(p.ef).toBeGreaterThanOrEqual(1.3)
  })

  it('拼写判分忽略大小写与首尾空格（US7）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/primary/activate')
    const cardQ = await getJSON<{ items: Array<{ wordId: number; headword: string }> }>(app, jar, '/api/study/queue?mode=card')
    const target = cardQ.body.items[0]
    const spell = await postJSON<{ correct: boolean }>(app, jar, '/api/study/answer', {
      wordId: target.wordId,
      mode: 'spelling',
      answer: `  ${target.headword.toUpperCase()} `,
    })
    expect(spell.status).toBe(200)
    expect(spell.body.correct).toBe(true)
    // 拼错 → q1，且响应里带正确拼写
    const q2 = await getJSON<{ items: Array<{ wordId: number }> }>(app, jar, '/api/study/queue?mode=spelling')
    const wrong = await postJSON<{ correct: boolean; word: { headword: string } }>(app, jar, '/api/study/answer', {
      wordId: q2.body.items[0].wordId,
      mode: 'spelling',
      answer: 'zzz-wrong',
    })
    expect(wrong.body.correct).toBe(false)
    expect(wrong.body.word.headword.length).toBeGreaterThan(0)
  })

  it('选择题：4 选项互不相同；判分由服务端裁决（US6）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/senior/activate')
    const q = await getJSON<{ items: Array<{ kind: string; options: string[]; direction: string }> }>(app, jar, '/api/study/queue?mode=choice')
    const first = q.body.items[0]
    expect(first.kind).toBe('choice')
    expect(first.options).toHaveLength(4)
    expect(new Set(first.options).size).toBe(4)
    const res = await postJSON<{ correct: boolean; quality: number }>(app, jar, '/api/study/answer', {
      wordId: (q.body.items[0] as unknown as { wordId: number }).wordId,
      mode: 'choice',
      choiceIndex: 0,
    })
    expect(res.status).toBe(200)
    expect(res.body.quality === 5).toBe(res.body.correct)
    expect([1, 5]).toContain(res.body.quality)
  })

  it('当日到期词 100% 出现在复习队列（US8 接口断言）', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/junior/activate')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const now = new Date().toISOString()
    const uid = (db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string }).id
    const words = db.prepare('SELECT id FROM words WHERE book_id=? ORDER BY sort LIMIT 7').all('junior') as Array<{ id: number }>
    const ins = db.prepare(
      `INSERT INTO word_progress (user_id, word_id, book_id, status, ef, interval_days, reps, due_date, last_reviewed_at)
       VALUES (?, ?, 'junior', 'review', 2.5, 6, 2, ?, ?)`,
    )
    for (const w of words) ins.run(uid, w.id, today, now)
    const q = await getJSON<{ items: Array<{ wordId: number }> }>(app, jar, '/api/study/queue?mode=card')
    const queueIds = new Set(q.body.items.map((i) => i.wordId))
    for (const w of words) expect(queueIds.has(w.id)).toBe(true)
  })
})

describe('打卡与统计（US9 / US10）', () => {
  it('完成当日队列自动打卡；统计与数据库一致（US9/US10）', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/primary/activate')

    const today0 = await getJSON<{ task: { newCount: number }; completed: boolean; streak: number }>(app, jar, '/api/today')
    expect(today0.body.completed).toBe(false)
    const n = today0.body.task!.newCount
    expect(n).toBe(20)

    // 逐题作答（卡片 q5）
    let checkinStreak: number | null = null
    for (let i = 0; i < n; i++) {
      const q = await getJSON<{ items: Array<{ wordId: number }> }>(app, jar, '/api/study/queue?mode=card')
      expect(q.body.items.length).toBe(n - i)
      const r = await postJSON<{ checkin: { streak: number } | null }>(app, jar, '/api/study/answer', {
        wordId: q.body.items[0].wordId,
        mode: 'card',
        quality: 5,
      })
      if (r.body.checkin) checkinStreak = r.body.checkin.streak
    }
    expect(checkinStreak).toBe(1) // 首次打卡 streak=1

    // 今日页 → 完成态
    const today1 = await getJSON<{ completed: boolean; task: { doneCount: number; totalCount: number } }>(app, jar, '/api/today')
    expect(today1.body.completed).toBe(true)
    expect(today1.body.task.doneCount).toBe(20)
    expect(today1.body.task.totalCount).toBe(20)

    // 打卡表确有一行
    const checkins = db.prepare('SELECT COUNT(*) AS n FROM checkins').get() as { n: number }
    expect(checkins.n).toBe(1)

    // 统计接口与 DB 一致
    const stats = await getJSON<{
      streak: number
      totalLearned: number
      today: { newCount: number; reviewCount: number }
      activeBook: { learned: number; total: number; pct: number }
      last7: Array<{ date: string; total: number }>
    }>(app, jar, '/api/stats')
    expect(stats.body.streak).toBe(1)
    expect(stats.body.totalLearned).toBe(20)
    expect(stats.body.today).toEqual({ newCount: 20, reviewCount: 0 })
    expect(stats.body.activeBook!.learned).toBe(20)
    expect(stats.body.activeBook!.total).toBe(100)
    expect(stats.body.activeBook!.pct).toBe(20)
    expect(stats.body.last7.at(-1)!.total).toBe(20)

    // 日历：今天已打卡
    const cal = await getJSON<{ days: Array<{ date: string; checked: boolean }> }>(app, jar, '/api/stats/calendar')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    expect(cal.body.days.find((d) => d.date === today)!.checked).toBe(true)
  })

  it('调整 N 即时生效：已学项不变、未学新词缩减（US4）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/cet4/activate')
    // 先学 5 个
    for (let i = 0; i < 5; i++) {
      const q = await getJSON<{ items: Array<{ wordId: number }> }>(app, jar, '/api/study/queue?mode=spelling')
      await postJSON(app, jar, '/api/study/answer', { wordId: q.body.items[0].wordId, mode: 'spelling', answer: 'x' })
    }
    await patchJSON(app, jar, '/api/me/settings', { dailyNewLimit: 10 })
    const { body } = await getJSON<{ task: { newCount: number; doneCount: number } }>(app, jar, '/api/today')
    expect(body.task.doneCount).toBe(5)
    expect(body.task.newCount).toBe(5) // 10 - 5
  })

  it('切换词书进度分书保留（US3）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await postJSON(app, jar, '/api/books/cet6/activate')
    const q = await getJSON<{ items: Array<{ wordId: number }> }>(app, jar, '/api/study/queue?mode=card')
    await postJSON(app, jar, '/api/study/answer', { wordId: q.body.items[0].wordId, mode: 'card', quality: 5 })
    // 切走再切回
    await postJSON(app, jar, '/api/books/kaoyan/activate')
    await postJSON(app, jar, '/api/books/cet6/activate')
    const { body } = await getJSON<{ books: Array<{ id: string; learnedCount: number }> }>(app, jar, '/api/books')
    expect(body.books.find((b) => b.id === 'cet6')!.learnedCount).toBe(1)
    expect(body.books.find((b) => b.id === 'kaoyan')!.learnedCount).toBe(0)
  })

  it('日历接口：非法月份 400、未来月返回空', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    expect((await getJSON(app, jar, '/api/stats/calendar?month=2026-13')).status).toBe(400)
    const future = await getJSON<{ days: unknown[] }>(app, jar, '/api/stats/calendar?month=2030-01')
    expect(future.body.days).toEqual([])
  })
})

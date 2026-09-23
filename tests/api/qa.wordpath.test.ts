/**
 * QA 独立验收补充（第 1 次验收，tests/api 既有覆盖之上的缺口）：
 * - US4 边界 N=5 / N=100；
 * - US6 服务端判分对/错两分支 + 队列确定性与方向奇偶交替（F8）；
 * - US7 空答案防御；
 * - US8 服务级多日完整序列 1 → 6 → round(interval×EF)（注入时间）；
 * - US9 部分完成不打卡 + 中断归零（注入时间）；
 * - US10 last7 口径（连续 7 天、终日为今日）；
 * - 会话过期 → 401（安全）。
 */
import { describe, expect, it } from 'vitest'
import { makeApp, mockLogin, getJSON, postJSON, patchJSON, cookieHeader } from './helpers'
import type { DB } from '../../server/db/connection'
import * as repo from '../../server/db/repo'
import { addDays, todayInShanghai } from '../../server/core/dates'
import { formatMeaningText } from '../../server/core/choices'
import { getQueue, getTodayInfo, submitAnswer } from '../../server/study-service'
import type { UserRow } from '../../server/db/repo'
import type { ChoiceItemDTO, QueueDTO, TodayDTO } from '../../shared/types'

const DAY = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+08:00`)

function onlyUser(db: DB): UserRow {
  return (db.prepare('SELECT * FROM users LIMIT 1').get() as UserRow)
}

function wordText(db: DB, wordId: number, direction: 'e2c' | 'c2e'): string {
  const w = repo.getWord(db, wordId)!
  return direction === 'e2c' ? formatMeaningText(JSON.parse(w.translations)) : w.headword
}

async function activate(app: Awaited<ReturnType<typeof makeApp>>['app'], jar: Record<string, string>, book: string) {
  const r = await postJSON(app, jar, `/api/books/${book}/activate`)
  expect(r.status).toBe(200)
}

describe('QA：每日新词量边界（US4）', () => {
  it('N=5 → 新词 5；N=100 → 新词 100（书内 100 词全量）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'cet4')
    await patchJSON(app, jar, '/api/me/settings', { dailyNewLimit: 5 })
    let t = await getJSON<TodayDTO>(app, jar, '/api/today')
    expect(t.body.task!.newCount).toBe(5)
    expect(t.body.task!.reviewCount).toBe(0)
    await patchJSON(app, jar, '/api/me/settings', { dailyNewLimit: 100 })
    t = await getJSON<TodayDTO>(app, jar, '/api/today')
    expect(t.body.task!.newCount).toBe(100)
  })
})

describe('QA：选择题判分与队列稳定性（US6 / F8）', () => {
  it('答错：correct=false、quality=1，响应 correctIndex 指向正确选项文本（服务端裁决）', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'senior')
    const q = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=choice')
    const item = q.body.items[0]
    expect(item.kind).toBe('choice')
    const choice = item as ChoiceItemDTO
    const expected = wordText(db, choice.wordId, choice.direction)
    // 恰 1 个选项是正确文本
    const hits = choice.options.map((o, i) => (o === expected ? i : -1)).filter((i) => i >= 0)
    expect(hits).toHaveLength(1)
    const wrongIdx = choice.options.findIndex((_, i) => i !== hits[0])
    const res = await postJSON<{ correct: boolean; quality: number; correctIndex: number }>(
      app, jar, '/api/study/answer',
      { wordId: choice.wordId, mode: 'choice', choiceIndex: wrongIdx },
    )
    expect(res.status).toBe(200)
    expect(res.body.correct).toBe(false)
    expect(res.body.quality).toBe(1)
    expect(res.body.correctIndex).toBe(hits[0])
    // 判分写入调度：q1 → interval 1
    expect(res.body.nextIntervalDays).toBe(1)
  })

  it('答对：correct=true、quality=5（对/错两分支判分写入调度）', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'senior')
    const q = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=choice')
    const choice = q.body.items[1] as ChoiceItemDTO & { wordId: number }
    const expected = wordText(db, choice.wordId, choice.direction)
    const correctIdx = choice.options.indexOf(expected)
    expect(correctIdx).toBeGreaterThanOrEqual(0)
    const res = await postJSON<{ correct: boolean; quality: number }>(
      app, jar, '/api/study/answer',
      { wordId: choice.wordId, mode: 'choice', choiceIndex: correctIdx },
    )
    expect(res.status).toBe(200)
    expect(res.body.correct).toBe(true)
    expect(res.body.quality).toBe(5)
  })

  it('同模式重拉两次队列完全一致（确定性，F8 模式切换重拉不变）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'cet6')
    const a = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=choice')
    const b = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=choice')
    expect(b.body).toEqual(a.body)
  })

  it('方向按位置奇偶交替：偶=英→中，奇=中→英（技术方案 §5 决策 1）', async () => {
    const { app } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'cet6')
    const q = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=choice')
    const items = q.body.items as Array<{ kind: string; direction?: string }>
    expect(items.length).toBeGreaterThanOrEqual(4)
    items.slice(0, 4).forEach((it, i) => {
      expect(it.kind).toBe('choice')
      expect(it.direction).toBe(i % 2 === 0 ? 'e2c' : 'c2e')
    })
  })
})

describe('QA：拼写空答案防御（US7）', () => {
  it('空串 / 纯空格 → 400 EMPTY_ANSWER，不落库', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'primary')
    const q = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=spelling')
    const wid = (q.body.items[0] as { wordId: number }).wordId
    expect((await postJSON(app, jar, '/api/study/answer', { wordId: wid, mode: 'spelling', answer: '' })).status).toBe(400)
    expect((await postJSON(app, jar, '/api/study/answer', { wordId: wid, mode: 'spelling', answer: '   ' })).status).toBe(400)
    const logs = db.prepare('SELECT COUNT(*) AS n FROM review_logs').get() as { n: number }
    expect(logs.n).toBe(0)
  })
})

describe('QA：SM-2 多日完整序列（US8，服务级注入时间）', () => {
  it('同一词连续通过：interval 1 → 6 → round(6×2.8)=17，EF 2.5→2.6→2.7→2.8，status→review', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'cet4')
    const user = onlyUser(db)
    const d1 = '2026-09-01'
    const q1 = getQueue(db, user, 'card', d1)
    const wid = q1.items[0].wordId

    const r1 = submitAnswer(db, user, { wordId: wid, mode: 'card', quality: 5 }, DAY(d1))
    expect(r1.nextIntervalDays).toBe(1)
    expect(r1.nextDueDate).toBe('2026-09-02')

    const r2 = submitAnswer(db, user, { wordId: wid, mode: 'card', quality: 5 }, DAY('2026-09-02'))
    expect(r2.nextIntervalDays).toBe(6)
    expect(r2.nextDueDate).toBe('2026-09-08')

    const r3 = submitAnswer(db, user, { wordId: wid, mode: 'card', quality: 5 }, DAY('2026-09-08'))
    expect(r3.nextIntervalDays).toBe(Math.round(6 * 2.8))
    expect(r3.nextIntervalDays).toBe(17)
    expect(r3.nextDueDate).toBe('2026-09-25')

    const p = repo.getProgress(db, user.id, wid)!
    expect(p.reps).toBe(3)
    expect(p.status).toBe('review')
    expect(p.ef).toBeCloseTo(2.8)
    expect(p.interval_days).toBe(17)
    expect(p.ef).toBeGreaterThanOrEqual(1.3)
  })
})

describe('QA：打卡——部分完成不打卡、中断归零（US9，服务级注入时间）', () => {
  it('day1 完成打卡 streak=1；day2 部分完成不打卡；day3 完成后 day2 缺卡 → streak 归零重计=1', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'primary')
    const user = onlyUser(db)
    // 服务级调度测试：N=2 走数据库直写（API 层 5-100 边界已另行断言）
    repo.updateUser(db, user.id, { daily_new_limit: 2 })
    user.daily_new_limit = 2
    const d1 = '2026-09-01'
    const q1 = getQueue(db, user, 'card', d1)
    expect(q1.items).toHaveLength(2)
    const [widA, widB] = q1.items.map((i) => i.wordId)

    // day1：完成 2 词 → 自动打卡 streak=1
    const rA1 = submitAnswer(db, user, { wordId: widA, mode: 'card', quality: 5 }, DAY(d1))
    expect(rA1.checkin).toBeNull()
    const rB1 = submitAnswer(db, user, { wordId: widB, mode: 'card', quality: 5 }, DAY(d1))
    expect(rB1.checkin).toEqual({ streak: 1 })
    expect((db.prepare('SELECT COUNT(*) AS n FROM checkins').get() as { n: number }).n).toBe(1)

    // day2：A、B 均到期；只答 A → 队列未清空，不打卡
    const d2 = addDays(d1, 1)
    const t2 = getTodayInfo(db, user, d2)
    expect(t2.task!.reviewCount).toBe(2)
    expect(t2.completed).toBe(false)
    const rA2 = submitAnswer(db, user, { wordId: widA, mode: 'card', quality: 5 }, DAY(d2))
    expect(rA2.checkin).toBeNull()
    expect((db.prepare('SELECT COUNT(*) AS n FROM checkins').get() as { n: number }).n).toBe(1)
    expect(getTodayInfo(db, user, d2).completed).toBe(false)

    // day3：仅 B 到期（A 因 day2 通过顺延至 day8）；当日队列 = 复习 B + 2 个新词（每日计划 N=2）。
    // 答完 B 后仍有新词 → 不打卡；全部完成后打卡落 day3；day2 缺卡 → streak 归零重计 = 1
    const d3 = addDays(d1, 2)
    const q3 = getQueue(db, user, 'card', d3)
    expect(q3.items).toHaveLength(3) // 1 复习 + 2 新词
    expect(q3.items.map((i) => i.wordId)).toContain(widB)
    let r3: ReturnType<typeof submitAnswer> | null = null
    q3.items.forEach((it, idx) => {
      r3 = submitAnswer(db, user, { wordId: it.wordId, mode: 'card', quality: 5 }, DAY(d3))
      if (idx < q3.items.length - 1) expect(r3!.checkin).toBeNull() // 未清空不打卡
    })
    expect(r3!.checkin).toEqual({ streak: 1 }) // 最后一项完成 → 打卡
    const dates = [...(repo.listCheckinDates(db, user.id))].sort()
    expect(dates).toEqual([d1, d3])
    expect(getTodayInfo(db, user, d3).streak).toBe(1)
  })
})

describe('QA：统计口径与会话安全（US10 / US1）', () => {
  it('last7 恰 7 天、日期连续且末日为今日、总数与 review_logs 一致', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app)
    await activate(app, jar, 'junior')
    const today = todayInShanghai()
    const q = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=spelling')
    await postJSON(app, jar, '/api/study/answer', { wordId: (q.body.items[0] as { wordId: number }).wordId, mode: 'spelling', answer: 'x' })
    const s = await getJSON<{ last7: Array<{ date: string; total: number }>; today: { newCount: number } }>(app, jar, '/api/stats')
    expect(s.body.last7).toHaveLength(7)
    expect(s.body.last7.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)))
    expect(s.body.last7.at(-1)!.total).toBe(1)
    const logs = db.prepare('SELECT COUNT(*) AS n FROM review_logs WHERE study_date = ?').get(today) as { n: number }
    expect(logs.n).toBe(1)
  })

  it('过期会话 → 401（sessions.expires_at 过去）', async () => {
    const { app, db } = await makeApp()
    const jar = await mockLogin(app, 'device-exp')
    const token = jar.wp_session
    db.prepare(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ?`).run(token)
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookieHeader(jar) } })
    expect(res.statusCode).toBe(401)
  })
})

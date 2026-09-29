/**
 * 学习排行榜（US13）—— API 层验收（v1.3.3 起仅认领账号/微信用户上榜）：
 * - 指标口径：累计学习天数 = 打卡日数；连续学习天数 = 当前 streak；累计词汇量 = 有进度去重词数；
 * - 排名：词汇量 → 连续天数 → 累计天数；isMe 标记；Top N 之外追加我的真实名次（服务级）；
 * - 未认领的匿名体验账号不上榜。
 */
import { describe, expect, it } from 'vitest'
import type { DB } from '../../server/db/connection'
import { makeApp, mockLogin, getJSON, postJSON } from './helpers'
import * as repo from '../../server/db/repo'
import { addDays, todayInShanghai } from '../../server/core/dates'
import { getLeaderboard } from '../../server/study-service'
import type { LeaderboardDTO, MeDTO } from '../../shared/types'

const today = todayInShanghai()

/** 同一应用内用不同设备号登录并认领多个用户（同一内存库）。 */
async function makeClaimedUsers(specs: Array<{ device: string; nickname: string }>) {
  const { app, db } = await makeApp()
  const users = [] as Array<{ jar: Record<string, string>; uid: string; nickname: string }>
  for (const { device, nickname } of specs) {
    const jar = await mockLogin(app, device)
    const r = await postJSON(app, jar, '/api/account/claim', { nickname, pin: '1234' })
    expect(r.status).toBe(200)
    const me = await getJSON<MeDTO>(app, jar, '/api/me')
    users.push({ jar, uid: me.body.user.id, nickname })
  }
  return { app, db, users }
}

/** 直接落库造数据：打卡日集合 + 已学词集合（词书 cet4）。 */
function craft(db: DB, uid: string, days: string[], wordCount: number) {
  for (const d of days) repo.upsertCheckin(db, uid, d, 1, 0)
  const words = repo.listWordsByBook(db, 'cet4').slice(0, wordCount)
  for (const w of words) {
    repo.upsertProgress(db, {
      user_id: uid,
      word_id: w.id,
      book_id: 'cet4',
      status: 'review',
      ef: 2.5,
      interval_days: 1,
      reps: 1,
      due_date: addDays(today, 5),
      last_reviewed_at: new Date().toISOString(),
    })
  }
}

describe('学习排行榜（US13）', () => {
  it('按词汇量排名，三指标与 isMe 正确', async () => {
    const { app, db, users } = await makeClaimedUsers([
      { device: 'lb-a', nickname: '小山' },
      { device: 'lb-b', nickname: '小海' },
      { device: 'lb-c', nickname: '大风' },
    ])
    const [a, b, c] = users
    craft(db, a.uid, [today], 2) // A：1 天，连 1，2 词
    craft(db, b.uid, [addDays(today, -1), today], 1) // B：2 天，连 2，1 词
    craft(db, c.uid, [], 5) // C：0 天，连 0，5 词

    const res = await getJSON<LeaderboardDTO>(app, a.jar, '/api/stats/leaderboard')
    expect(res.status).toBe(200)
    expect(res.body.totalUsers).toBe(3)
    expect(res.body.entries.map((e) => e.userId)).toEqual([c.uid, a.uid, b.uid])
    const [first, second, third] = res.body.entries
    expect(first).toMatchObject({ rank: 1, totalWords: 5, currentStreak: 0, totalDays: 0, isMe: false })
    expect(second).toMatchObject({ rank: 2, totalWords: 2, currentStreak: 1, totalDays: 1, isMe: true })
    expect(third).toMatchObject({ rank: 3, totalWords: 1, currentStreak: 2, totalDays: 2, isMe: false })
  })

  it('词汇量相同按连续天数、再按累计天数破平局', async () => {
    const { app, db, users } = await makeClaimedUsers([
      { device: 'lb-d', nickname: '白杨' },
      { device: 'lb-e', nickname: '青松' },
    ])
    const [a, b] = users
    craft(db, a.uid, [today], 3)
    craft(db, b.uid, [addDays(today, -1), today], 3)
    const res = await getJSON<LeaderboardDTO>(app, a.jar, '/api/stats/leaderboard')
    expect(res.body.entries.map((e) => e.userId)).toEqual([b.uid, a.uid])
  })

  it('我不在 Top N 时追加真实名次行（服务级 limit=1）', async () => {
    const { db, users } = await makeClaimedUsers([
      { device: 'lb-f', nickname: '低名次' },
      { device: 'lb-g', nickname: '高名次' },
    ])
    const [a, b] = users
    craft(db, a.uid, [today], 1)
    craft(db, b.uid, [today], 9)
    const board = getLeaderboard(db, today, a.uid, 1)
    expect(board.entries).toHaveLength(2)
    expect(board.entries[0]).toMatchObject({ userId: b.uid, rank: 1 })
    expect(board.entries[1]).toMatchObject({ userId: a.uid, rank: 2, isMe: true })
  })

  it('未认领的匿名体验账号不上榜；认领后出现', async () => {
    const { app, db } = await makeApp()
    // 匿名体验用户学了不少词（不认领）
    const anon = await mockLogin(app, 'anon-dev')
    craft(db, (await getJSON<MeDTO>(app, anon, '/api/me')).body.user.id, [today], 8)
    // 认领用户学 1 词
    const claimed = await mockLogin(app, 'claimed-dev')
    await postJSON(app, claimed, '/api/account/claim', { nickname: '上榜者', pin: '4321' })
    const claimedUid = (await getJSON<MeDTO>(app, claimed, '/api/me')).body.user.id
    craft(db, claimedUid, [today], 1)

    const res = await getJSON<LeaderboardDTO>(app, claimed, '/api/stats/leaderboard')
    expect(res.body.totalUsers).toBe(1)
    expect(res.body.entries).toHaveLength(1)
    expect(res.body.entries[0]).toMatchObject({ userId: claimedUid, nickname: '上榜者', rank: 1, isMe: true })
  })
})

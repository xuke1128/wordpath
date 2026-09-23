/**
 * v1.1 学习排行榜（US13）—— API 层验收：
 * - 指标口径：累计学习天数 = 打卡日数；连续学习天数 = 当前 streak；累计词汇量 = 有进度去重词数；
 * - 排名：词汇量 → 连续天数 → 累计天数；isMe 标记；top 之外追加我的真实名次（服务级）。
 */
import { describe, expect, it } from 'vitest'
import type { DB } from '../../server/db/connection'
import { makeApp, mockLogin, getJSON } from './helpers'
import * as repo from '../../server/db/repo'
import { addDays, todayInShanghai } from '../../server/core/dates'
import { getLeaderboard } from '../../server/study-service'
import type { LeaderboardDTO, MeDTO } from '../../shared/types'

const today = todayInShanghai()

/** 同一应用内用不同设备号登录多个用户（同一内存库）。 */
async function makeUsers(...deviceIds: string[]) {
  const { app, db } = await makeApp()
  const users = [] as Array<{ jar: Record<string, string>; uid: string }>
  for (const deviceId of deviceIds) {
    const jar = await mockLogin(app, deviceId)
    const me = await getJSON<MeDTO>(app, jar, '/api/me')
    users.push({ jar, uid: me.body.user.id })
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
    const { app, db, users } = await makeUsers('lb-a', 'lb-b', 'lb-c')
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
    const { app, db, users } = await makeUsers('lb-d', 'lb-e')
    const [a, b] = users
    craft(db, a.uid, [today], 3)
    craft(db, b.uid, [addDays(today, -1), today], 3)
    const res = await getJSON<LeaderboardDTO>(app, a.jar, '/api/stats/leaderboard')
    expect(res.body.entries.map((e) => e.userId)).toEqual([b.uid, a.uid])
  })

  it('我不在 Top N 时追加真实名次行（服务级 limit=1）', async () => {
    const { db, users } = await makeUsers('lb-f', 'lb-g')
    const [a, b] = users
    craft(db, a.uid, [today], 1)
    craft(db, b.uid, [today], 9)
    const board = getLeaderboard(db, today, a.uid, 1)
    expect(board.entries).toHaveLength(2)
    expect(board.entries[0]).toMatchObject({ userId: b.uid, rank: 1 })
    expect(board.entries[1]).toMatchObject({ userId: a.uid, rank: 2, isMe: true })
  })
})

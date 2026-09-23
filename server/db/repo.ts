/**
 * 数据访问薄封装：SQL 集中在此，routes 层不直接拼 SQL。
 * node:sqlite 的 StatementSync 为同步 API；行类型在此断言。
 */
import type { DB } from './connection'
import type { Stage, StudyMode } from '../../shared/types'
import { randomUUID } from 'node:crypto'
import type { SQLInputValue } from 'node:sqlite'

// —— 行类型 ——

export interface UserRow {
  id: string
  provider: 'mock' | 'wechat'
  provider_id: string
  device_id: string | null
  nickname: string
  active_book_id: string | null
  daily_new_limit: number
  last_mode: StudyMode
  created_at: string
}

export interface WordRow {
  id: number
  book_id: string
  sort: number
  headword: string
  phonetic: string
  translations: string // JSON
  example_en: string
  example_cn: string
}

export interface ProgressRow {
  id: number
  user_id: string
  word_id: number
  book_id: string
  status: 'learning' | 'review'
  ef: number
  interval_days: number
  reps: number
  due_date: string
  last_reviewed_at: string
}

// —— 用户 ——

export function createUser(
  db: DB,
  input: { provider: 'mock' | 'wechat'; providerId: string; nickname: string; deviceId?: string | null },
): UserRow {
  const id = `u_${randomUUID().replace(/-/g, '').slice(0, 20)}`
  db.prepare(
    `INSERT INTO users (id, provider, provider_id, device_id, nickname, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.provider, input.providerId, input.deviceId ?? null, input.nickname, new Date().toISOString())
  return getUser(db, id)!
}

export function getUser(db: DB, id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
}

export function findMockUserByDevice(db: DB, deviceId: string): UserRow | null {
  return (
    (db
      .prepare(`SELECT * FROM users WHERE provider = 'mock' AND device_id = ? ORDER BY created_at LIMIT 1`)
      .get(deviceId) as UserRow | undefined) ?? null
  )
}

export function findUserByProvider(db: DB, provider: 'mock' | 'wechat', providerId: string): UserRow | null {
  return (
    (db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, providerId) as
      | UserRow
      | undefined) ?? null
  )
}

export function updateUser(db: DB, id: string, patch: Partial<Pick<UserRow, 'active_book_id' | 'daily_new_limit' | 'last_mode' | 'nickname'>>): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.active_book_id !== undefined) {
    sets.push('active_book_id = ?')
    vals.push(patch.active_book_id)
  }
  if (patch.daily_new_limit !== undefined) {
    sets.push('daily_new_limit = ?')
    vals.push(patch.daily_new_limit)
  }
  if (patch.last_mode !== undefined) {
    sets.push('last_mode = ?')
    vals.push(patch.last_mode)
  }
  if (patch.nickname !== undefined) {
    sets.push('nickname = ?')
    vals.push(patch.nickname)
  }
  if (sets.length === 0) return
  vals.push(id)
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as SQLInputValue[]))
}

// —— 会话 ——

export function createSession(db: DB, userId: string, ttlDays: number): { token: string; expiresAt: Date } {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt.toISOString(),
  )
  return { token, expiresAt }
}

export function getSessionUser(db: DB, token: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as UserRow | undefined
  return row ?? null
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

// —— 词书与词条 ——

export interface BookRow {
  id: string
  stage: Stage
  name: string
  description: string
  sort: number
}

export function listBooks(db: DB): BookRow[] {
  return db.prepare('SELECT * FROM wordbooks ORDER BY sort').all() as unknown as BookRow[]
}

export function getBook(db: DB, id: string): BookRow | null {
  return (db.prepare('SELECT * FROM wordbooks WHERE id = ?').get(id) as BookRow | undefined) ?? null
}

export function bookWordCount(db: DB, bookId: string): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM words WHERE book_id = ?').get(bookId) as { n: number }
  return r.n
}

export function listWordsByBook(db: DB, bookId: string): WordRow[] {
  return db
    .prepare('SELECT * FROM words WHERE book_id = ? ORDER BY sort, id')
    .all(bookId) as unknown as WordRow[]
}

/** 今日（date）该词书内以「新词」身份学过的 wordId（用于当日新词计划的稳定回填）。 */
export function listNewDoneWordIds(db: DB, userId: string, bookId: string, date: string): number[] {
  const rows = db
    .prepare(
      'SELECT DISTINCT word_id FROM review_logs WHERE user_id = ? AND book_id = ? AND study_date = ? AND is_new = 1',
    )
    .all(userId, bookId, date) as unknown as Array<{ word_id: number }>
  return rows.map((r) => r.word_id)
}

export function getWord(db: DB, wordId: number): WordRow | null {
  return (db.prepare('SELECT * FROM words WHERE id = ?').get(wordId) as WordRow | undefined) ?? null
}

// —— 学习进度 ——

export function listProgressByBook(db: DB, userId: string, bookId: string): ProgressRow[] {
  return db
    .prepare('SELECT * FROM word_progress WHERE user_id = ? AND book_id = ?')
    .all(userId, bookId) as unknown as ProgressRow[]
}

export function getProgress(db: DB, userId: string, wordId: number): ProgressRow | null {
  return (
    (db.prepare('SELECT * FROM word_progress WHERE user_id = ? AND word_id = ?').get(userId, wordId) as
      | ProgressRow
      | undefined) ?? null
  )
}

export function upsertProgress(db: DB, row: Omit<ProgressRow, 'id'>): void {
  db.prepare(
    `INSERT INTO word_progress (user_id, word_id, book_id, status, ef, interval_days, reps, due_date, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, word_id) DO UPDATE SET status=excluded.status, ef=excluded.ef,
       interval_days=excluded.interval_days, reps=excluded.reps, due_date=excluded.due_date,
       last_reviewed_at=excluded.last_reviewed_at`,
  ).run(
    row.user_id,
    row.word_id,
    row.book_id,
    row.status,
    row.ef,
    row.interval_days,
    row.reps,
    row.due_date,
    row.last_reviewed_at,
  )
}

export function countLearnedByBook(db: DB, userId: string): Map<string, number> {
  const rows = db
    .prepare('SELECT book_id, COUNT(*) AS n FROM word_progress WHERE user_id = ? GROUP BY book_id')
    .all(userId) as unknown as Array<{ book_id: string; n: number }>
  return new Map(rows.map((r) => [r.book_id, r.n]))
}

export function countTotalLearned(db: DB, userId: string): number {
  const r = db.prepare('SELECT COUNT(DISTINCT word_id) AS n FROM word_progress WHERE user_id = ?').get(userId) as {
    n: number
  }
  return r.n
}

// —— 学习记录（统计口径唯一来源）——

export interface ReviewLogInput {
  userId: string
  wordId: number
  bookId: string
  studyDate: string
  mode: StudyMode
  isNew: boolean
  quality: number
  correct: boolean | null
  intervalAfter: number
  dueDate: string
}

export function insertReviewLog(db: DB, input: ReviewLogInput): void {
  db.prepare(
    `INSERT INTO review_logs (user_id, word_id, book_id, study_date, mode, is_new, quality, correct, interval_after, due_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.userId,
    input.wordId,
    input.bookId,
    input.studyDate,
    input.mode,
    input.isNew ? 1 : 0,
    input.quality,
    input.correct === null ? null : input.correct ? 1 : 0,
    input.intervalAfter,
    input.dueDate,
    new Date().toISOString(),
  )
}

export function todayCounts(db: DB, userId: string, date: string, bookId?: string): { newCount: number; reviewCount: number; done: number } {
  const r = bookId
    ? (db
        .prepare(
          `SELECT COALESCE(SUM(is_new), 0) AS nc, COUNT(*) - COALESCE(SUM(is_new), 0) AS rc, COUNT(*) AS done
           FROM review_logs WHERE user_id = ? AND study_date = ? AND book_id = ?`,
        )
        .get(userId, date, bookId) as { nc: number; rc: number; done: number })
    : (db
        .prepare(
          `SELECT COALESCE(SUM(is_new), 0) AS nc, COUNT(*) - COALESCE(SUM(is_new), 0) AS rc, COUNT(*) AS done
           FROM review_logs WHERE user_id = ? AND study_date = ?`,
        )
        .get(userId, date) as { nc: number; rc: number; done: number })
  return { newCount: r.nc, reviewCount: r.rc, done: r.done }
}

export interface DayCount {
  date: string
  newCount: number
  reviewCount: number
}

export function countsByDateRange(db: DB, userId: string, fromDate: string, toDate: string): Map<string, DayCount> {
  const rows = db
    .prepare(
      `SELECT study_date AS date, SUM(is_new) AS nc, COUNT(*) - SUM(is_new) AS rc
       FROM review_logs WHERE user_id = ? AND study_date >= ? AND study_date <= ?
       GROUP BY study_date`,
    )
    .all(userId, fromDate, toDate) as unknown as Array<{ date: string; nc: number; rc: number }>
  return new Map(rows.map((r) => [r.date, { date: r.date, newCount: r.nc, reviewCount: r.rc }]))
}

// —— 打卡 ——

export interface CheckinRow {
  user_id: string
  study_date: string
  new_count: number
  review_count: number
}

export function getCheckin(db: DB, userId: string, date: string): CheckinRow | null {
  return (
    (db.prepare('SELECT * FROM checkins WHERE user_id = ? AND study_date = ?').get(userId, date) as
      | CheckinRow
      | undefined) ?? null
  )
}

export function upsertCheckin(db: DB, userId: string, date: string, newCount: number, reviewCount: number): void {
  db.prepare(
    `INSERT INTO checkins (user_id, study_date, new_count, review_count) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, study_date) DO UPDATE SET new_count=excluded.new_count, review_count=excluded.review_count`,
  ).run(userId, date, newCount, reviewCount)
}

export function listCheckinDates(db: DB, userId: string): Set<string> {
  const rows = db.prepare('SELECT study_date FROM checkins WHERE user_id = ?').all(userId) as unknown as Array<{
    study_date: string
  }>
  return new Set(rows.map((r) => r.study_date))
}

// —— 排行榜（聚合，只读） ——

export function listUsers(db: DB): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at').all() as unknown as UserRow[]
}

/** 各用户累计打卡天数（累计学习天数口径 = 打卡日数，与 streak 同源）。 */
export function checkinDaysByUser(db: DB): Map<string, number> {
  const rows = db
    .prepare('SELECT user_id, COUNT(*) AS n FROM checkins GROUP BY user_id')
    .all() as unknown as Array<{ user_id: string; n: number }>
  return new Map(rows.map((r) => [r.user_id, r.n]))
}

/** 各用户累计学习词汇量（有进度行的去重词数，与统计页「累计学习」同口径）。 */
export function learnedCountByUser(db: DB): Map<string, number> {
  const rows = db
    .prepare('SELECT user_id, COUNT(DISTINCT word_id) AS n FROM word_progress GROUP BY user_id')
    .all() as unknown as Array<{ user_id: string; n: number }>
  return new Map(rows.map((r) => [r.user_id, r.n]))
}

/** 全部打卡明细（user_id + study_date），用于逐用户计算连续天数。 */
export function allCheckinRows(db: DB): Array<{ user_id: string; study_date: string }> {
  return db.prepare('SELECT user_id, study_date FROM checkins').all() as unknown as Array<{
    user_id: string
    study_date: string
  }>
}

/**
 * 学习业务服务：今日任务、队列、作答流程（routes 层调用，规则全部下沉到 core/）。
 */
import type { DB } from './db/connection'
import { withTransaction } from './db/connection'
import * as repo from './db/repo'
import { addDays, todayInShanghai } from './core/dates'
import { applySm2, initialSm2State, isQuality, type Quality } from './core/sm2'
import { buildTodayQueue } from './core/queue'
import { buildChoice, directionForPosition, formatMeaningText } from './core/choices'
import { calcStreak } from './core/streak'
import type {
  AnswerResultDTO,
  LeaderboardDTO,
  LeaderboardEntryDTO,
  QueueDTO,
  QueueItemDTO,
  TodayDTO,
  WordFullDTO,
} from '../shared/types'
import type { StudyMode } from '../shared/types'
import type { UserRow, WordRow } from './db/repo'

export class BizError extends Error {
  constructor(
    public code: number,
    public error: string,
  ) {
    super(error)
  }
}

function toWordFull(w: WordRow, isNew: boolean): WordFullDTO {
  return {
    wordId: w.id,
    isNew,
    headword: w.headword,
    phonetic: w.phonetic,
    translations: JSON.parse(w.translations),
    exampleEn: w.example_en,
    exampleCn: w.example_cn,
  }
}

interface TodayQueue {
  reviewIds: number[]
  newIds: number[]
  wordsById: Map<number, WordRow>
  bookId: string | null
}

/** 计算用户今日队列（激活词书作用域），无激活词书时 bookId 为 null。 */
export function computeTodayQueue(db: DB, user: UserRow, today: string): TodayQueue {
  if (!user.active_book_id) {
    return { reviewIds: [], newIds: [], wordsById: new Map(), bookId: null }
  }
  const bookId = user.active_book_id
  const words = repo.listWordsByBook(db, bookId)
  const progress = repo.listProgressByBook(db, user.id, bookId)
  const { newCount: newDoneToday } = repo.todayCounts(db, user.id, today, bookId)
  const newDoneWordIds = repo.listNewDoneWordIds(db, user.id, bookId, today)
  // 学习顺序打乱：以「用户 + 词书 + 日期」为种子确定性洗牌（同日稳定、跨用户/跨日不同）
  const { reviewWordIds, newWordIds } = buildTodayQueue(
    words.map((w) => ({ wordId: w.id, sort: w.sort })),
    progress.map((p) => ({ wordId: p.word_id, dueDate: p.due_date })),
    user.daily_new_limit,
    today,
    newDoneToday,
    newDoneWordIds,
    `${user.id}:${bookId}:${today}`,
  )
  const wordsById = new Map(words.map((w) => [w.id, w]))
  return { reviewIds: reviewWordIds, newIds: newWordIds, wordsById, bookId }
}

export function getStreak(db: DB, userId: string, today: string): number {
  return calcStreak(repo.listCheckinDates(db, userId), today)
}

/** GET /api/stats/leaderboard：全员排行榜（Top N + 我）。 */
export function getLeaderboard(db: DB, today: string, meId: string, limit = 20): LeaderboardDTO {
  const users = repo.listUsers(db)
  const checkinDays = repo.checkinDaysByUser(db)
  const learnedWords = repo.learnedCountByUser(db)
  const datesByUser = new Map<string, Set<string>>()
  for (const row of repo.allCheckinRows(db)) {
    let set = datesByUser.get(row.user_id)
    if (!set) datesByUser.set(row.user_id, (set = new Set()))
    set.add(row.study_date)
  }

  const ranked = users.map((u) => ({
    userId: u.id,
    nickname: u.nickname,
    provider: u.provider,
    totalWords: learnedWords.get(u.id) ?? 0,
    currentStreak: calcStreak(datesByUser.get(u.id) ?? new Set<string>(), today),
    totalDays: checkinDays.get(u.id) ?? 0,
    createdAt: u.created_at,
  }))
  // 排名口径：累计词汇量 → 连续天数 → 累计天数 → 注册先后（稳定平局）
  ranked.sort(
    (a, b) =>
      b.totalWords - a.totalWords ||
      b.currentStreak - a.currentStreak ||
      b.totalDays - a.totalDays ||
      a.createdAt.localeCompare(b.createdAt),
  )

  const toEntry = (u: (typeof ranked)[number], rank: number): LeaderboardEntryDTO => ({
    rank,
    userId: u.userId,
    nickname: u.nickname,
    provider: u.provider,
    totalWords: u.totalWords,
    currentStreak: u.currentStreak,
    totalDays: u.totalDays,
    isMe: u.userId === meId,
  })
  const top = ranked.slice(0, limit).map((u, i) => toEntry(u, i + 1))
  const meIndex = ranked.findIndex((u) => u.userId === meId)
  const entries =
    meIndex >= 0 && meIndex < limit ? top : meIndex >= 0 ? [...top, toEntry(ranked[meIndex], meIndex + 1)] : top
  return { today, entries, totalUsers: users.length }
}

/** GET /api/today 的数据装配。 */
export function getTodayInfo(db: DB, user: UserRow, today: string): TodayDTO {
  const streak = getStreak(db, user.id, today)
  if (!user.active_book_id) {
    return {
      date: today,
      hasBook: false,
      task: null,
      completed: false,
      bookFinished: false,
      streak,
      lastMode: user.last_mode,
    }
  }
  const q = computeTodayQueue(db, user, today)
  const remaining = q.reviewIds.length + q.newIds.length
  const done = repo.todayCounts(db, user.id, today, q.bookId!)
  const total = done.done + remaining
  const progress = repo.listProgressByBook(db, user.id, q.bookId!)
  const wordCount = q.wordsById.size
  const learned = progress.length
  const checkin = repo.getCheckin(db, user.id, today)
  return {
    date: today,
    hasBook: true,
    task: {
      reviewCount: q.reviewIds.length,
      newCount: q.newIds.length,
      doneCount: done.done,
      totalCount: total,
      doneNewCount: done.newCount,
      doneReviewCount: done.reviewCount,
    },
    completed: checkin !== null && remaining === 0,
    // 「本书已完成」：该词书词全部学过；若仍有到期复习，队列照常返回（前端以 task 优先展示）
    bookFinished: wordCount > 0 && learned >= wordCount && remaining === 0,
    streak,
    lastMode: user.last_mode,
  }
}

/** GET /api/study/queue 的数据装配。 */
export function getQueue(db: DB, user: UserRow, mode: StudyMode, today: string): QueueDTO {
  const q = computeTodayQueue(db, user, today)
  if (!q.bookId) throw new BizError(400, 'NO_ACTIVE_BOOK')
  const items: QueueItemDTO[] = []
  const orderedIds = [...q.reviewIds, ...q.newIds]

  // 选择题干扰项池：同词书全部词
  const pool =
    mode === 'choice' && q.bookId
      ? repo.listWordsByBook(db, q.bookId).map((w) => ({
          wordId: w.id,
          headword: w.headword,
          meaningText: formatMeaningText(JSON.parse(w.translations)),
        }))
      : []

  orderedIds.forEach((wordId, position) => {
    const w = q.wordsById.get(wordId)
    if (!w) return
    const isNew = !repo.getProgress(db, user.id, wordId)
    if (mode === 'card') {
      items.push({ kind: 'card', ...toWordFull(w, isNew) })
    } else if (mode === 'spelling') {
      // headword 仅供 TTS 发音（浏览器语音必须有文本），UI 不渲染；防泄题在界面层保证
      items.push({ kind: 'spelling', wordId: w.id, isNew, headword: w.headword, translations: JSON.parse(w.translations) })
    } else {
      const direction = directionForPosition(position)
      const built = buildChoice({
        wordId: w.id,
        headword: w.headword,
        translations: JSON.parse(w.translations),
        pool,
        direction,
      })
      if (!built) {
        // 词书干扰项不足（极端边界）：降级为卡片项，保证队列完整
        items.push({ kind: 'card', ...toWordFull(w, isNew) })
        return
      }
      items.push({
        kind: 'choice',
        wordId: w.id,
        isNew,
        direction,
        stem:
          direction === 'e2c'
            ? { headword: w.headword, phonetic: w.phonetic }
            : { translations: JSON.parse(w.translations) },
        options: built.options,
      } as QueueItemDTO)
    }
  })
  return { date: today, items }
}

export interface AnswerBody {
  wordId: number
  mode: StudyMode
  quality?: number
  choiceIndex?: number
  answer?: string
}

function normalizeSpelling(s: string): string {
  return s.trim().toLowerCase()
}

/** POST /api/study/answer：判分 → SM-2 → 落库 → 打卡判定。 */
export function submitAnswer(db: DB, user: UserRow, body: AnswerBody, now: Date): AnswerResultDTO {
  const today = todayInShanghai(now)
  const { wordId, mode } = body
  if (!Number.isInteger(wordId) || wordId <= 0) throw new BizError(400, 'BAD_WORD_ID')

  const q = computeTodayQueue(db, user, today)
  if (!q.bookId) throw new BizError(400, 'NO_ACTIVE_BOOK')
  const word = q.wordsById.get(wordId)
  if (!word) throw new BizError(400, 'WORD_NOT_IN_TODAY_QUEUE')
  const inReview = q.reviewIds.includes(wordId)
  const inNew = q.newIds.includes(wordId)
  if (!inReview && !inNew) throw new BizError(400, 'WORD_NOT_IN_TODAY_QUEUE')

  // —— 判分（服务端裁决）——
  let correct: boolean
  let quality: Quality
  let correctIndex: number | undefined
  if (mode === 'card') {
    if (!isQuality(body.quality)) throw new BizError(400, 'BAD_QUALITY')
    quality = body.quality
    correct = quality >= 3
  } else if (mode === 'choice') {
    if (!Number.isInteger(body.choiceIndex) || (body.choiceIndex as number) < 0 || (body.choiceIndex as number) >= 4) {
      throw new BizError(400, 'BAD_CHOICE_INDEX')
    }
    const built = buildChoice({
      wordId: word.id,
      headword: word.headword,
      translations: JSON.parse(word.translations),
      pool: repo.listWordsByBook(db, q.bookId).map((w) => ({
        wordId: w.id,
        headword: w.headword,
        meaningText: formatMeaningText(JSON.parse(w.translations)),
      })),
      direction: directionForPosition(inReview ? q.reviewIds.indexOf(wordId) : q.reviewIds.length + q.newIds.indexOf(wordId)),
    })
    // 选项以 wordId 为种子确定性生成；理论上不可能为 null（入队前已校验词书规模）
    correctIndex = built ? built.correctIndex : 0
    correct = body.choiceIndex === correctIndex
    quality = correct ? 5 : 1
  } else {
    const answer = typeof body.answer === 'string' ? body.answer : ''
    if (normalizeSpelling(answer).length === 0) throw new BizError(400, 'EMPTY_ANSWER')
    correct = normalizeSpelling(answer) === normalizeSpelling(word.headword)
    quality = correct ? 5 : 1
  }

  // —— SM-2 调度 + 落库（事务）——
  const prev = repo.getProgress(db, user.id, wordId)
  const sm2State = prev
    ? { ef: prev.ef, intervalDays: prev.interval_days, reps: prev.reps }
    : initialSm2State()
  const sm2 = applySm2(sm2State, quality, today, addDays)
  withTransaction(db, () => {
    repo.upsertProgress(db, {
      user_id: user.id,
      word_id: wordId,
      book_id: word.book_id,
      status: sm2.status,
      ef: sm2.ef,
      interval_days: sm2.intervalDays,
      reps: sm2.reps,
      due_date: sm2.dueDate,
      last_reviewed_at: now.toISOString(),
    })
    repo.insertReviewLog(db, {
      userId: user.id,
      wordId,
      bookId: word.book_id,
      studyDate: today,
      mode,
      isNew: prev === null,
      quality,
      correct,
      intervalAfter: sm2.intervalDays,
      dueDate: sm2.dueDate,
    })
    repo.updateUser(db, user.id, { last_mode: mode })
  })

  // —— 打卡判定：队列清空且今日确有完成项 ——
  const after = computeTodayQueue(db, user, today)
  const remaining = after.reviewIds.length + after.newIds.length
  const done = repo.todayCounts(db, user.id, today, word.book_id)
  let checkin: { streak: number } | null = null
  if (remaining === 0 && done.done > 0 && !repo.getCheckin(db, user.id, today)) {
    withTransaction(db, () => {
      repo.upsertCheckin(db, user.id, today, done.newCount, done.reviewCount)
    })
    checkin = { streak: getStreak(db, user.id, today) }
  }

  return {
    correct,
    quality,
    word: toWordFull(word, prev === null),
    correctIndex,
    nextIntervalDays: sm2.intervalDays,
    nextDueDate: sm2.dueDate,
    progress: { done: done.done, total: done.done + remaining, date: today },
    checkin,
  }
}

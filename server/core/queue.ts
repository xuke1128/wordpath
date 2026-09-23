/**
 * 今日队列组队（PRD §3.3，纯函数可单测）。
 *
 * 规则：
 * - 当日任务 = 到期复习词（优先）+ 新词；新词按词书顺序取；
 * - 到期 = word_progress.due_date <= today（该词书内）；
 * - 新词 = 词书中尚无 word_progress 行的词（「已学」口径 = 有进度行）；
 * - 当日新词计划 = min(N, 今日开时未学数)；今日已学新词计入配额，
 *   即「已学项不变，未学新词按 N 补齐或缩减」（设计 F4）：
 *   新词剩余 = min(N, 当前未学 + 今日已学新词) − 今日已学新词；
 * - 复习按 due_date 升序、再按词书顺序；保证当日到期词 100% 入队（US8）。
 */

export interface QueueWordRow {
  wordId: number
  sort: number
}

export interface QueueProgressRow {
  wordId: number
  dueDate: string
}

export interface QueueResult {
  reviewWordIds: number[]
  newWordIds: number[]
}

export function buildTodayQueue(
  words: readonly QueueWordRow[], // 该词书全部词，按 sort 升序
  progress: readonly QueueProgressRow[], // 该用户在该词书的全部进度行
  dailyNewLimit: number,
  today: string,
  newDoneToday = 0, // 今日（该词书）已学新词数
): QueueResult {
  const progressByWord = new Map(progress.map((p) => [p.wordId, p]))
  const review: number[] = []
  const fresh: number[] = []
  for (const w of words) {
    const p = progressByWord.get(w.wordId)
    if (!p) {
      fresh.push(w.wordId)
    } else if (p.dueDate <= today) {
      review.push(w.wordId)
    }
  }
  // 到期词按 due_date 升序（更早到期的先出现），同日按词书顺序
  const dueOf = new Map(progress.map((p) => [p.wordId, p.dueDate]))
  review.sort((a, b) => {
    const da = dueOf.get(a)!
    const db = dueOf.get(b)!
    if (da !== db) return da < db ? -1 : 1
    return a - b
  })

  const done = Math.max(0, newDoneToday)
  const unlearnedAtDayStart = fresh.length + done
  const plannedNew = Math.min(Math.max(0, dailyNewLimit), unlearnedAtDayStart)
  const newRemaining = Math.max(0, plannedNew - done)
  return { reviewWordIds: review, newWordIds: fresh.slice(0, newRemaining) }
}

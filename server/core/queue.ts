/**
 * 今日队列组队（PRD §3.3，纯函数可单测）。
 *
 * 规则：
 * - 当日任务 = 到期复习词（优先）+ 新词；
 * - 到期 = word_progress.due_date <= today（该词书内）；
 * - 新词 = 词书中尚无 word_progress 行的词（「已学」口径 = 有进度行）；
 * - 当日新词计划 = min(N, 今日开时未学数)；今日已学新词计入配额，
 *   即「已学项不变，未学新词按 N 补齐或缩减」（设计 F4）：
 *   新词剩余 = min(N, 当前未学 + 今日已学新词) − 今日已学新词；
 * - 复习按 due_date 升序、同日到期按既定顺序；保证当日到期词 100% 入队（US8）。
 * - 顺序（seed 非空时）：整册词表按 seed 确定性洗牌——新词不再是字母/词书顺序；
 *   「今日已学新词」按同一顺序回填进当日计划（newDoneWordIds），因此
 *   计划集合与顺序全天稳定；复习词同日到期的平局也按洗牌序打破。
 *   seed 为空时保持词书顺序（历史行为，供纯函数单测与兼容）。
 */
import { seededShuffle } from './shuffle'

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
  newDoneWordIds: readonly number[] = [], // 今日已学新词的 wordId（seed 模式下用于回填当日计划）
  seed = '', // 非空时启用确定性洗牌
): QueueResult {
  const progressByWord = new Map(progress.map((p) => [p.wordId, p]))

  // —— 顺序：seed 洗牌序 或 词书序 ——
  let orderPos: Map<number, number>
  if (seed === '') {
    orderPos = new Map(words.map((w, i) => [w.wordId, i]))
  } else {
    const shuffled = seededShuffle(
      words.map((w) => w.wordId),
      seed,
    )
    orderPos = new Map(shuffled.map((id, i) => [id, i]))
  }

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
  // 到期词按 due_date 升序（更早到期的先出现），同日按洗牌序
  const dueOf = new Map(progress.map((p) => [p.wordId, p.dueDate]))
  review.sort((a, b) => {
    const da = dueOf.get(a)!
    const db = dueOf.get(b)!
    if (da !== db) return da < db ? -1 : 1
    return orderPos.get(a)! - orderPos.get(b)!
  })

  const done = Math.max(0, newDoneToday)
  const plannedNew = Math.min(Math.max(0, dailyNewLimit), fresh.length + done)
  const newRemaining = Math.max(0, plannedNew - done)

  let newWordIds: number[]
  if (seed === '') {
    // 词书序：直接取当前未学词前 newRemaining 个（历史行为）
    newWordIds = fresh.slice(0, newRemaining)
  } else {
    // 当日计划按「今日开时未学」全量排序（未学词 + 今日已学新词回填原位），
    // 计划中仍未学的部分依序出队 → 计划集合与顺序全天稳定
    const dayStart = [...fresh, ...newDoneWordIds].sort((a, b) => orderPos.get(a)! - orderPos.get(b)!)
    const planned = dayStart.slice(0, plannedNew)
    const freshSet = new Set(fresh)
    newWordIds = planned.filter((id) => freshSet.has(id)).slice(0, newRemaining)
  }
  return { reviewWordIds: review, newWordIds }
}

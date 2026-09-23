/**
 * SM-2 间隔重复算法（PRD §3.5 的唯一实现，纯函数可单测）。
 *
 * 口径：
 * - EF' = clamp(EF + (0.1 − (5−q)×(0.08 + (5−q)×0.02)), 下限 1.3)，初始 2.5
 * - q≥3：reps+1；interval：reps=1→1，reps=2→6，reps≥3→round(interval×EF')
 * - q<3：reps=0，interval=1
 * - dueDate = studyDate + interval
 * - status：reps≥2 → review，否则 learning（首次学过即为 learning）
 */

export interface Sm2State {
  ef: number
  intervalDays: number
  reps: number
}

export interface Sm2Result extends Sm2State {
  status: 'learning' | 'review'
  dueDate: string
}

export const INITIAL_EF = 2.5
export const MIN_EF = 1.3

/** 合法评分集合：认识 q5 / 模糊 q3 / 忘记 q1（含选择/拼写对错的 5/1）。 */
export const QUALITIES = [1, 3, 5] as const
export type Quality = (typeof QUALITIES)[number]

export function isQuality(q: unknown): q is Quality {
  return q === 1 || q === 3 || q === 5
}

export function applySm2(
  prev: Sm2State,
  q: Quality,
  studyDate: string,
  addDaysFn: (date: string, n: number) => string,
): Sm2Result {
  const shortfall = 5 - q
  const ef = Math.max(MIN_EF, prev.ef + (0.1 - shortfall * (0.08 + shortfall * 0.02)))

  let reps: number
  let intervalDays: number
  if (q >= 3) {
    reps = prev.reps + 1
    if (reps === 1) intervalDays = 1
    else if (reps === 2) intervalDays = 6
    else intervalDays = Math.max(1, Math.round(prev.intervalDays * ef))
  } else {
    reps = 0
    intervalDays = 1
  }

  return {
    ef,
    intervalDays,
    reps,
    status: reps >= 2 ? 'review' : 'learning',
    dueDate: addDaysFn(studyDate, intervalDays),
  }
}

/** 初始状态（首次学习前）。 */
export function initialSm2State(): Sm2State {
  return { ef: INITIAL_EF, intervalDays: 0, reps: 0 }
}

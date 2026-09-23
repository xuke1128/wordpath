/**
 * 连续打卡（streak）计算（PRD §3.6，纯函数可单测）。
 * 规则：按自然日连续 +1，中断归零重计；
 * 今日已打卡 → 从今天往前数；今日未打卡 → 从昨天往前数（昨日的连击仍成立）。
 */

export function calcStreak(checkedDates: ReadonlySet<string>, today: string): number {
  let streak = 0
  let cursor = checkedDates.has(today) ? today : prevDay(today)
  while (checkedDates.has(cursor)) {
    streak++
    cursor = prevDay(cursor)
  }
  return streak
}

function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

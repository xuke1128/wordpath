/**
 * 自然日工具：全部日期以 Asia/Shanghai 口径计算（PRD §9-6）。
 * 日期统一用 'YYYY-MM-DD' 字符串表达，避免时区漂移。
 */

const TZ_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 当前时刻对应的上海自然日（YYYY-MM-DD）。 */
export function todayInShanghai(now: Date = new Date()): string {
  return TZ_FORMATTER.format(now)
}

/** 日期加减 n 天（n 可为负）。输入输出均为 YYYY-MM-DD。 */
export function addDays(date: string, n: number): string {
  const d = parseDate(date)
  d.setUTCDate(d.getUTCDate() + n)
  return formatDate(d)
}

/** 两个日期的天数差（b - a）。 */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

/** 是否合法 YYYY-MM-DD。 */
export function isDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = parseDate(s)
  return !Number.isNaN(d.getTime()) && formatDate(d) === s
}

/** 是否合法 YYYY-MM。 */
export function isMonthStr(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/** 某月全部日期（YYYY-MM-DD），按升序。 */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const out: string[] = []
  for (let i = 1; i <= last; i++) out.push(`${month}-${String(i).padStart(2, '0')}`)
  return out
}

/** 当前月份（按上海自然日），YYYY-MM。 */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  // 用 UTC 正午构造，规避任何本地时区/DST 偏移
  return new Date(Date.UTC(y, m - 1, d, 12))
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

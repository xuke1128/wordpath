import { describe, expect, it } from 'vitest'
import { addDays, daysInMonth, diffDays, isDateStr, monthOf } from '../../server/core/dates'

describe('dates（Asia/Shanghai 自然日）', () => {
  it('addDays 跨月/跨年正确', () => {
    expect(addDays('2026-01-01', 1)).toBe('2026-01-02')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-09-23', 6)).toBe('2026-09-29')
  })

  it('diffDays 正确', () => {
    expect(diffDays('2026-09-01', '2026-09-08')).toBe(7)
    expect(diffDays('2026-09-08', '2026-09-01')).toBe(-7)
  })

  it('isDateStr / isMonthStr', () => {
    expect(isDateStr('2026-09-23')).toBe(true)
    expect(isDateStr('2026-13-01')).toBe(false)
    expect(isDateStr('2026-09-31')).toBe(false)
    expect(isDateStr('abc')).toBe(false)
  })

  it('monthOf 与 daysInMonth', () => {
    expect(monthOf('2026-09-23')).toBe('2026-09')
    expect(daysInMonth('2026-09').length).toBe(30)
    expect(daysInMonth('2026-02').length).toBe(28)
    expect(daysInMonth('2028-02').length).toBe(29) // 闰年
    expect(daysInMonth('2026-09')[0]).toBe('2026-09-01')
  })
})

import { describe, expect, it } from 'vitest'
import { calcStreak } from '../../server/core/streak'

const set = (...dates: string[]) => new Set(dates)

describe('streak 连续打卡（US9 验收）', () => {
  it('今日已打卡：从今天往前连续计数', () => {
    expect(calcStreak(set('2026-09-21', '2026-09-22', '2026-09-23'), '2026-09-23')).toBe(3)
  })

  it('今日未打卡：昨日连击仍成立', () => {
    expect(calcStreak(set('2026-09-21', '2026-09-22'), '2026-09-23')).toBe(2)
  })

  it('中断归零重计：昨天断，今日打卡只有 1 天', () => {
    expect(calcStreak(set('2026-09-19', '2026-09-20', '2026-09-23'), '2026-09-23')).toBe(1)
  })

  it('空记录为 0', () => {
    expect(calcStreak(set(), '2026-09-23')).toBe(0)
  })

  it('跨月连续', () => {
    expect(calcStreak(set('2026-08-30', '2026-08-31', '2026-09-01'), '2026-09-01')).toBe(3)
  })

  it('首次打卡（streak=1）', () => {
    expect(calcStreak(set('2026-09-23'), '2026-09-23')).toBe(1)
  })
})

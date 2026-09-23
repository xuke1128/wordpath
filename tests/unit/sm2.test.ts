import { describe, expect, it } from 'vitest'
import { addDays } from '../../server/core/dates'
import { applySm2, initialSm2State, MIN_EF, isQuality } from '../../server/core/sm2'

const add = (d: string, n: number) => addDays(d, n)

describe('SM-2（PRD §3.5 口径）', () => {
  it('q=5 首次通过：EF 2.5→2.6，interval=1，due=明天，status=learning', () => {
    const r = applySm2(initialSm2State(), 5, '2026-09-23', add)
    expect(r.ef).toBeCloseTo(2.6)
    expect(r.intervalDays).toBe(1)
    expect(r.reps).toBe(1)
    expect(r.dueDate).toBe('2026-09-24')
    expect(r.status).toBe('learning')
  })

  it('q=5 第二次通过：interval=6（US8 验收序列）', () => {
    const r = applySm2({ ef: 2.6, intervalDays: 1, reps: 1 }, 5, '2026-09-24', add)
    expect(r.ef).toBeCloseTo(2.7)
    expect(r.reps).toBe(2)
    expect(r.intervalDays).toBe(6)
    expect(r.dueDate).toBe('2026-09-30')
    expect(r.status).toBe('review')
  })

  it('q=5 第三次起：interval = round(interval × EF)', () => {
    const r = applySm2({ ef: 2.7, intervalDays: 6, reps: 2 }, 5, '2026-09-30', add)
    expect(r.ef).toBeCloseTo(2.8)
    expect(r.intervalDays).toBe(Math.round(6 * 2.8))
    expect(r.intervalDays).toBe(17)
    expect(r.dueDate).toBe('2026-10-17')
  })

  it('q=3（模糊）：EF −0.14、reps+1、interval 按序列推进', () => {
    const r = applySm2(initialSm2State(), 3, '2026-09-23', add)
    // 5-q=2 → 修正项 = 0.1 − 2×(0.08+2×0.02) = −0.14
    expect(r.ef).toBeCloseTo(2.36)
    expect(r.reps).toBe(1)
    expect(r.intervalDays).toBe(1)
    const r2 = applySm2({ ef: 2.36, intervalDays: 1, reps: 1 }, 3, '2026-09-24', add)
    expect(r2.intervalDays).toBe(6)
  })

  it('q=1（忘记）：reps 归零、interval=1（US8 验收）', () => {
    const r = applySm2({ ef: 2.8, intervalDays: 17, reps: 5 }, 1, '2026-09-23', add)
    expect(r.reps).toBe(0)
    expect(r.intervalDays).toBe(1)
    expect(r.dueDate).toBe('2026-09-24')
    expect(r.status).toBe('learning') // reps<2 回到 learning
  })

  it('EF 下限 1.3：连续 q=1 不会跌破（US8 验收）', () => {
    let s = initialSm2State()
    for (let i = 0; i < 20; i++) {
      s = applySm2(s, 1, '2026-09-23', add)
      expect(s.ef).toBeGreaterThanOrEqual(MIN_EF)
    }
    expect(s.ef).toBeCloseTo(MIN_EF)
  })

  it('EF 增长封顶于 q=5（每次 +0.1）', () => {
    let s = initialSm2State()
    for (let i = 0; i < 50; i++) s = applySm2(s, 5, '2026-09-23', add)
    expect(s.ef).toBeCloseTo(2.5 + 0.1 * 50)
  })

  it('isQuality 仅接受 {1,3,5}', () => {
    expect(isQuality(1)).toBe(true)
    expect(isQuality(3)).toBe(true)
    expect(isQuality(5)).toBe(true)
    expect(isQuality(2)).toBe(false)
    expect(isQuality(4)).toBe(false)
    expect(isQuality(0)).toBe(false)
    expect(isQuality('5')).toBe(false)
  })
})

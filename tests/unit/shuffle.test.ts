import { describe, expect, it } from 'vitest'
import { hashSeed, mulberry32, seededShuffle } from '../../server/core/shuffle'

describe('确定性洗牌（core/shuffle）', () => {
  it('相同 seed：输出完全一致，且不改入参', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const snapshot = [...items]
    const a = seededShuffle(items, 'u1:cet4:2026-09-24')
    const b = seededShuffle(items, 'u1:cet4:2026-09-24')
    expect(a).toEqual(b)
    expect(items).toEqual(snapshot)
  })

  it('不同 seed：顺序不同（多组抽样均异）', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    const orders = new Set<string>()
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      orders.add(JSON.stringify(seededShuffle(items, seed)))
    }
    expect(orders.size).toBe(5)
  })

  it('是原集合的重排（不增不减不重复）', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    const out = seededShuffle(items, 'any')
    expect([...out].sort((x, y) => x - y)).toEqual(items)
  })

  it('空数组与单元素安全', () => {
    expect(seededShuffle([], 's')).toEqual([])
    expect(seededShuffle([1], 's')).toEqual([1])
  })

  it('hashSeed/mulberry32：确定性且落域', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
    const rand = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

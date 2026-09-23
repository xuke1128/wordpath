import { describe, expect, it } from 'vitest'
import { buildTodayQueue } from '../../server/core/queue'

const words = Array.from({ length: 10 }, (_, i) => ({ wordId: i + 1, sort: i + 1 }))

describe('今日队列组队（PRD §3.3 / US4 / US8）', () => {
  it('全部新词：新词数 = min(N, 剩余)，按词书顺序', () => {
    const r = buildTodayQueue(words, [], 3, '2026-09-23')
    expect(r.reviewWordIds).toEqual([])
    expect(r.newWordIds).toEqual([1, 2, 3])
  })

  it('N=100 而书内只有 10 词：全量入队', () => {
    const r = buildTodayQueue(words, [], 100, '2026-09-23')
    expect(r.newWordIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('到期词（due<=today）100% 出现在复习队列且排在新词前', () => {
    const progress = [
      { wordId: 4, dueDate: '2026-09-23' },
      { wordId: 2, dueDate: '2026-09-22' },
      { wordId: 9, dueDate: '2026-09-23' },
      { wordId: 1, dueDate: '2026-09-30' }, // 未到期 → 不入队
    ]
    const r = buildTodayQueue(words, progress, 2, '2026-09-23')
    expect(r.reviewWordIds).toEqual([2, 4, 9]) // due 升序
    expect(r.newWordIds).toEqual([3, 5]) // 未学词按顺序取 2 个
  })

  it('改小 N：已学项不变，未学新词缩减', () => {
    const big = buildTodayQueue(words, [], 5, '2026-09-23')
    expect(big.newWordIds).toHaveLength(5)
    const small = buildTodayQueue(words, [], 2, '2026-09-23')
    expect(small.newWordIds).toEqual([1, 2])
  })

  it('学过的词（due>today）不再入队', () => {
    const progress = words.slice(0, 4).map((w) => ({ wordId: w.wordId, dueDate: '2026-09-24' }))
    const r = buildTodayQueue(words, progress, 20, '2026-09-23')
    expect(r.reviewWordIds).toEqual([])
    expect(r.newWordIds).toEqual([5, 6, 7, 8, 9, 10])
  })

  it('当日已学新词计入配额：N=10、今日已学 5 → 剩余 5（F4 即时生效口径）', () => {
    // 词 1-5 今日已学（due 已到未来），当前未学 = 6-10 共 5 个
    const progress = words.slice(0, 5).map((w) => ({ wordId: w.wordId, dueDate: '2026-09-24' }))
    const r = buildTodayQueue(words, progress, 10, '2026-09-23', 5)
    expect(r.newWordIds).toEqual([6, 7, 8, 9, 10])
  })

  it('改小 N 时未学新词缩减：N=3、今日已学 5 → 剩余 0，不回吐', () => {
    const progress = words.slice(0, 5).map((w) => ({ wordId: w.wordId, dueDate: '2026-09-24' }))
    const r = buildTodayQueue(words, progress, 3, '2026-09-23', 5)
    expect(r.newWordIds).toEqual([])
  })

  it('昨日学过的词不占用今日配额', () => {
    const progress = words.slice(0, 5).map((w) => ({ wordId: w.wordId, dueDate: '2026-09-24' }))
    const r = buildTodayQueue(words, progress, 20, '2026-09-23', 0)
    expect(r.newWordIds).toEqual([6, 7, 8, 9, 10])
  })

  it('N=0 边界：无新词（服务器校验层另有 5-100 约束，此处测纯函数鲁棒性）', () => {
    const r = buildTodayQueue(words, [], 0, '2026-09-23')
    expect(r.newWordIds).toEqual([])
  })
})

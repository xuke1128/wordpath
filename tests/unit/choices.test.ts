import { describe, expect, it } from 'vitest'
import { buildChoice, directionForPosition, formatMeaningText } from '../../server/core/choices'

interface PoolWord {
  wordId: number
  headword: string
  translations: Array<{ pos: string; meaning: string }>
}

const book: PoolWord[] = [
  { wordId: 1, headword: 'abandon', translations: [{ pos: 'v.', meaning: '放弃；抛弃' }] },
  { wordId: 2, headword: 'boost', translations: [{ pos: 'v.', meaning: '提升；促进' }] },
  { wordId: 3, headword: 'tolerate', translations: [{ pos: 'v.', meaning: '容忍；忍受' }] },
  { wordId: 4, headword: 'attain', translations: [{ pos: 'v.', meaning: '达到；实现' }] },
  { wordId: 5, headword: 'decline', translations: [{ pos: 'v.', meaning: '下降；婉拒' }] },
  { wordId: 6, headword: 'arouse', translations: [{ pos: 'v.', meaning: '唤起；激发' }] },
  // 与 abandon 同文案的词：文本级去重应跳过它作为干扰项
  { wordId: 7, headword: 'desert', translations: [{ pos: 'v.', meaning: '放弃；抛弃' }] },
]

function toPool(words: PoolWord[], excludeId: number) {
  return words
    .filter((w) => w.wordId !== excludeId)
    .map((w) => ({ wordId: w.wordId, headword: w.headword, meaningText: formatMeaningText(w.translations) }))
}

describe('选择题生成（US6 验收）', () => {
  const target = book[0]

  it('英→中：恰 4 个选项、互不相同、恰 1 个正确', () => {
    const r = buildChoice({
      wordId: target.wordId,
      headword: target.headword,
      translations: target.translations,
      pool: toPool(book, target.wordId),
      direction: 'e2c',
    })!
    expect(r.options).toHaveLength(4)
    expect(new Set(r.options).size).toBe(4)
    expect(r.correctIndex).toBeGreaterThanOrEqual(0)
    expect(r.correctIndex).toBeLessThan(4)
    expect(r.options[r.correctIndex]).toBe(formatMeaningText(target.translations))
  })

  it('中→英：干扰项为同书 headword，排除题干词自身', () => {
    const r = buildChoice({
      wordId: target.wordId,
      headword: target.headword,
      translations: target.translations,
      pool: toPool(book, target.wordId),
      direction: 'c2e',
    })!
    expect(r.options).toHaveLength(4)
    expect(new Set(r.options).size).toBe(4)
    expect(r.options).toContain('abandon')
    expect(r.options.filter((o) => o === 'abandon')).toHaveLength(1)
  })

  it('文本级去重：与正确答案同文案的词不会成为干扰项', () => {
    const r = buildChoice({
      wordId: 7,
      headword: 'desert',
      translations: book[6].translations,
      pool: toPool(book, 7),
      direction: 'e2c',
    })!
    const correctText = 'v. 放弃；抛弃'
    expect(r.options[r.correctIndex]).toBe(correctText)
    expect(r.options.filter((o) => o === correctText)).toHaveLength(1)
  })

  it('确定性：同一 wordId 多次生成结果一致（模式切换重拉不变）', () => {
    const a = buildChoice({
      wordId: 4,
      headword: 'attain',
      translations: book[3].translations,
      pool: toPool(book, 4),
      direction: 'c2e',
    })
    const b = buildChoice({
      wordId: 4,
      headword: 'attain',
      translations: book[3].translations,
      pool: toPool(book, 4),
      direction: 'c2e',
    })
    expect(a).toEqual(b)
  })

  it('词书过小时返回 null（调用方降级）', () => {
    const small = [book[1], book[2]]
    const r = buildChoice({
      wordId: 2,
      headword: 'boost',
      translations: book[1].translations,
      pool: toPool(small, 2),
      direction: 'e2c',
    })
    expect(r).toBeNull()
  })

  it('题型方向按位置奇偶交替', () => {
    expect(directionForPosition(0)).toBe('e2c')
    expect(directionForPosition(1)).toBe('c2e')
    expect(directionForPosition(2)).toBe('e2c')
  })
})

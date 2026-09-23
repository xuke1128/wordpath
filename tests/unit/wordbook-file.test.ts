import { describe, expect, it } from 'vitest'
import { parseWordBookFile } from '../../server/db/wordbook-file'

function validBook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test',
    stage: 'cet4',
    name: '测试词书',
    description: '用于测试的词书',
    words: Array.from({ length: 100 }, (_, i) => ({
      headword: `word${i}`,
      phonetic: '/wɜːd/',
      translations: [{ pos: 'n.', meaning: '词' }],
      example: { en: `This is word${i}.`, cn: `这是第${i}个词。` },
    })),
    ...overrides,
  }
}

describe('词书 JSON 校验（PRD §3.2）', () => {
  it('合法词书通过', () => {
    const r = parseWordBookFile(validBook())
    expect('book' in r).toBe(true)
  })

  it('words 少于 100 报错', () => {
    const r = parseWordBookFile(validBook({ words: validBook().words.slice(0, 99) }))
    expect('errors' in r && r.errors.some((e) => e.includes('至少 100'))).toBe(true)
  })

  it('stage 非法报错', () => {
    const r = parseWordBookFile(validBook({ stage: 'college' }))
    expect('errors' in r && r.errors.length > 0).toBe(true)
  })

  it('书内 headword 重复报错', () => {
    const b = validBook()
    ;(b.words[1] as Record<string, unknown>).headword = 'word0'
    const r = parseWordBookFile(b)
    expect('errors' in r && r.errors.some((e) => e.includes('重复'))).toBe(true)
  })

  it('词条缺 example 报错', () => {
    const b = validBook()
    delete (b.words[5] as Record<string, unknown>).example
    const r = parseWordBookFile(b)
    expect('errors' in r && r.errors.some((e) => e.includes('example'))).toBe(true)
  })

  it('非对象输入报错', () => {
    expect('errors' in parseWordBookFile('nope')).toBe(true)
    expect('errors' in parseWordBookFile(null)).toBe(true)
  })
})

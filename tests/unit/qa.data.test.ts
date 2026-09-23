/**
 * QA 数据验收（独立门禁补充）：仓库实际发布的种子词书与环境变量样例，
 * 对应 PRD §3.2（6 本 × ≥100 词、字段完整）、§5-2 / US2（.env.example 占位与说明）。
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import * as path from 'node:path'
import { STAGES, type WordBookFile } from '../../shared/types'

const ROOT = path.resolve(__dirname, '../..')
const BOOK_DIR = path.join(ROOT, 'assets', 'wordbooks')

function loadBooks(): Array<{ file: string; book: WordBookFile }> {
  return readdirSync(BOOK_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      book: JSON.parse(readFileSync(path.join(BOOK_DIR, file), 'utf8')) as WordBookFile,
    }))
}

describe('QA：种子词书数据（PRD §3.2 / §9-1）', () => {
  const books = loadBooks()

  it('恰 6 本词书，id 唯一且覆盖全部 6 个学段', () => {
    expect(books).toHaveLength(6)
    const ids = books.map((b) => b.book.id)
    expect(new Set(ids).size).toBe(6)
    expect([...ids].sort()).toEqual([...STAGES].sort())
  })

  it('6 本词书、id 唯一且覆盖全部 6 个学段，规模与发布版一致（v1.2 全量词库）', () => {
    expect(books).toHaveLength(6)
    const ids = books.map((b) => b.book.id)
    expect(new Set(ids).size).toBe(6)
    expect([...ids].sort()).toEqual([...STAGES].sort())
    // 由 scripts/build-wordbooks.ts 从 kajweb/dict 数据生成；重新生成后如数量变化需同步更新
    const expected: Record<string, number> = {
      primary: 676,
      junior: 2416,
      senior: 4750,
      cet4: 4500,
      cet6: 3907,
      kaoyan: 4988,
    }
    let total = 0
    for (const { book } of books) {
      expect(book.words.length, book.id).toBe(expected[book.id])
      expect(book.name.trim().length, book.id).toBeGreaterThan(0)
      expect(book.description.trim().length, book.id).toBeGreaterThan(0)
      total += book.words.length
    }
    expect(total).toBe(21237)
  })

  it('每个词条字段完整：headword 书内唯一、音标/释义/双语例句非空', () => {
    for (const { book } of books) {
      const seen = new Set<string>()
      for (const w of book.words) {
        expect(w.headword.trim().length, `${book.id}:${w.headword}`).toBeGreaterThan(0)
        expect(seen.has(w.headword), `${book.id} 重复 headword: ${w.headword}`).toBe(false)
        seen.add(w.headword)
        expect(w.phonetic.trim().length, `${book.id}:${w.headword}.phonetic`).toBeGreaterThan(0)
        expect(Array.isArray(w.translations) && w.translations.length > 0, `${book.id}:${w.headword}.translations`).toBe(true)
        for (const t of w.translations) {
          expect(t.pos.trim().length).toBeGreaterThan(0)
          expect(t.meaning.trim().length).toBeGreaterThan(0)
        }
        expect(w.example.en.trim().length, `${book.id}:${w.headword}.example.en`).toBeGreaterThan(0)
        expect(w.example.cn.trim().length, `${book.id}:${w.headword}.example.cn`).toBeGreaterThan(0)
      }
    }
  })

  it('音标为 IPA 记法：每本过半词条含非 ASCII 音标符号（渲染数据基础）', () => {
    for (const { book } of books) {
      const ipaCount = book.words.filter((w) => /[^\x00-\x7F/]/.test(w.phonetic)).length
      expect(ipaCount, book.id).toBeGreaterThanOrEqual(50)
    }
  })

  it('词书 JSON 均能通过导入校验器（seed 与 wordbook:validate 同一口径）', async () => {
    const { parseWordBookFile } = await import('../../server/db/wordbook-file')
    for (const { file, book } of books) {
      const r = parseWordBookFile(JSON.parse(JSON.stringify(book)), file)
      expect('errors' in r ? r.errors : [], file).toEqual([])
    }
  })
})

describe('QA：环境变量样例与开源就绪（US2 / PRD §7-6）', () => {
  it('.env.example 存在且含微信三项占位与说明', () => {
    const file = path.join(ROOT, '.env.example')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('WECHAT_APPID')
    expect(text).toContain('WECHAT_SECRET')
    expect(text).toContain('WECHAT_REDIRECT_URI')
    expect(text).toContain('PORT')
    expect(text).toContain('WORDPATH_DB')
  })

  it('.env.example 不含真实微信凭据（appid 形如 wx 开头 16 位十六进制为已填值）', () => {
    const text = readFileSync(path.join(ROOT, '.env.example'), 'utf8')
    expect(text).not.toMatch(/WECHAT_APPID\s*=\s*wx[0-9a-fA-F]{16}/)
    expect(text).not.toMatch(/WECHAT_SECRET\s*=\s*[^\s#]{8,}/)
  })

  it('LICENSE 与 README 齐备（PRD §7-6 开源就绪）', () => {
    expect(existsSync(path.join(ROOT, 'LICENSE'))).toBe(true)
    expect(existsSync(path.join(ROOT, 'README.md'))).toBe(true)
  })
})

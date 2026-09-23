import { existsSync, readdirSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import type { DB } from './connection'
import { withTransaction } from './connection'
import { parseWordBookFile } from './wordbook-file'
import type { WordBookFile } from '../../shared/types'

/**
 * 种子词书目录：以本文件位置向上查找 assets/wordbooks，
 * 兼容源码运行（server/db → <root>/assets）与编译产物（dist/server/db → <root>/assets）。
 */
export function wordbookAssetsDir(): string {
  let dir = __dirname
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'assets', 'wordbooks')
    if (existsSync(candidate)) return candidate
    dir = path.dirname(dir)
  }
  return path.resolve(__dirname, '../../assets/wordbooks')
}

export function loadWordBookFiles(dir: string): Array<{ file: string; book: WordBookFile }> {
  const out: Array<{ file: string; book: WordBookFile }> = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue
    const file = path.join(dir, name)
    const parsed = parseWordBookFile(JSON.parse(readFileSync(file, 'utf8')), name)
    if ('errors' in parsed) {
      throw new Error(`种子词书不合法:\n${parsed.errors.join('\n')}`)
    }
    out.push({ file, book: parsed.book })
  }
  return out
}

const BOOK_SORT: Record<string, number> = {
  primary: 1,
  junior: 2,
  senior: 3,
  cet4: 4,
  cet6: 5,
  kaoyan: 6,
}

/** 幂等播种：upsert 词书与词条（按 (book_id, headword) 去重）。 */
export function seedWordBooks(db: DB, dir: string = wordbookAssetsDir()): { books: number; words: number } {
  const files = loadWordBookFiles(dir)
  let wordCount = 0
  withTransaction(db, () => {
    const upBook = db.prepare(
      `INSERT INTO wordbooks (id, stage, name, description, sort) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, name=excluded.name,
         description=excluded.description, sort=excluded.sort`,
    )
    const upWord = db.prepare(
      `INSERT INTO words (book_id, sort, headword, phonetic, translations, example_en, example_cn)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id, headword) DO UPDATE SET sort=excluded.sort, phonetic=excluded.phonetic,
         translations=excluded.translations, example_en=excluded.example_en, example_cn=excluded.example_cn`,
    )
    for (const { book } of files) {
      upBook.run(book.id, book.stage, book.name, book.description, BOOK_SORT[book.id] ?? 99)
      book.words.forEach((w, i) => {
        upWord.run(
          book.id,
          i + 1,
          w.headword,
          w.phonetic,
          JSON.stringify(w.translations),
          w.example.en,
          w.example.cn,
        )
        wordCount++
      })
    }
  })
  return { books: files.length, words: wordCount }
}

export function seedIfEmpty(db: DB, dir: string = wordbookAssetsDir()): { seeded: boolean; books: number; words: number } {
  const row = db.prepare('SELECT COUNT(*) AS n FROM words').get() as { n: number }
  if (row.n > 0) return { seeded: false, books: 0, words: 0 }
  const r = seedWordBooks(db, dir)
  return { seeded: true, ...r }
}

/**
 * 词书 JSON 校验/导入 CLI（PRD §3.2：提供统一的 JSON 导入格式与校验脚本）。
 *
 * 用法：
 *   npm run wordbook:validate -- path/to/book.json   # 只校验
 *   npm run wordbook:import   -- path/to/book.json   # 校验并导入数据库
 */
import { readFileSync } from 'node:fs'
import { parseWordBookFile } from '../server/db/wordbook-file'
import { openDatabase } from '../server/db/connection'

const [, , command, file] = process.argv

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg)
  process.exit(1)
}

if (command !== 'validate' && command !== 'import') {
  fail('用法：npm run wordbook:validate|wordbook:import -- <file.json>')
}
if (!file) fail('缺少文件路径参数')

let raw: unknown
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (err) {
  fail(`文件不是合法 JSON：${err instanceof Error ? err.message : String(err)}`)
}

const parsed = parseWordBookFile(raw, file)
if ('errors' in parsed) {
  fail(`校验失败（${parsed.errors.length} 处）：\n${parsed.errors.join('\n')}`)
}

// eslint-disable-next-line no-console
console.log(`✔ 校验通过：《${parsed.book.name}》（${parsed.book.id}，${parsed.book.words.length} 词）`)

if (command === 'import') {
  const dbFile = process.env.WORDPATH_DB || './data/wordpath.db'
  const db = openDatabase(dbFile)
  const upBook = db.prepare(
    `INSERT INTO wordbooks (id, stage, name, description, sort) VALUES (?, ?, ?, ?, 99)
     ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, name=excluded.name, description=excluded.description`,
  )
  const upWord = db.prepare(
    `INSERT INTO words (book_id, sort, headword, phonetic, translations, example_en, example_cn)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_id, headword) DO UPDATE SET sort=excluded.sort, phonetic=excluded.phonetic,
       translations=excluded.translations, example_en=excluded.example_en, example_cn=excluded.example_cn`,
  )
  db.exec('BEGIN')
  try {
    upBook.run(parsed.book.id, parsed.book.stage, parsed.book.name, parsed.book.description)
    parsed.book.words.forEach((w, i) => {
      upWord.run(
        parsed.book.id,
        i + 1,
        w.headword,
        w.phonetic,
        JSON.stringify(w.translations),
        w.example.en,
        w.example.cn,
      )
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    fail(`导入失败：${err instanceof Error ? err.message : String(err)}`)
  }
  // eslint-disable-next-line no-console
  console.log(`✔ 已导入 ${parsed.book.words.length} 词 → ${dbFile}`)
}

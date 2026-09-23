/** 手动播种脚本：npm run seed */
import { openDatabase } from '../server/db/connection'
import { seedWordBooks } from '../server/db/seed'

const dbFile = process.env.WORDPATH_DB || './data/wordpath.db'
const db = openDatabase(dbFile)
const result = seedWordBooks(db)
// eslint-disable-next-line no-console
console.log(`[wordpath] 播种完成：${result.books} 本词书、${result.words} 个单词 → ${dbFile}`)

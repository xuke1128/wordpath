import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { SCHEMA_SQL } from './schema'

export type DB = DatabaseSync

/** 打开（必要时创建）数据库并确保 schema 存在。 */
export function openDatabase(file: string): DB {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  }
  const db = new DatabaseSync(file)
  db.exec(SCHEMA_SQL)
  return db
}

/** 事务助手：fn 抛错则回滚。node:sqlite 无 begin/commit 便捷 API，手动控制。 */
export function withTransaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 回滚失败时保留原始错误
    }
    throw err
  }
}

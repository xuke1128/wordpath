import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { SCHEMA_SQL } from './schema'

export type DB = DatabaseSync

/** 既有库升级到当前 schema：缺列则补（ALTER 不支持 IF NOT EXISTS，按 pragma 探测）。 */
function migrate(db: DB): void {
  const cols = new Set(
    (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((r) => r.name),
  )
  if (cols.size === 0) return // users 表尚不存在 → SCHEMA_SQL 首建即最新
  if (!cols.has('claimed_key')) db.exec('ALTER TABLE users ADD COLUMN claimed_key TEXT')
  if (!cols.has('pin_hash')) db.exec('ALTER TABLE users ADD COLUMN pin_hash TEXT')
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_claimed_key ON users (claimed_key) WHERE claimed_key IS NOT NULL',
  )
}

/** 打开（必要时创建）数据库并确保 schema 存在。 */
export function openDatabase(file: string): DB {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  }
  const db = new DatabaseSync(file)
  db.exec(SCHEMA_SQL)
  migrate(db)
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

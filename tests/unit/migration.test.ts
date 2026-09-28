/**
 * 老库升级迁移回归测试：模拟 v1.2 时代的旧 users 表（无 claimed_key/pin_hash），
 * openDatabase 必须幂等补列、建索引，且不影响既有数据（曾经上线时踩过：
 * 部分唯一索引写在 SCHEMA_SQL 首段导致老库打开即崩）。
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../server/db/connection'

function createLegacyDb(file: string): void {
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('mock','wechat')),
      provider_id TEXT NOT NULL,
      device_id TEXT,
      nickname TEXT NOT NULL,
      active_book_id TEXT,
      daily_new_limit INTEGER NOT NULL DEFAULT 20,
      last_mode TEXT NOT NULL DEFAULT 'card' CHECK (last_mode IN ('card','choice','spelling')),
      created_at TEXT NOT NULL,
      UNIQUE (provider, provider_id)
    );
    CREATE TABLE wordbooks (
      id TEXT PRIMARY KEY, stage TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL, sort INTEGER NOT NULL
    );
    INSERT INTO users (id, provider, provider_id, nickname, created_at)
      VALUES ('u_legacy', 'mock', 'legacy', '老用户', '2026-01-01');
  `)
  db.close()
}

describe('老库迁移（v1.2 → v1.3+）', () => {
  it('旧 schema 打开不崩：自动补列、建部分唯一索引，旧数据保留可认领', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wp-migrate-'))
    const file = path.join(dir, 'legacy.db')
    try {
      createLegacyDb(file)
      const db = openDatabase(file) // 旧库升级：SCHEMA_SQL + migrate 全程不应抛错

      const cols = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((r) => r.name)
      expect(cols).toContain('claimed_key')
      expect(cols).toContain('pin_hash')

      // 索引存在且生效：重复 claimed_key 被拒绝
      db.prepare(
        `INSERT INTO users (id, provider, provider_id, nickname, claimed_key, pin_hash, created_at)
         VALUES ('u_a', 'mock', 'a', 'A', 'moon', 'h', '2026-01-02')`,
      ).run()
      expect(() =>
        db.prepare(
          `INSERT INTO users (id, provider, provider_id, nickname, claimed_key, pin_hash, created_at)
           VALUES ('u_b', 'mock', 'b', 'B', 'moon', 'h', '2026-01-03')`,
        ).run(),
      ).toThrow()
      // 未认领用户（claimed_key NULL）可共存多条
      db.prepare(
        `INSERT INTO users (id, provider, provider_id, nickname, created_at)
         VALUES ('u_c', 'mock', 'c', 'C', '2026-01-04')`,
      ).run()

      // 旧数据无损
      const legacy = db.prepare("SELECT nickname FROM users WHERE id = 'u_legacy'").get() as { nickname: string }
      expect(legacy.nickname).toBe('老用户')

      // 幂等：再次 open 不抛错
      expect(() => openDatabase(file)).not.toThrow()
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

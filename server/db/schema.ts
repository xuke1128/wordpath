/** SQLite 建表 DDL（以字符串内联，避免构建产物需要额外拷贝 .sql 文件）。 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wordbooks (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL,
  headword TEXT NOT NULL,
  phonetic TEXT NOT NULL,
  translations TEXT NOT NULL,       -- JSON: [{pos, meaning}]
  example_en TEXT NOT NULL,
  example_cn TEXT NOT NULL,
  UNIQUE (book_id, headword)
);
CREATE INDEX IF NOT EXISTS idx_words_book_sort ON words (book_id, sort);

CREATE TABLE IF NOT EXISTS word_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'learning' CHECK (status IN ('learning','review')),
  ef REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  last_reviewed_at TEXT NOT NULL,
  UNIQUE (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user_book_due ON word_progress (user_id, book_id, due_date);

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  study_date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('card','choice','spelling')),
  is_new INTEGER NOT NULL,
  quality INTEGER NOT NULL,
  correct INTEGER,
  interval_after INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_user_date ON review_logs (user_id, study_date);

CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  study_date TEXT NOT NULL,
  new_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, study_date)
);
`

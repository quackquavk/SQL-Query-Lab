import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const SQLITE_PATH = process.env.SQLITE_PATH || 'data/auth.db';

// Ensure data directory exists
const dbDir = dirname(SQLITE_PATH);
if (dbDir && dbDir !== '.' && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database synchronously (better-sqlite3 is synchronous)
let _db = null;

export function getDb() {
  if (!_db) {
    _db = new BetterSqlite3(SQLITE_PATH);
    // Enable WAL mode for better concurrent read performance
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export async function initDb() {
  const db = getDb();

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE COLLATE NOCASE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      data TEXT DEFAULT '{}'
    )
  `);

  // Create indexes for performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  console.log('[db] Auth database initialized at', SQLITE_PATH);
}
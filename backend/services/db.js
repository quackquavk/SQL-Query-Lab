import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve SQLite path. Default resolves to the project-root data/ dir via __dirname:
// __dirname = backend/services/, so ../../data/auth.db = project-root/data/auth.db
// When SQLITE_PATH env var is set, it is resolved from __dirname (the backend dir).
// For absolute paths (starts with /), use as-is.
function resolveSqlitePath(envPath) {
  if (!envPath) {
    // Default: project-root/data/auth.db (cwd-independent)
    return resolve(__dirname, '..', '..', 'data', 'auth.db');
  }
  if (envPath.startsWith('/')) {
    return envPath; // absolute path — use as-is
  }
  // Relative path — resolve from backend directory
  return resolve(__dirname, envPath);
}

const SQLITE_PATH = resolveSqlitePath(process.env.SQLITE_PATH);

// Ensure data directory exists
const dbDir = dirname(SQLITE_PATH);
if (!existsSync(dbDir)) {
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

  // Create connections table (per-user encrypted SQL connection profiles)
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      server TEXT NOT NULL,
      database_name TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      username TEXT,
      password_encrypted TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id)`);

  console.log('[db] Auth database initialized at', SQLITE_PATH);
}
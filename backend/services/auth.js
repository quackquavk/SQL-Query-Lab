import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getDb } from './db.js';

const SESSION_TTL_DAYS = 7;
const DEFAULT_ROUNDS = 12;

/**
 * Hash a password using bcryptjs.
 * @param {string} password - Plain text password
 * @param {number} [rounds=12] - bcrypt rounds
 * @returns {Promise<string>} password hash
 */
export async function hashPassword(password, rounds = DEFAULT_ROUNDS) {
  return bcrypt.hash(password, rounds);
}

/**
 * Verify a password against a bcrypt hash.
 * @param {string} password - Plain text password
 * @param {string} hash - bcrypt hash
 * @returns {Promise<boolean>} true if match
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Create a new session for a user.
 * @param {number} userId - User ID
 * @returns {Promise<string>} session ID
 */
export async function createSession(userId) {
  const db = getDb();
  const sessionId = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + (SESSION_TTL_DAYS * 24 * 60 * 60);

  const stmt = db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, data) VALUES (?, ?, ?, ?)'
  );
  stmt.run(sessionId, userId, expiresAt, '{}');

  return sessionId;
}

/**
 * Validate a session and return session data if valid.
 * @param {string} sessionId - Session ID
 * @returns {Promise<{id: string, userId: number, data: object}|null>}
 */
export async function getSession(sessionId) {
  if (!sessionId) return null;

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(
    'SELECT id, user_id, expires_at, data FROM sessions WHERE id = ?'
  );
  const row = stmt.get(sessionId);

  if (!row) {
    console.log('[auth] Invalid or expired session: session not found');
    return null;
  }

  if (row.expires_at <= now) {
    // Clean up expired session with explicit transaction to ensure commit
    db.exec('BEGIN IMMEDIATE');
    try {
      const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?');
      deleteStmt.run(sessionId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    console.log('[auth] Invalid or expired session: session expired');
    return null;
  }

  let data = {};
  try {
    data = JSON.parse(row.data || '{}');
  } catch {
    data = {};
  }

  return {
    id: row.id,
    userId: row.user_id,
    data
  };
}

/**
 * Delete a session.
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionId) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  stmt.run(sessionId);
}

/**
 * Get a user by username (case-insensitive).
 * @param {string} username
 * @returns {Promise<{id: number, username: string, created_at: number}|null>} User without password_hash
 */
export async function getUserByUsername(username) {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT id, username, created_at FROM users WHERE username = ? COLLATE NOCASE'
  );
  const row = stmt.get(username);
  return row || null;
}

/**
 * Create a new user.
 * @param {string} username
 * @param {string} passwordHash - Pre-hashed password
 * @returns {Promise<number>} User ID
 */
export async function createUser(username, passwordHash) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  );
  const result = stmt.run(username, passwordHash);
  return result.lastInsertRowid;
}
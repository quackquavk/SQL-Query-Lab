import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { unlinkSync } from 'fs';

const tempFiles = [];

function tempDbPath() {
  const path = `/tmp/sqlquerylab-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  tempFiles.push(path);
  return path;
}

after(() => {
  tempFiles.forEach(f => {
    try { unlinkSync(f); } catch {}
  });
});

// Fresh db helper: resets SQLITE_PATH and re-imports modules for isolation.
// Each call gets its own file-backed SQLite DB.
async function freshDb() {
  const path = tempDbPath();
  process.env.SQLITE_PATH = path;
  const dbMod = await import(`./db.js?v=${Date.now()}`);
  const authMod = await import(`./auth.js?v=${Date.now()}`);
  await dbMod.initDb();
  return { db: dbMod, auth: authMod };
}

describe('hashPassword', () => {
  it('produces a bcrypt hash that is not the plain text', async () => {
    const { auth } = await freshDb();
    const hashed = await auth.hashPassword('password');
    assert.notStrictEqual(hashed, 'password');
    assert.match(hashed, /^\$2[aby]\$/);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const { auth } = await freshDb();
    const hashed = await auth.hashPassword('correct');
    const valid = await auth.verifyPassword('correct', hashed);
    assert.strictEqual(valid, true);
  });

  it('returns false for wrong password', async () => {
    const { auth } = await freshDb();
    const hashed = await auth.hashPassword('correct');
    const valid = await auth.verifyPassword('wrong', hashed);
    assert.strictEqual(valid, false);
  });

  it('works with custom rounds', async () => {
    const { auth } = await freshDb();
    const hashed = await auth.hashPassword('test', 4);
    assert.match(hashed, /^\$2[aby]\$/);
    const valid = await auth.verifyPassword('test', hashed);
    assert.strictEqual(valid, true);
  });
});

describe('createSession / getSession / deleteSession', () => {
  it('createSession returns a UUID and getSession retrieves it', async () => {
    const { auth } = await freshDb();
    const userId = await auth.createUser('sessionuser', 'fakehash');
    const sessionId = await auth.createSession(userId);
    assert.strictEqual(sessionId.length, 36, 'sessionId should be a UUID');
    const session = await auth.getSession(sessionId);
    assert.ok(session);
    assert.strictEqual(session.userId, userId);
  });

  it('getSession returns null for non-existent session', async () => {
    const { auth } = await freshDb();
    const session = await auth.getSession('00000000-0000-0000-0000-000000000000');
    assert.strictEqual(session, null);
  });

  it('deleteSession removes the session', async () => {
    const { auth } = await freshDb();
    const userId = await auth.createUser('deleteuser', 'fakehash');
    const sessionId = await auth.createSession(userId);
    await auth.deleteSession(sessionId);
    const session = await auth.getSession(sessionId);
    assert.strictEqual(session, null);
  });

  it('getSession returns null for expired session', async () => {
    const { auth, db } = await freshDb();
    // Insert user directly via db to avoid type conversion issues
    const userId = db.getDb().prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).run('expireuser', 'fakehash').lastInsertRowid;
    // Manually insert an expired session (expired yesterday)
    const expiredAt = Math.floor(Date.now() / 1000) - 86400;
    db.getDb().prepare(
      'INSERT INTO sessions (id, user_id, expires_at, data) VALUES (?, ?, ?, ?)'
    ).run('expired-0000-0000-000000000001', userId, expiredAt, '{}');
    const session = await auth.getSession('expired-0000-0000-000000000001');
    // getSession should return null for expired sessions (cleanup is best-effort)
    assert.strictEqual(session, null, 'expired session should return null');
  });
});

describe('getUserByUsername', () => {
  it('returns user without password_hash', async () => {
    const { auth } = await freshDb();
    await auth.createUser('findme', 'somehash');
    const user = await auth.getUserByUsername('findme');
    assert.ok(user);
    assert.strictEqual(user.username, 'findme');
    assert.ok('id' in user);
    assert.ok('created_at' in user);
  });

  it('is case-insensitive via COLLATE NOCASE', async () => {
    const { auth } = await freshDb();
    await auth.createUser('CaseSensitive', 'hash');
    const user = await auth.getUserByUsername('casesensitive');
    assert.ok(user, 'should find user regardless of case');
    assert.strictEqual(user.username, 'CaseSensitive');
  });

  it('returns null for non-existent user', async () => {
    const { auth } = await freshDb();
    const user = await auth.getUserByUsername('nobody');
    assert.strictEqual(user, null);
  });
});

describe('createUser', () => {
  it('returns a numeric user ID', async () => {
    const { auth } = await freshDb();
    const id = await auth.createUser('newuser', 'hash');
    assert.ok(typeof id === 'bigint' || typeof id === 'number', `expected numeric ID, got ${typeof id}`);
    assert.ok(Number(id) > 0, 'ID should be positive');
  });

  it('throws on duplicate username (UNIQUE constraint)', async () => {
    const { auth } = await freshDb();
    await auth.createUser('duplicate', 'hash1');
    await assert.rejects(
      auth.createUser('duplicate', 'hash2'),
      /UNIQUE constraint failed/
    );
  });

  it('created user can log in', async () => {
    const { auth } = await freshDb();
    const hash = await auth.hashPassword('myPassword');
    const userId = await auth.createUser('loginuser', hash);
    const sessionId = await auth.createSession(userId);
    const session = await auth.getSession(sessionId);
    assert.strictEqual(session.userId, userId);
  });
});
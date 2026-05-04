import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { unlinkSync } from 'fs';

const tempFiles = [];

function tempDbPath() {
  const path = `/tmp/sqlquerylab-conn-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  tempFiles.push(path);
  return path;
}

after(() => {
  tempFiles.forEach(f => {
    try { unlinkSync(f); } catch {}
  });
});

// Fresh db helper: gives each test its own file-backed SQLite DB.
async function freshDb() {
  const path = tempDbPath();
  process.env.SQLITE_PATH = path;
  const dbMod = await import(`./db.js?v=${Date.now()}`);
  await dbMod.initDb();
  return dbMod;
}

// Helper: create a user directly via the db module so tests are self-contained.
function createUser(db, username, passwordHash = 'fakehash') {
  return db.getDb().prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  ).run(username, passwordHash).lastInsertRowid;
}

// Helper: insert a connection row directly via db module.
function insertConnection(db, userId, name, server = 'localhost', database = 'mydb', authType = 'sql', username = 'sa', passwordEnc = 'encrypted') {
  return db.getDb().prepare(
    'INSERT INTO connections (user_id, name, server, database_name, auth_type, username, password_encrypted) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, name, server, database, authType, username, passwordEnc).lastInsertRowid;
}

describe('connections table: initDb() creates table', () => {
  it('connections table exists after initDb()', async () => {
    const dbMod = await freshDb();
    const cols = dbMod.getDb().pragma('table_info(connections)').map(r => r.name);
    assert.ok(cols.includes('id'), 'should have id column');
    assert.ok(cols.includes('user_id'), 'should have user_id column');
    assert.ok(cols.includes('name'), 'should have name column');
    assert.ok(cols.includes('server'), 'should have server column');
    assert.ok(cols.includes('database_name'), 'should have database_name column');
    assert.ok(cols.includes('auth_type'), 'should have auth_type column');
    assert.ok(cols.includes('username'), 'should have username column');
    assert.ok(cols.includes('password_encrypted'), 'should have password_encrypted column');
    assert.ok(cols.includes('created_at'), 'should have created_at column');
  });

  it('idx_connections_user index exists after initDb()', async () => {
    const dbMod = await freshDb();
    const indexes = dbMod.getDb().pragma('index_list(connections)');
    assert.ok(
      indexes.some(idx => idx.name === 'idx_connections_user'),
      'idx_connections_user index should exist'
    );
  });

  it('initDb() is idempotent — calling twice does not throw (IF NOT EXISTS)', async () => {
    const dbMod = await freshDb();
    // Force the module to reuse the existing db instance (skip lazy re-init)
    const colsBefore = dbMod.getDb().pragma('table_info(connections)').map(r => r.name);
    assert.ok(colsBefore.length > 0, 'connections table should exist after first init');
    // initDb() re-creates a new db instance — calling it again on a fresh temp file
    // is effectively a no-op thanks to IF NOT EXISTS on the table schema.
    // We re-import to get a fresh module that re-runs initDb() on the same temp path.
    const dbMod2 = await import(`./db.js?v=${Date.now()}`);
    await dbMod2.initDb();
    const colsAfter = dbMod2.getDb().pragma('table_info(connections)').map(r => r.name);
    assert.ok(colsAfter.length > 0, 'connections table should still exist after second init');
  });
});

describe('connections table: INSERT returns an id', () => {
  it('INSERT INTO connections returns a numeric lastInsertRowid', async () => {
    const dbMod = await freshDb();
    const userId = createUser(dbMod, 'user1');
    const id = insertConnection(dbMod, userId, 'My Azure SQL');
    assert.ok(typeof id === 'bigint' || typeof id === 'number', `expected numeric ID, got ${typeof id}`);
    assert.ok(Number(id) > 0, 'id should be positive');
  });

  it('INSERT stores all connection fields correctly', async () => {
    const dbMod = await freshDb();
    const userId = createUser(dbMod, 'user1');
    const id = insertConnection(dbMod, userId, 'Test Conn', 'db.example.net', 'Northwind', 'windows', 'DOMAIN\\user', 'enc_secret');
    const row = dbMod.getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id);
    assert.strictEqual(row.name, 'Test Conn');
    assert.strictEqual(row.server, 'db.example.net');
    assert.strictEqual(row.database_name, 'Northwind');
    assert.strictEqual(row.auth_type, 'windows');
    assert.strictEqual(row.username, 'DOMAIN\\user');
    assert.strictEqual(row.password_encrypted, 'enc_secret');
    assert.strictEqual(row.user_id, userId);
  });
});

describe('connections table: SELECT with user_id filter returns only that user\'s rows', () => {
  it('returns zero rows for a user with no connections', async () => {
    const dbMod = await freshDb();
    const userId = createUser(dbMod, 'user1');
    const rows = dbMod.getDb().prepare(
      'SELECT * FROM connections WHERE user_id = ?'
    ).all(userId);
    assert.strictEqual(rows.length, 0);
  });

  it('returns only user A\'s rows when filtering by user A\'s id', async () => {
    const dbMod = await freshDb();
    const userA = createUser(dbMod, 'userA');
    const userB = createUser(dbMod, 'userB');
    insertConnection(dbMod, userA, 'Conn A1');
    insertConnection(dbMod, userA, 'Conn A2');
    insertConnection(dbMod, userB, 'Conn B1');
    const rowsA = dbMod.getDb().prepare(
      'SELECT * FROM connections WHERE user_id = ?'
    ).all(userA);
    assert.strictEqual(rowsA.length, 2);
    assert.ok(rowsA.every(r => r.name.startsWith('Conn A')));
    const rowsB = dbMod.getDb().prepare(
      'SELECT * FROM connections WHERE user_id = ?'
    ).all(userB);
    assert.strictEqual(rowsB.length, 1);
    assert.strictEqual(rowsB[0].name, 'Conn B1');
  });
});

describe('connections table: DELETE with user_id filter only removes that user\'s rows', () => {
  it('DELETE FROM connections WHERE user_id = ? removes only that user\'s rows', async () => {
    const dbMod = await freshDb();
    const userA = createUser(dbMod, 'userA');
    const userB = createUser(dbMod, 'userB');
    insertConnection(dbMod, userA, 'Conn A1');
    insertConnection(dbMod, userA, 'Conn A2');
    insertConnection(dbMod, userB, 'Conn B1');
    const deleted = dbMod.getDb().prepare(
      'DELETE FROM connections WHERE user_id = ?'
    ).run(userA);
    const remaining = dbMod.getDb().prepare('SELECT * FROM connections').all();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].name, 'Conn B1');
    assert.strictEqual(remaining[0].user_id, userB);
  });
});

describe('connections table: foreign key ON DELETE CASCADE', () => {
  it('deleting a user cascades to remove their connections', async () => {
    const dbMod = await freshDb();
    const userId = createUser(dbMod, 'cascadeuser');
    insertConnection(dbMod, userId, 'Conn C1');
    insertConnection(dbMod, userId, 'Conn C2');
    const countBefore = dbMod.getDb().prepare(
      'SELECT COUNT(*) as c FROM connections WHERE user_id = ?'
    ).get(userId).c;
    assert.strictEqual(countBefore, 2, 'should have 2 connections before delete');
    dbMod.getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
    const countAfter = dbMod.getDb().prepare(
      'SELECT COUNT(*) as c FROM connections WHERE user_id = ?'
    ).get(userId).c;
    assert.strictEqual(countAfter, 0, 'connections should be cascade-deleted with user');
  });

  it('other users\' connections are unaffected when one user is deleted', async () => {
    const dbMod = await freshDb();
    const userA = createUser(dbMod, 'userA');
    const userB = createUser(dbMod, 'userB');
    insertConnection(dbMod, userA, 'Conn A1');
    insertConnection(dbMod, userB, 'Conn B1');
    dbMod.getDb().prepare('DELETE FROM users WHERE id = ?').run(userA);
    const userBConns = dbMod.getDb().prepare(
      'SELECT * FROM connections WHERE user_id = ?'
    ).all(userB);
    assert.strictEqual(userBConns.length, 1);
    assert.strictEqual(userBConns[0].name, 'Conn B1');
  });
});

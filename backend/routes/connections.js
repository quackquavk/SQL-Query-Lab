import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { encryptConnection, decryptConnection, decryptConnectionServer } from '../services/crypto.js';
import { testConnection } from '../services/sqlServer.js';
import { getDb } from '../services/db.js';

const connections = new Hono();

function decodeError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || String(err);
  if (msg.includes('ECONNREFUSED')) return 'Cannot connect to server - check server address and port';
  if (msg.includes('ELOGIN') || msg.includes('login failed')) return 'Login failed - check username and password';
  if (msg.includes('ETIMEOUT') || msg.includes('timeout')) return 'Connection timeout - server not responding';
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) return 'Server not found - check server address';
  return msg;
}

connections.post('/', async (ctx) => {
  try {
    const userId = ctx.get('userId');
    const { name, server, database, authType, credentials } = await ctx.req.json();

    if (!name || !server || !authType) {
      return ctx.json({ success: false, error: 'Missing required fields' }, 400);
    }

    const masterPassword = process.env.MASTER_PASSWORD;
    if (!masterPassword) {
      console.error('[crypto] MASTER_PASSWORD env var is not set — server-side encryption unavailable');
      return ctx.json({ success: false, error: 'Server not configured with MASTER_PASSWORD' }, 500);
    }

    const connData = { server, database, authType, credentials };
    const encryptedBlob = await encryptConnection(connData, masterPassword);

    const id = randomUUID();
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO connections (id, user_id, name, server, database_name, auth_type, username, password_encrypted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      id,
      userId,
      name,
      server,
      database || '',
      authType,
      credentials?.username || null,
      JSON.stringify(encryptedBlob)
    );

    console.log(`[connections] Connection saved: id=${id} userId=${userId} name=${name}`);

    return ctx.json({ id, name });
  } catch (err) {
    console.error('[connections] POST / error:', err.message);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

connections.get('/', async (ctx) => {
  try {
    const userId = ctx.get('userId');
    const db = getDb();
    const stmt = db.prepare(
      'SELECT id, name, created_at FROM connections WHERE user_id = ? ORDER BY created_at DESC'
    );
    const list = stmt.all(userId);
    console.log(`[connections] List connections: userId=${userId} count=${list.length}`);
    return ctx.json(list);
  } catch (err) {
    console.error('[connections] GET / error:', err.message);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

connections.get('/:id', async (ctx) => {
  try {
    const userId = ctx.get('userId');
    const { id } = ctx.req.param();
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?');
    const conn = stmt.get(id, userId);

    if (!conn) {
      // Check if the connection id exists but belongs to a different user
      const existsStmt = db.prepare('SELECT id FROM connections WHERE id = ?');
      const exists = existsStmt.get(id);
      if (exists) {
        console.log(`[connections] GET /:id access denied: id=${id} userId=${userId}`);
        return ctx.json({ success: false, error: 'Connection not found' }, 404);
      }
      return ctx.json({ success: false, error: 'Connection not found' }, 404);
    }

    const encryptedBlob = JSON.parse(conn.password_encrypted || '{}');
    const decrypted = await decryptConnectionServer(encryptedBlob);
    if (!decrypted) {
      console.error(`[connections] GET /:id decryption failed: id=${id} userId=${userId}`);
      return ctx.json({ success: false, error: 'Decryption failed — check MASTER_PASSWORD' }, 400);
    }

    console.log(`[connections] Get connection: id=${id} userId=${userId} name=${conn.name}`);

    return ctx.json({
      id: conn.id,
      name: conn.name,
      server: decrypted.server,
      database: decrypted.database,
      authType: decrypted.authType,
      credentials: decrypted.credentials
    });
  } catch (err) {
    console.error('[connections] GET /:id error:', err.message);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

connections.delete('/:id', async (ctx) => {
  try {
    const userId = ctx.get('userId');
    const { id } = ctx.req.param();
    const db = getDb();
    // DELETE with both user_id and id conditions — only deletes if owned by this user
    const stmt = db.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);

    if (result.changes === 0) {
      console.log(`[connections] DELETE /:id not found: id=${id} userId=${userId}`);
      return ctx.json({ success: false, error: 'Connection not found' }, 404);
    }

    console.log(`[connections] Delete connection: id=${id} userId=${userId}`);
    return ctx.json({ success: true });
  } catch (err) {
    console.error('[connections] DELETE /:id error:', err.message);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

connections.post('/test', async (ctx) => {
  try {
    const { server, database, authType, credentials } = await ctx.req.json();

    if (!server || !authType) {
      return ctx.json({ success: false, error: 'Server and auth type required' }, 400);
    }

    const result = await testConnection({ server, database, authType, credentials });

    if (result.serverVersion) {
      return ctx.json({ success: true, serverVersion: result.serverVersion });
    } else {
      return ctx.json({ success: false, error: result.error || 'Connection failed', code: result.code }, 400);
    }
  } catch (err) {
    return ctx.json({ success: false, error: decodeError(err) }, 400);
  }
});

connections.post('/decrypt/:id', async (ctx) => {
  try {
    const userId = ctx.get('userId');
    const { id } = ctx.req.param();
    const { masterPassword } = await ctx.req.json();

    const db = getDb();
    const stmt = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?');
    const conn = stmt.get(id, userId);

    if (!conn) {
      return ctx.json({ success: false, error: 'Connection not found' }, 404);
    }

    const encryptedBlob = JSON.parse(conn.password_encrypted || '{}');
    const decrypted = await decryptConnection(encryptedBlob, masterPassword);
    return ctx.json({ success: true, credentials: decrypted });
  } catch (err) {
    return ctx.json({ success: false, error: 'Decryption failed' }, 400);
  }
});

export default connections;

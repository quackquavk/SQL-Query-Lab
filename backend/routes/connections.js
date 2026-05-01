import { Hono } from 'hono';
import { encryptConnection, decryptConnection, decryptConnectionServer } from '../services/crypto.js';
import { testConnection } from '../services/sqlServer.js';

const connections = new Hono();

const connectionsStore = new Map();
let nextId = 1;

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
    const { name, server, database, authType, credentials } = await ctx.req.json();

    if (!name || !server || !authType) {
      return ctx.json({ success: false, error: 'Missing required fields' }, 400);
    }

    const masterPassword = process.env.MASTER_PASSWORD;
    if (!masterPassword) {
      return ctx.json({ success: false, error: 'Server not configured with MASTER_PASSWORD' }, 500);
    }

    const connData = { server, database, authType, credentials };
    const encryptedBlob = await encryptConnection(connData, masterPassword);

    const id = String(nextId++);
    connectionsStore.set(id, { id, name, encryptedBlob, createdAt: new Date().toISOString() });

    return ctx.json({ id, name });
  } catch (err) {
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

connections.get('/', async (ctx) => {
  const userId = ctx.req.header('X-User-Id') || 'anonymous';
  const list = [];
  for (const [id, conn] of connectionsStore) {
    list.push({ id, name: conn.name });
  }
  return ctx.json(list);
});

connections.get('/:id', async (ctx) => {
  try {
    const { id } = ctx.req.param();
    const conn = connectionsStore.get(id);
    if (!conn) {
      return ctx.json({ success: false, error: 'Connection not found' }, 404);
    }

    const decrypted = await decryptConnectionServer(conn.encryptedBlob);
    if (!decrypted) {
      return ctx.json({ success: false, error: 'Decryption failed — check MASTER_PASSWORD' }, 400);
    }

    return ctx.json({ success: true, id: conn.id, name: conn.name, ...decrypted });
  } catch (err) {
    console.error('[connections] GET /:id error:', err.message);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

connections.delete('/:id', async (ctx) => {
  const { id } = ctx.req.param();
  if (connectionsStore.has(id)) {
    connectionsStore.delete(id);
    return ctx.json({ success: true });
  }
  return ctx.json({ success: false, error: 'Connection not found' }, 404);
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
    const { id } = ctx.req.param();
    const { masterPassword } = await ctx.req.json();

    const conn = connectionsStore.get(id);
    if (!conn) {
      return ctx.json({ success: false, error: 'Connection not found' }, 404);
    }

    const decrypted = await decryptConnection(conn.encryptedBlob, masterPassword);
    return ctx.json({ success: true, credentials: decrypted });
  } catch (err) {
    return ctx.json({ success: false, error: 'Decryption failed' }, 400);
  }
});

export default connections;
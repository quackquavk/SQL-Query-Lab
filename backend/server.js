import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { upgradeWebSocket } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer } from 'ws';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parse as parseCookie } from 'cookie';
import { randomUUID } from 'crypto';

import { initDb, getDb } from './services/db.js';
import { requireAuth } from './middleware/auth/index.js';
import { getSession } from './services/auth.js';
import authRoutes from './routes/auth.js';
import { handleQueryWebSocket } from './routes/query.ws.js';
import { handleSqlAgentWebSocket, getSqlAgentStatus } from './routes/sqlAgent.js';
// Inline auth helper (uses existing getSession from auth.js)
async function requireAuthInline(ctx) {
  const cookies = parseCookie(ctx.req.header('Cookie') || '');
  const sessionId = cookies.session;
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  return session ? session.userId : null;
}
import schemaRoute from './routes/schema.js';
import executionPlanRoute from './routes/executionPlan.js';
import ddlRoute from './routes/ddl.js';
import spRoute from './routes/storedProcedures.js';
import validateRoute from './routes/validateTsql.js';
import optimizeRoute from './routes/optimize.js';
import sqlAgentJobs from './routes/sqlAgentJobs.js';
import minimaxMcp from './services/minimaxMcp.js';
import backupRestore from './routes/backupRestore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve frontend files relative to the project root (parent of backend/)
const FRONTEND_ROOT = resolve(__dirname, '..');

const app = new Hono();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';

app.use('*', cors({
  origin: ALLOWED_ORIGIN,
  credentials: true
}));

app.use('*', logger());

// Serve frontend static files (only non-API routes)
app.use('/*', serveStatic({ root: FRONTEND_ROOT, rewriteRequestPath: (path) => {
  // If path is just / or /index.html, serve index.html
  if (path === '/' || path === '') return '/index.html';
  return path;
} }));

// ── Auth & Config ────────────────────────────────────────────────────────────
// Validate SESSION_SECRET in production (optional in dev)
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  console.warn('[server] Warning: SESSION_SECRET not set — using insecure default for development only');
}

// Initialize auth database before serving any routes
await initDb();
console.log('[server] Auth database ready');

// ── Route registration ─────────────────────────────────────────────────────────
app.get('/health', (ctx) => ctx.json({ status: 'ok' }));

// Auth routes — only /me requires authentication
app.route('/api/auth', authRoutes);
// Protect /api/auth/me — requires active session (login/register are public)
app.use('/api/auth/me', requireAuth());


// Connections routes — flat handler pattern (no sub-app) for proper auth propagation
app.post('/api/connections', async (ctx) => {
  const userId = await requireAuthInline(ctx);
  if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);
  const { name, server, database, authType, credentials } = await ctx.req.json();
  if (!name || !server || !authType) return ctx.json({ success: false, error: 'Missing required fields' }, 400);
  const masterPassword = process.env.MASTER_PASSWORD;
  if (!masterPassword) return ctx.json({ success: false, error: 'Server not configured with MASTER_PASSWORD' }, 500);
  const connData = { server, database, authType, credentials };
  const { encryptConnection } = await import('./services/crypto.js');
  const encryptedBlob = await encryptConnection(connData, masterPassword);
  const id = randomUUID();
  const db = getDb();
  db.prepare('INSERT INTO connections (id, user_id, name, server, database_name, auth_type, username, password_encrypted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, userId, name, server, database || '', authType, credentials?.username || null, JSON.stringify(encryptedBlob));
  console.log(`[connections] Connection saved: id=${id} userId=${userId} name=${name}`);
  return ctx.json({ id, name });
});

app.get('/api/connections', async (ctx) => {
  const userId = await requireAuthInline(ctx);
  if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);
  const db = getDb();
  const list = db.prepare('SELECT id, name, created_at FROM connections WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  console.log(`[connections] List connections: userId=${userId} count=${list.length}`);
  return ctx.json(list);
});

app.get('/api/connections/:id', async (ctx) => {
  const userId = await requireAuthInline(ctx);
  if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);
  const { id } = ctx.req.param();
  const db = getDb();
  const conn = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(id, userId);
  if (!conn) {
    const exists = db.prepare('SELECT id FROM connections WHERE id = ?').get(id);
    if (exists) { console.log(`[connections] GET /:id access denied: id=${id} userId=${userId}`); return ctx.json({ success: false, error: 'Connection not found' }, 404); }
    return ctx.json({ success: false, error: 'Connection not found' }, 404);
  }
  const encryptedBlob = JSON.parse(conn.password_encrypted || '{}');
  const { decryptConnectionServer } = await import('./services/crypto.js');
  const decrypted = await decryptConnectionServer(encryptedBlob);
  if (!decrypted) return ctx.json({ success: false, error: 'Decryption failed' }, 400);
  console.log(`[connections] Get connection: id=${id} userId=${userId} name=${conn.name}`);
  return ctx.json({ id: conn.id, name: conn.name, server: decrypted.server, database: decrypted.database, authType: decrypted.authType, credentials: decrypted.credentials });
});

app.delete('/api/connections/:id', async (ctx) => {
  const userId = await requireAuthInline(ctx);
  if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);
  const { id } = ctx.req.param();
  const db = getDb();
  const result = db.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) { console.log(`[connections] DELETE /:id not found: id=${id} userId=${userId}`); return ctx.json({ success: false, error: 'Connection not found' }, 404); }
  console.log(`[connections] Delete connection: id=${id} userId=${userId}`);
  return ctx.json({ success: true });
});
app.use('/api/schema', requireAuth());
app.route('/api/schema', schemaRoute);
app.use('/api/execution-plan', requireAuth());
app.route('/api/execution-plan', executionPlanRoute);
app.use('/api/execute-ddl', requireAuth());
app.route('/api/execute-ddl', ddlRoute);
app.use('/api/stored-procedure', requireAuth());
app.route('/api/stored-procedure', spRoute);
app.use('/api/validate-tsql', requireAuth());
app.route('/api/validate-tsql', validateRoute);
app.use('/api/optimize', requireAuth());
app.route('/api/optimize', optimizeRoute);
app.use('/api/sql-agent', requireAuth());
app.route('/api/sql-agent', sqlAgentJobs);

// GET /api/sql-agent/status — MCP availability (auth-protected, no sub-app)
app.get('/api/sql-agent/status', async (ctx) => {
  const userId = await requireAuthInline(ctx);
  if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);
  console.log(`[sql-agent] Status check userId=${userId} mcpAvailable=${minimaxMcp.isAvailable()}`);
  return ctx.json({ mcpAvailable: minimaxMcp.isAvailable() });
});
app.use('/api/backup', requireAuth());
app.route('/api/backup', backupRestore);
app.use('/api/restore', requireAuth());
app.route('/api/restore', backupRestore);

const port = process.env.PORT || 3000;

// serve() returns an http.Server that we can attach WebSocket handling to
const server = serve({
  fetch: app.fetch,
  port
});

// ── WebSocket server (standalone, co-located on the same port) ─────────────
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  // Parse session cookie from request headers for authentication
  let userId = 'anonymous';
  const cookies = parseCookie(request.headers.cookie || '');
  const sessionId = cookies.session;

  if (sessionId) {
    // getSession in auth.js uses better-sqlite3 synchronously
    const session = getSession(sessionId);
    if (session) {
      userId = String(session.userId);
      console.log(`[ws] Authenticated connection: userId=${userId} path=${url.pathname}`);
    } else {
      console.log('[auth] WebSocket auth: invalid session cookie — using anonymous');
    }
  }

  ws.on('error', (err) => {
    console.error(`[ws] WebSocket error (${url.pathname}): ${err.message}`);
  });

  if (url.pathname === '/api/sql-agent/chat') {
    // SQL Agent WebSocket — handle with sqlAgent handler
    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg);
        await handleSqlAgentWebSocket(ws, data, userId);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
  } else if (url.pathname === '/api/backup/progress') {
    // Backup progress WebSocket — echo back progress messages
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'backup_progress') {
          ws.send(JSON.stringify({
            type: 'progress',
            percent: data.percent || 0,
            currentFile: data.currentFile || '',
            elapsed: data.elapsed || 0
          }));
        }
      } catch (err) {
        // ignore malformed messages
      }
    });
  } else {
    // Default: query WebSocket
    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg);
        await handleQueryWebSocket(ws, data, userId);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
  }
});

// Wire the http.Server upgrade event to the WebSocketServer.
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/query' || url.pathname === '/api/backup/progress' || url.pathname === '/api/sql-agent/chat') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

console.log(`Backend server running on port ${port}`);

export default { port };
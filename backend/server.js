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

import { initDb } from './services/db.js';
import { requireAuth } from './middleware/auth/index.js';
import { getSession } from './services/auth.js';
import authRoutes from './routes/auth.js';
import { handleQueryWebSocket } from './routes/query.ws.js';
import connections from './routes/connections.js';
import schemaRoute from './routes/schema.js';
import executionPlanRoute from './routes/executionPlan.js';
import ddlRoute from './routes/ddl.js';
import spRoute from './routes/storedProcedures.js';
import validateRoute from './routes/validateTsql.js';
import optimizeRoute from './routes/optimize.js';
import sqlAgentJobs from './routes/sqlAgentJobs.js';
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


// Protected routes — use app.route() after app.use() for proper middleware chaining
app.use('/api/connections', requireAuth());
app.route('/api/connections', connections);
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
      console.log(`[query.ws] Authenticated connection: userId=${userId}`);
    } else {
      console.log('[auth] WebSocket auth: invalid session cookie — using anonymous');
    }
  }

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      await handleQueryWebSocket(ws, data, userId);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('error', (err) => {
    console.error(`[query.ws] WebSocket error: ${err.message}`);
  });

  if (url.pathname === '/api/backup/progress') {
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
  }
});

// Wire the http.Server upgrade event to the WebSocketServer.
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/query' || url.pathname === '/api/backup/progress') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

console.log(`Backend server running on port ${port}`);

export default { port };
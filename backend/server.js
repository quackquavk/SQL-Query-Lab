import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';
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
import { serve } from '@hono/node-server';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { WebSocketServer } from 'ws';

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

app.get('/health', (ctx) => ctx.json({ status: 'ok' }));

app.route('/api/connections', connections);
app.route('/api/schema', schemaRoute);
app.route('/api/execution-plan', executionPlanRoute);
app.route('/api/execute-ddl', ddlRoute);
app.route('/api/stored-procedure', spRoute);
app.route('/api/validate-tsql', validateRoute);
app.route('/api/optimize', optimizeRoute);
app.route('/api/sql-agent', sqlAgentJobs);
app.route('/api/backup', backupRestore);
app.route('/api/restore', backupRestore);

const port = process.env.PORT || 3000;

// serve() returns an http.Server that we can attach WebSocket handling to
const server = serve({
  fetch: app.fetch,
  port
});

// ── WebSocket server (standalone, co-located on the same port) ─────────────
// We use the `ws` library directly for /api/query.
// wss.handleUpgrade() is the correct way to handle WebSocket upgrades
// co-located with an existing HTTP server.
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = request.headers['x-user-id'] || 'anonymous';

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
// This is the correct pattern for co-locating ws.Server with an existing HTTP server.
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
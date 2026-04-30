import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket } from '@hono/node-server';
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

const app = new Hono();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';

app.use('*', cors({
  origin: ALLOWED_ORIGIN,
  credentials: true
}));

app.use('*', logger());

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

const server = serve({
  fetch: app.fetch,
  port,
  websocket: {
    upgradeWebSocket,
  }
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/query') {
    const userId = request.headers['x-user-id'] || 'anonymous';

    socket.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg);
        await handleQueryWebSocket(socket, data, userId);
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
  }
});

console.log(`Backend server running on port ${port}`);

export default { port };
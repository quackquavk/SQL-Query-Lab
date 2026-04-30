import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket } from '@hono/node-ws';
import connections from './routes/connections.js';
import { handleQueryWebSocket } from './routes/query.ws.js';

const app = new Hono();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';

app.use('*', cors({
  origin: ALLOWED_ORIGIN,
  credentials: true
}));

app.use('*', logger());

app.get('/health', (ctx) => ctx.json({ status: 'ok' }));

app.route('/api/connections', connections);

app.ws('/api/query', async (ctx) => {
  const { socket } = ctx;
  const userId = ctx.req.header('X-User-Id') || 'anonymous';

  socket.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      await handleQueryWebSocket(socket, data, userId);
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
});

const port = process.env.PORT || 3000;
console.log(`Backend server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch
};
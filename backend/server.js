import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket } from '@hono/node-server';
import 'dotenv/config';
import { handleQueryWebSocket } from './routes/query.ws.js';
import connections from './routes/connections.js';
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
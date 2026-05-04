import { Hono } from 'hono';
import { getDb } from '../services/db.js';

const connections = new Hono();

connections.get('/:id', async (ctx) => {
  const rawUserId = ctx.get('userId');
  const userId = typeof rawUserId !== 'undefined' ? rawUserId : 'MISSING';
  const { id } = ctx.req.param();
  console.log(`[DEBUG GET /:id] userId=${userId} id=${id}`);
  console.log(`[DEBUG GET /:id] ctx.state keys:`, Object.keys(ctx.state));
  const cookies = ctx.req.header('cookie') || '';
  console.log(`[DEBUG GET /:id] cookie: ${cookies.substring(0, 80)}`);
  
  const { getSession } = await import('../services/auth.js');
  const sessionId = cookies.split('; ').find(c => c.startsWith('session='))?.split('=')[1];
  if (sessionId) {
    const session = await getSession(sessionId);
    console.log(`[DEBUG GET /:id] session=${JSON.stringify(session)}`);
  }
  
  return ctx.json({ debug: true, userId, id });
});

export default connections;

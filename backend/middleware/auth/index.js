import { parse } from 'cookie';
import { getSession } from '../services/auth.js';

/**
 * Hono middleware that requires an authenticated session.
 * Reads the `session` cookie and validates it against the SQLite session store.
 * Sets ctx.set('userId') and ctx.set('sessionId') on success.
 * @returns {import('hono').MiddlewareHandler}
 */
export function requireAuth() {
  return async (ctx, next) => {
    const cookies = parse(ctx.req.header('Cookie') || '');
    const sessionId = cookies.session;

    if (!sessionId) {
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    const session = await getSession(sessionId);

    if (!session) {
      console.log('[auth] Invalid or expired session');
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    ctx.set('userId', session.userId);
    ctx.set('sessionId', session.id);

    await next();
  };
}
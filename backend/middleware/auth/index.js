import { parse } from 'cookie';
import { getSession } from '../../services/auth.js';

export function requireAuth() {
  return async (ctx, next) => {
    console.log('[requireAuth] called for path:', ctx.req.path);
    const cookies = parse(ctx.req.header('Cookie') || '');
    console.log('[requireAuth] cookies:', JSON.stringify(cookies));
    const sessionId = cookies.session;

    if (!sessionId) {
      console.log('[requireAuth] no session — 401');
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    const session = await getSession(sessionId);
    console.log('[requireAuth] session:', JSON.stringify(session));

    if (!session) {
      console.log('[auth] Invalid or expired session');
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    ctx.set('userId', session.userId);
    ctx.set('sessionId', session.id);
    console.log('[requireAuth] set userId:', session.userId);
    await next();
    console.log('[requireAuth] next() completed');
  };
}
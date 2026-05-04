import { parse } from 'cookie';
import { getSession } from '../../services/auth.js';

export function requireAuth() {
  return async (ctx, next) => {
    const cookies = parse(ctx.req.header('Cookie') || '');
    console.log('[DEBUG requireAuth] cookies:', JSON.stringify(cookies));
    const sessionId = cookies.session;
    console.log('[DEBUG requireAuth] sessionId:', sessionId);

    if (!sessionId) {
      console.log('[DEBUG requireAuth] no session cookie');
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    const session = await getSession(sessionId);
    console.log('[DEBUG requireAuth] session:', JSON.stringify(session));

    if (!session) {
      console.log('[DEBUG requireAuth] invalid session');
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    ctx.set('userId', session.userId);
    console.log('[DEBUG requireAuth] set userId:', session.userId);
    await next();
  };
}

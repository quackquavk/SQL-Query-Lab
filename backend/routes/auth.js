import { Hono } from 'hono';
import { hashPassword, verifyPassword, createSession, deleteSession, getUserByUsername, createUser } from '../services/auth.js';

const auth = new Hono();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Build a Set-Cookie header value for the session cookie.
 */
function buildSetCookieHeader(sessionId) {
  const secure = isProduction ? '; Secure' : '';
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * Build a Set-Cookie header to clear the session cookie.
 */
function clearSessionCookie() {
  return 'session=; Path=/; HttpOnly; Max-Age=0';
}

// POST /register — create a new user account
auth.post('/register', async (ctx) => {
  try {
    const { username, password } = await ctx.req.json();

    if (!username || !password) {
      return ctx.json({ error: 'username and password are required' }, 400);
    }

    if (typeof username !== 'string' || username.trim().length === 0) {
      return ctx.json({ error: 'username cannot be empty' }, 400);
    }

    if (password.length < 4) {
      return ctx.json({ error: 'password must be at least 4 characters' }, 400);
    }

    const passwordHash = await hashPassword(password);
    const userId = await createUser(username.trim(), passwordHash);

    console.log(`[auth] User registered: ${username}`);

    return ctx.json({ id: userId, username: username.trim() }, 201);
  } catch (err) {
    // Duplicate username (SQLite constraint violation)
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return ctx.json({ error: 'Username already taken' }, 409);
    }
    console.error('[auth] Registration error:', err.message);
    return ctx.json({ error: 'Registration failed' }, 500);
  }
});

// POST /login — authenticate and create a session
auth.post('/login', async (ctx) => {
  try {
    const { username, password } = await ctx.req.json();

    if (!username || !password) {
      return ctx.json({ error: 'username and password are required' }, 400);
    }

    const user = await getUserByUsername(username);

    if (!user) {
      // Generic message to avoid username enumeration
      return ctx.json({ error: 'Invalid username or password' }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      return ctx.json({ error: 'Invalid username or password' }, 401);
    }

    const sessionId = await createSession(user.id);

    console.log(`[auth] User logged in: ${username} (userId=${user.id})`);

    ctx.header('Set-Cookie', buildSetCookieHeader(sessionId));

    return ctx.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    return ctx.json({ error: 'Login failed' }, 500);
  }
});

// POST /logout — invalidate the session
auth.post('/logout', async (ctx) => {
  try {
    const cookies = (ctx.req.header('Cookie') || '').split('; ')
      .reduce((acc, part) => {
        const [key, ...valParts] = part.split('=');
        if (key) acc[key.trim()] = valParts.join('=');
        return acc;
      }, {});
    const sessionId = cookies.session;

    if (sessionId) {
      await deleteSession(sessionId);
      console.log('[auth] Session invalidated');
    }

    ctx.header('Set-Cookie', clearSessionCookie());

    return ctx.json({ success: true });
  } catch (err) {
    console.error('[auth] Logout error:', err.message);
    // Still clear the cookie even if deletion fails
    ctx.header('Set-Cookie', clearSessionCookie());
    return ctx.json({ success: true });
  }
});

// GET /me — return the authenticated user
auth.get('/me', async (ctx) => {
  const userId = ctx.get('userId');

  if (!userId) {
    console.log('[auth] Unauthorized: /api/auth/me — no session');
    return ctx.json({ error: 'Unauthorized' }, 401);
  }

  // userId was set by requireAuth middleware — look up the user directly by ID
  const { getDb } = await import('../services/db.js');
  const db = getDb();
  const stmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
  const user = stmt.get(userId);

  if (!user) {
    return ctx.json({ error: 'User not found' }, 404);
  }

  return ctx.json({ id: user.id, username: user.username });
});

export default auth;
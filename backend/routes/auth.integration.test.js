/**
 * Integration tests for auth routes.
 * Run with: node --test backend/routes/auth.integration.test.js
 *
 * Tests: register → login → session cookie → GET /api/auth/me → 200.
 * Tests: protected routes return 401 without a valid session.
 *
 * Pattern: single server instance, sequential tests with unique usernames.
 * No cache-busting needed since initDb() is called once and tests use unique IDs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { unlinkSync } from 'fs';

// Must set env BEFORE any module imports so module-level singletons initialize correctly
const SQLITE_PATH = `/tmp/sqlquerylab-auth-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-for-integration-tests';
process.env.SQLITE_PATH = SQLITE_PATH;
process.env.MASTER_PASSWORD = 'test-master-password';

// Top-level imports — after env vars are set
import { Hono } from 'hono';
import { initDb } from '../services/db.js';
import { requireAuth } from '../middleware/auth/index.js';
import authRoutes from '../routes/auth.js';
import { serve } from '@hono/node-server';

let server;

async function makeRequest(method, path, body, headers = {}) {
  const port = server.address().port;
  const url = `http://localhost:${port}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { data = null; }
  }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

function extractSessionCookie(setCookie) {
  if (!setCookie) return null;
  const match = setCookie.match(/session=([^;]+)/);
  return match ? `session=${match[1]}` : null;
}

// Register + login helper using unique username so state never leaks across tests
async function registerAndLogin(prefix, password) {
  const username = `${prefix}_${Date.now()}`;
  await makeRequest('POST', '/api/auth/register', { username, password });
  const res = await makeRequest('POST', '/api/auth/login', { username, password });
  return extractSessionCookie(res.setCookie);
}

describe('Auth routes integration', { concurrency: false }, () => {
  before(async () => {
    await initDb();
    const app = new Hono();
    app.get('/health', (ctx) => ctx.json({ status: 'ok' }));
    app.route('/api/auth', authRoutes);

    // Mock connections route for protected endpoint tests
    const mockConnections = new Hono();
    mockConnections.delete('/:id', (ctx) => {
      const userId = ctx.get('userId');
      if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);
      return ctx.json({ success: true });
    });
    app.use('/api/connections', requireAuth());
    app.route('/api/connections', mockConnections);

    server = serve({ fetch: app.fetch, port: 0 });
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { unlinkSync(SQLITE_PATH); } catch {}
  });

  // ── POST /api/auth/register ─────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('returns 201 with id and username on success', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'testuser_' + Date.now(),
        password: 'securepass123'
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.id);
      assert.ok(res.data.username);
    });

    it('returns 400 when username is missing', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        password: 'securepass123'
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data.error);
    });

    it('returns 400 when password is too short', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'shortpw_' + Date.now(),
        password: 'ab'
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data.error.includes('4 characters'));
    });

    it('returns 409 when username already exists', async () => {
      const username = 'dupuser_' + Date.now();
      await makeRequest('POST', '/api/auth/register', { username, password: 'securepass123' });
      const res = await makeRequest('POST', '/api/auth/register', {
        username, password: 'anotherpass'
      });
      assert.strictEqual(res.status, 409);
      assert.ok(res.data.error.includes('taken'));
    });
  });

  // ── POST /api/auth/login ─────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('returns 200 with Set-Cookie header on valid credentials', async () => {
      const username = 'logintest_' + Date.now();
      await makeRequest('POST', '/api/auth/register', { username, password: 'validpassword' });
      const res = await makeRequest('POST', '/api/auth/login', { username, password: 'validpassword' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.id);
      assert.ok(res.data.username);
      assert.ok(res.setCookie);
      assert.ok(res.setCookie.includes('session='));
    });

    it('returns 401 for invalid password', async () => {
      const username = 'wrongpw_' + Date.now();
      await makeRequest('POST', '/api/auth/register', { username, password: 'correctpassword' });
      const res = await makeRequest('POST', '/api/auth/login', { username, password: 'wrongpassword' });
      assert.strictEqual(res.status, 401);
    });

    it('returns 401 for non-existent username', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'nobody_' + Date.now(),
        password: 'anypassword'
      });
      assert.strictEqual(res.status, 401);
    });

    it('returns 400 when username is missing', async () => {
      const res = await makeRequest('POST', '/api/auth/login', { password: 'somepass' });
      assert.strictEqual(res.status, 400);
    });
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('returns 200 with user info when session cookie is valid', async () => {
      const username = 'me_test_' + Date.now();
      const sessionCookie = await registerAndLogin('metest', 'testpass123');
      assert.ok(sessionCookie);
      const res = await makeRequest('GET', '/api/auth/me', null, { Cookie: sessionCookie });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.username, username);
      assert.ok(res.data.id);
    });

    it('returns 401 when no session cookie is provided', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null);
      assert.strictEqual(res.status, 401);
    });

    it('returns 401 when session cookie is invalid', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null, {
        Cookie: 'session=invalid-session-id-12345'
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // ── POST /api/auth/logout ───────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('clears session cookie and returns 200, then /me returns 401', async () => {
      const sessionCookie = await registerAndLogin('logouttest', 'testpass123');

      const logoutRes = await makeRequest('POST', '/api/auth/logout', null, { Cookie: sessionCookie });
      assert.strictEqual(logoutRes.status, 200);
      assert.ok(logoutRes.setCookie);
      assert.ok(logoutRes.setCookie.includes('Max-Age=0'));

      // Session cookie should now be invalid — /me should 401
      const meRes = await makeRequest('GET', '/api/auth/me', null, { Cookie: sessionCookie });
      assert.strictEqual(meRes.status, 401);
    });
  });

  // ── Protected endpoints ────────────────────────────────────────────────
  describe('Protected endpoints (requireAuth middleware)', () => {
    it('DELETE /api/connections/:id returns 401 without session cookie', async () => {
      const res = await makeRequest('DELETE', '/api/connections/123', null);
      assert.strictEqual(res.status, 401);
    });

    it('DELETE /api/connections/:id returns 200 with valid session', async () => {
      const sessionCookie = await registerAndLogin('protected', 'testpass123');
      const res = await makeRequest('DELETE', '/api/connections/1', null, { Cookie: sessionCookie });
      // 200 = auth passed; connection won't exist but that's expected
      assert.strictEqual(res.status, 200);
    });
  });
});
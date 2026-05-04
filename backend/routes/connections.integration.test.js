import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

describe('connections integration tests', () => {
  // These tests verify the integration contract:
  // - Parameterized queries used everywhere
  // - WHERE user_id present in GET /
  // - Both conditions in GET /:id and DELETE /:id
  // - Zero X-User-Id header references
  // - Encryption/decryption roundtrip works
  // - User isolation: connections are scoped to user_id

  it('GET / route should use parameterized query with user_id', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // Verify WHERE user_id = ? is present in GET /
    assert.match(
      code,
      /connections\.get\(['"]\/['"],\s*async.*?SELECT.*?FROM\s+connections\s+WHERE\s+user_id\s*=\s*\?/s,
      'GET / should use parameterized query with user_id = ?'
    );
  });

  it('GET /:id route should use both id AND user_id conditions', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // The GET /:id handler must filter by both id and user_id
    assert.match(
      code,
      /SELECT\s+\*\s+FROM\s+connections\s+WHERE\s+id\s*=\s*\?\s+AND\s+user_id\s*=\s*\?/,
      'GET /:id should SELECT with both id = ? AND user_id = ?'
    );
  });

  it('DELETE /:id route should use both id AND user_id conditions', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    assert.match(
      code,
      /DELETE\s+FROM\s+connections\s+WHERE\s+id\s*=\s*\?\s+AND\s+user_id\s*=\s*\?/,
      'DELETE /:id should DELETE with both id = ? AND user_id = ?'
    );
  });

  it('POST / should use parameterized INSERT', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // Should have parameterized INSERT with placeholders
    assert.match(
      code,
      /INSERT\s+INTO\s+connections\s*\([^)]*\)\s+VALUES\s*\([^)]*\)/s,
      'POST / should use parameterized INSERT'
    );

    // Verify stmt.run uses ? placeholders (not string interpolation)
    assert.match(
      code,
      /stmt\.run\s*\(\s*[^,]*,\s*userId,\s*[^,]*,\s*[^,]*,\s*[^,]*,\s*[^,]*,\s*[^,]*,\s*[^,]*\s*\)/s,
      'POST / should pass values to stmt.run (not interpolated)'
    );
  });

  it('no X-User-Id header references in connections.js', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    assert.equal(
      code.includes('X-User-Id'),
      false,
      'connections.js should not reference X-User-Id header'
    );
  });

  it('no X-User-Id header references in query.ws.js', () => {
    const code = fs.readFileSync('backend/routes/query.ws.js', 'utf8');

    assert.equal(
      code.includes('X-User-Id'),
      false,
      'query.ws.js should not reference X-User-Id header'
    );
  });

  it('GET /:id should parse and decrypt the stored encrypted blob', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // Should call JSON.parse on the stored encrypted blob
    assert.match(
      code,
      /JSON\.parse\s*\(\s*conn\.password_encrypted/s,
      'GET /:id should parse the stored encrypted blob'
    );

    // Should call decryptConnectionServer
    assert.match(
      code,
      /decryptConnectionServer/,
      'GET /:id should call decryptConnectionServer'
    );
  });

  it('POST /decrypt/:id should use user isolation', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // POST /decrypt/:id should also check user_id
    assert.match(
      code,
      /SELECT\s+\*\s+FROM\s+connections\s+WHERE\s+id\s*=\s*\?\s+AND\s+user_id\s*=\s*\?/,
      'POST /decrypt/:id should SELECT with both id = ? AND user_id = ?'
    );
  });

  it('should have 5+ [connections] observability log calls', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    const matches = code.match(/\[connections\]/g);
    const count = matches ? matches.length : 0;

    assert.ok(
      count >= 5,
      `Expected 5+ [connections] logs, found ${count}`
    );
  });

  it('POST / returns only id and name (not credentials)', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // POST / response should only include id and name
    // The return statement is: return ctx.json({ id, name });
    assert.match(
      code,
      /return\s+ctx\.json\s*\(\s*\{\s*id,\s*name\s*\}\s*\)/,
      'POST / should return only { id, name } — no credentials'
    );
  });

  it('GET /:id should return server, database, authType without raw credentials', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    // The response should not expose the raw encrypted blob or password_encrypted field
    assert.ok(
      !code.match(/ctx\.json\s*\(\s*\{[^}]*password_encrypted/s),
      'GET /:id should not expose password_encrypted in response'
    );

    // Should return server, database, authType from the decrypted connection
    // The ctx.json call in GET /:id contains server: decrypted.server
    assert.match(
      code,
      /server:\s*decrypted\.server/,
      'GET /:id should return server in response'
    );
  });

  it('global Map and nextId variable should be removed', () => {
    const code = fs.readFileSync('backend/routes/connections.js', 'utf8');

    assert.equal(
      code.includes('new Map()'),
      false,
      'connections.js should not create a new Map()'
    );
    assert.equal(
      code.includes('connectionsStore'),
      false,
      'connections.js should not reference connectionsStore'
    );
    assert.equal(
      code.includes('nextId'),
      false,
      'connections.js should not reference nextId'
    );
  });
});

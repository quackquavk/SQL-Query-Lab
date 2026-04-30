// DDL Execution endpoint - POST /api/execute-ddl
// Executes DDL statements (CREATE/ALTER TABLE, etc.)

import { Router } from 'hono';
import { getPool } from '../services/sqlServer.js';

const router = new Router();

/**
 * POST /api/execute-ddl
 * Accepts { ddl: string }
 * Returns { success: true } or { error: string }
 */
router.post('/', async (c) => {
  const { ddl } = await c.req.json();
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');
  const database = c.req.header('x-database') || 'master';

  if (!ddl || typeof ddl !== 'string') {
    return c.json({ error: 'DDL statement is required' }, 400);
  }

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database });

    await pool.query(ddl);

    return c.json({ success: true });

  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
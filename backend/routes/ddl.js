// DDL Execution endpoint - POST /api/execute-ddl
// Executes DDL statements (CREATE/ALTER TABLE, etc.)

import { Hono } from 'hono';
import { getPool } from '../services/sqlServer.js';

const router = new Hono();

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

  // Extract table name from DDL for logging
  const tableNameMatch = ddl.match(/(?:ALTER|CREATE)\s+TABLE\s+\[?dbo\]?\.\[?(\w+)\]?/i)
    || ddl.match(/sp_rename\s+\'[^\']+\.(\w+)\'/i);
  const tableName = tableNameMatch ? tableNameMatch[1] : 'unknown';
  console.log(`[ddl] execute ddl for table ${tableName}`);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database });

    await pool.query(ddl);

    console.log(`[ddl] success for table ${tableName}`);
    return c.json({ success: true });

  } catch (err) {
    console.error(`[ddl] error for table ${tableName}: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

export default router;
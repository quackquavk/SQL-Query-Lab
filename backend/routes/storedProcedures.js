// Stored Procedures CRUD endpoints
// GET /api/stored-procedures/:db - list procedures
// GET /api/stored-procedure/:db/:name - get definition
// POST /api/stored-procedure/:db - create/update procedure

import { Router } from 'hono';
import { getPool } from '../services/sqlServer.js';

const router = new Router();

/**
 * GET /api/stored-procedures/:db
 * List stored procedures in a database
 */
router.get('/:db', async (c) => {
  const db = c.req.param('db');
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: db });

    const result = await pool.query(`
      SELECT ROUTINE_SCHEMA, ROUTINE_NAME
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_CATALOG = @db
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `, { db });

    const procedures = result.recordset.map(r => ({
      name: r.ROUTINE_NAME,
      schema: r.ROUTINE_SCHEMA
    }));

    return c.json({ procedures });

  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/stored-procedure/:db/:name
 * Get the definition of a specific stored procedure
 */
router.get('/:db/:name', async (c) => {
  const db = c.req.param('db');
  const name = c.req.param('name');
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: db });

    // Parse schema.name format
    const parts = name.split('.');
    const schemaName = parts.length > 1 ? parts[0] : 'dbo';
    const procName = parts.length > 1 ? parts[1] : parts[0];

    const result = await pool.query(`
      SELECT m.definition
      FROM sys.sql_modules m
      JOIN sys.procedures p ON m.object_id = p.object_id
      JOIN sys.schemas s ON p.schema_id = s.schema_id
      WHERE s.name = @schema AND p.name = @procName
    `, { schema: schemaName, procName: procName });

    if (result.recordset.length === 0) {
      return c.json({ error: 'Stored procedure not found' }, 404);
    }

    return c.json({ definition: result.recordset[0].definition });

  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * POST /api/stored-procedure/:db
 * Create or update a stored procedure
 * Accepts { name: string, definition: string }
 */
router.post('/:db', async (c) => {
  const db = c.req.param('db');
  const { name, definition } = await c.req.json();
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');

  if (!name || !definition) {
    return c.json({ error: 'Name and definition are required' }, 400);
  }

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: db });

    // Execute the procedure definition (CREATE or ALTER)
    await pool.query(definition);

    return c.json({ success: true });

  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
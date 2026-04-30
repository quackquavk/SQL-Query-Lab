// Execution Plan endpoint - POST /api/execution-plan
// Executes query with SET SHOWPLAN_XML ON and returns XML Showplan

import { Router } from 'hono';
import { getPool } from '../services/sqlServer.js';

const router = new Router();

/**
 * POST /api/execution-plan
 * Accepts { query: string }
 * Returns { xml: string } with XML Showplan
 */
router.post('/', async (c) => {
  const { query } = await c.req.json();
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');
  const database = c.req.header('x-database') || 'master';

  if (!query || typeof query !== 'string') {
    return c.json({ error: 'Query is required' }, 400);
  }

  let pool = null;

  try {
    pool = await getPool(userId, server, authType, { ...credentials, database });

    // Enable Showplan XML
    await pool.query('SET SHOWPLAN_XML ON');

    // Execute the query (returns no rows, just showplan)
    let result;
    try {
      result = await pool.query(query);
    } catch (queryErr) {
      // Query errors are expected when using SET SHOWPLAN_XML ON
      // The Showplan is returned even if the query has errors
    }

    // Always turn off Showplan
    try {
      await pool.query('SET SHOWPLAN_XML OFF');
    } catch (offErr) {
      // Ignore errors when turning off
    }

    // The XML showplan is returned as the first (and only) recordset
    // The column name varies - try common names
    if (result && result.recordset && result.recordset.length > 0) {
      const row = result.recordset[0];
      const xmlColumn = Object.keys(row).find(k => k.toUpperCase().includes('XML') || k.toUpperCase().includes('SHOWPLAN'));
      if (xmlColumn) {
        return c.json({ xml: row[xmlColumn] });
      }
      // Otherwise return the first column value
      const firstCol = Object.keys(row)[0];
      return c.json({ xml: row[firstCol] });
    }

    // If no result, try querying again without the user query to get the showplan
    // This is a fallback for some drivers
    return c.json({ error: 'No execution plan returned' }, 500);

  } catch (err) {
    // Ensure Showplan is turned off even on error
    if (pool) {
      try {
        await pool.query('SET SHOWPLAN_XML OFF');
      } catch (e) {
        // Ignore
      }
    }
    return c.json({ error: err.message }, 500);
  }
});

export default router;
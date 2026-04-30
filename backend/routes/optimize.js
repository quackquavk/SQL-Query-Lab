// Optimization endpoint - POST /api/optimize
// Analyzes SQL queries and returns optimization suggestions using SET SHOWPLAN_XML ON

import { Router } from 'hono';
import { getPool } from '../services/sqlServer.js';

const router = new Router();

router.post('/', async (c) => {
  const { sql } = await c.req.json();
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');
  const database = c.req.header('x-database') || 'master';

  if (!sql || typeof sql !== 'string') {
    return c.json({ error: 'SQL is required' }, 400);
  }

  let pool = null;

  try {
    pool = await getPool(userId, server, authType, { ...credentials, database });

    await pool.query('SET SHOWPLAN_XML ON');

    let result;
    try {
      result = await pool.query(sql);
    } catch (queryErr) {
    }

    try {
      await pool.query('SET SHOWPLAN_XML OFF');
    } catch (offErr) {}

    if (!result || !result.recordset || result.recordset.length === 0) {
      return c.json({ suggestions: [] });
    }

    const row = result.recordset[0];
    const xmlColumn = Object.keys(row).find(k => k.toUpperCase().includes('XML') || k.toUpperCase().includes('SHOWPLAN'));
    const xmlString = xmlColumn ? row[xmlColumn] : row[Object.keys(row)[0]];

    if (!xmlString) {
      return c.json({ suggestions: [] });
    }

    const suggestions = analyzeShowplanXml(xmlString, sql);
    return c.json({ suggestions });

  } catch (err) {
    if (pool) {
      try {
        await pool.query('SET SHOWPLAN_XML OFF');
      } catch (e) {}
    }
    return c.json({ error: err.message, suggestions: [] }, 500);
  }
});

function analyzeShowplanXml(xmlString, sql) {
  const suggestions = [];

  try {
    const cleanXml = xmlString.includes('<?xml') ? xmlString : `<?xml version="1.0"?>${xmlString}`;

    const missingIndexMatches = cleanXml.matchAll(/<MissingIndexGroup[^>]*Impact="([^"]*)"[^>]*>([\s\S]*?)<\/MissingIndexGroup>/gi);
    for (const match of missingIndexMatches) {
      const impact = parseFloat(match[1]) || 0;
      const groupContent = match[2];

      const tableMatch = groupContent.match(/<MissingIndex[^>]*Object="([^"]*)"[^>]*>/i) ||
                         groupContent.match(/<MissingIndex[^>]*Table="([^"]*)"[^>]*>/i);
      const table = tableMatch ? tableMatch[1] : 'unknown_table';

      const colMatches = [...groupContent.matchAll(/<Column Name="([^"]*)"[^>]*>/gi)];
      const columns = colMatches.map(m => m[1]);

      if (columns.length > 0) {
        const indexName = `IX_${table.replace(/[^a-zA-Z0-9]/g, '_')}_${columns.slice(0, 2).join('_')}`;
        const schema = table.includes('.') ? table.split('.')[1] || 'dbo' : 'dbo';
        const dbPart = table.includes('.') ? table.split('.')[0] : database || 'dbo';

        suggestions.push({
          type: 'index',
          message: `Missing index on ${table} (${columns.slice(0, 3).join(', ')}${columns.length > 3 ? '...' : ''}) - Impact: ${impact.toFixed(0)}%`,
          impact,
          line: 1,
          column: 1,
          length: 10,
          createStatement: `CREATE INDEX [${indexName}] ON [${dbPart}].[${schema}].[${table.split('.').pop()}] ([${columns.map(c => `[${c}]`).join(', ')}]);`,
          table,
          columns
        });
      }
    }

    const tableScanRegex = /<(?:RelOp|RelOp[^>]*)PhysicalOp="(?:Table Scan|Clustered Index Scan|Index Scan)"[^>]*EstimateRows="([^"]*)"[^>]*>/gi;
    const scanMatches = xmlString.matchAll(tableScanRegex);
    for (const match of scanMatches) {
      const estimateRows = parseFloat(match[1]) || 0;
      if (estimateRows > 10000) {
        suggestions.push({
          type: 'restructure',
          message: `Heavy table scan (~${formatNumber(estimateRows)} rows). Consider adding a covering index.`,
          line: 1,
          column: 1,
          length: 10
        });
      }
    }

    const sortRegex = /<RelOp[^>]*PhysicalOp="Sort"[^>]*TotalSubtreeCost="([^"]*)"[^>]*>/gi;
    const sortMatches = xmlString.matchAll(sortRegex);
    for (const match of sortMatches) {
      const cost = parseFloat(match[1]) || 0;
      if (cost > 0.1) {
        suggestions.push({
          type: 'restructure',
          message: `Expensive Sort operation (cost: ${cost.toFixed(4)}). Ensure ORDER BY is necessary or add appropriate index.`,
          line: 1,
          column: 1,
          length: 10
        });
      }
    }

  } catch (e) {
    console.error('Showplan analysis error:', e);
  }

  return suggestions;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default router;
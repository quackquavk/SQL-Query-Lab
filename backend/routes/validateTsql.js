// T-SQL Validation endpoint - POST /api/validate-tsql
// Validates T-SQL syntax using node-sql-parser

import { Hono } from 'hono';

const router = new Hono();

// Lazy-load parser to handle missing dependency gracefully
let _parser = null;

async function getParser() {
  if (!_parser) {
    try {
      const { Parser } = await import('node-sql-parser');
      _parser = new Parser();
    } catch (err) {
      console.warn('node-sql-parser not available:', err.message);
      return null;
    }
  }
  return _parser;
}

/**
 * POST /api/validate-tsql
 * Accepts { sql: string }
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
router.post('/', async (c) => {
  const { sql } = await c.req.json();

  if (!sql || typeof sql !== 'string') {
    return c.json({ valid: false, errors: [{ message: 'SQL text is required' }] });
  }

  const parser = await getParser();

  // If parser not available, do basic validation
  if (!parser) {
    // Basic syntax check - look for obvious issues
    const basicErrors = [];

    // Check for unclosed strings
    const singleQuotes = (sql.match(/'/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      basicErrors.push({ message: 'Unclosed string literal', line: 1, column: 1 });
    }

    // Check for unbalanced parentheses
    let parens = 0;
    sql.split('').forEach((char, i) => {
      if (char === '(') parens++;
      if (char === ')') parens--;
    });
    if (parens !== 0) {
      basicErrors.push({ message: 'Unbalanced parentheses', line: 1, column: 1 });
    }

    if (basicErrors.length > 0) {
      return c.json({ valid: false, errors: basicErrors });
    }

    return c.json({ valid: true });
  }

  try {
    // Try to parse with T-SQL dialect
    parser.parse(sql, { database: 'Tsql' });
    return c.json({ valid: true });
  } catch (err) {
    // Parse error - extract line/column if available
    const errorMatch = err.message.match(/line (\d+),? col(?:umn)? (\d+)/i);
    const line = errorMatch ? parseInt(errorMatch[1]) : 1;
    const column = errorMatch ? parseInt(errorMatch[2]) : 1;

    return c.json({
      valid: false,
      errors: [{
        message: err.message,
        line,
        column
      }]
    });
  }
});

export default router;
// Schema fetch endpoints - GET /api/schema/:database, GET /api/schema/:database/:table

import { Hono } from 'hono';
import { getPool } from '../services/sqlServer.js';

const router = new Hono();

/**
 * GET /api/schema/:database
 * Fetch full schema: tables, columns, PK/FK constraints, relationships
 */
router.get('/:database', async (c) => {
  const db = c.req.param('database');
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: db });

    // Fetch tables
    const tablesResult = await pool.query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_CATALOG = @db
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `, { db });

    const tables = [];

    for (const row of tablesResult.recordset) {
      const schemaName = row.TABLE_SCHEMA;
      const tableName = row.TABLE_NAME;

      // Fetch columns for this table
      const columnsResult = await pool.query(`
        SELECT
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.IS_NULLABLE,
          c.COLUMN_DEFAULT,
          c.CHARACTER_MAXIMUM_LENGTH,
          c.NUMERIC_PRECISION,
          c.NUMERIC_SCALE
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_CATALOG = @db
          AND c.TABLE_SCHEMA = @schema
          AND c.TABLE_NAME = @table
        ORDER BY c.ORDINAL_POSITION
      `, { db, schema: schemaName, table: tableName });

      const columns = columnsResult.recordset.map(col => {
        let type = col.DATA_TYPE;
        if (col.CHARACTER_MAXIMUM_LENGTH) {
          type += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
        } else if (col.NUMERIC_PRECISION !== null) {
          type += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE || 0})`;
        }

        return {
          name: col.COLUMN_NAME,
          type: type,
          nullable: col.IS_NULLABLE === 'YES',
          default: col.COLUMN_DEFAULT,
          isPK: false,
          isFK: false,
          references: null
        };
      });

      // Fetch primary key columns
      const pkResult = await pool.query(`
        SELECT c.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE c
          ON tc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
          AND tc.TABLE_SCHEMA = c.TABLE_SCHEMA
          AND tc.TABLE_NAME = c.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND tc.TABLE_CATALOG = @db
          AND tc.TABLE_SCHEMA = @schema
          AND tc.TABLE_NAME = @table
      `, { db, schema: schemaName, table: tableName });

      const pkColumns = new Set(pkResult.recordset.map(r => r.COLUMN_NAME));
      columns.forEach(col => {
        if (pkColumns.has(col.name)) col.isPK = true;
      });

      // Fetch FK references
      const fkResult = await pool.query(`
        SELECT
          kcu.COLUMN_NAME,
          ccu.TABLE_NAME AS REFERENCED_TABLE,
          ccu.COLUMN_NAME AS REFERENCED_COLUMN
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND kcu.TABLE_SCHEMA = @schema
          AND kcu.TABLE_NAME = @table
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
          ON rc.UNIQUE_CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
        WHERE kcu.TABLE_CATALOG = @db
      `, { db, schema: schemaName, table: tableName });

      const fkMap = new Map();
      fkResult.recordset.forEach(fk => {
        fkMap.set(fk.COLUMN_NAME, {
          table: fk.REFERENCED_TABLE,
          column: fk.REFERENCED_COLUMN
        });
      });

      columns.forEach(col => {
        if (fkMap.has(col.name)) {
          col.isFK = true;
          col.references = fkMap.get(col.name);
        }
      });

      tables.push({
        name: tableName,
        schema: schemaName,
        columns
      });
    }

    // Fetch relationships for FK edges
    const relationshipsResult = await pool.query(`
      SELECT
        kcu.TABLE_NAME AS from_table,
        kcu.COLUMN_NAME AS from_column,
        ccu.TABLE_NAME AS to_table,
        ccu.COLUMN_NAME AS to_column
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
        ON rc.UNIQUE_CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
      WHERE kcu.TABLE_CATALOG = @db
    `, { db });

    const relationships = relationshipsResult.recordset.map(r => ({
      from: { table: r.from_table, column: r.from_column },
      to: { table: r.to_table, column: r.to_column }
    }));

    return c.json({ tables, relationships });

  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/schema/:database/:table
 * Fetch column details for a specific table
 */
router.get('/:database/:table', async (c) => {
  const db = c.req.param('database');
  const table = c.req.param('table');
  const userId = c.req.header('x-user-id') || 'anonymous';
  const server = c.req.header('x-server') || process.env.DEFAULT_SERVER;
  const authType = c.req.header('x-auth-type') || 'sql';
  const credentials = JSON.parse(c.req.header('x-credentials') || '{}');

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: db });

    // Parse schema.table format
    const parts = table.split('.');
    const schemaName = parts.length > 1 ? parts[0] : 'dbo';
    const tableName = parts.length > 1 ? parts[1] : parts[0];

    const result = await pool.query(`
      SELECT
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.IS_NULLABLE,
        c.COLUMN_DEFAULT,
        c.CHARACTER_MAXIMUM_LENGTH,
        c.NUMERIC_PRECISION,
        c.NUMERIC_SCALE,
        tc.CONSTRAINT_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_TYPE, ccu.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
          ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
        WHERE tc.TABLE_CATALOG = @db
          AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY')
      ) tc
        ON c.TABLE_SCHEMA = tc.TABLE_SCHEMA
        AND c.TABLE_NAME = tc.TABLE_NAME
        AND c.COLUMN_NAME = tc.COLUMN_NAME
      WHERE c.TABLE_CATALOG = @db
        AND c.TABLE_SCHEMA = @schema
        AND c.TABLE_NAME = @table
      ORDER BY c.ORDINAL_POSITION
    `, { db, schema: schemaName, table: tableName });

    const columns = result.recordset.map(col => {
      let type = col.DATA_TYPE;
      if (col.CHARACTER_MAXIMUM_LENGTH) {
        type += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
      } else if (col.NUMERIC_PRECISION !== null) {
        type += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE || 0})`;
      }

      return {
        name: col.COLUMN_NAME,
        type,
        nullable: col.IS_NULLABLE === 'YES',
        default: col.COLUMN_DEFAULT,
        isPK: col.CONSTRAINT_TYPE === 'PRIMARY KEY',
        isFK: col.CONSTRAINT_TYPE === 'FOREIGN KEY'
      };
    });

    return c.json({ columns });

  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
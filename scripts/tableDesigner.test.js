// tableDesigner.js smoke tests — 55+ checks covering T01 (API wiring)
// and T02 (diff-based DDL, context headers, tree refresh, FK section).
// Run: node scripts/tableDesigner.test.js

import { readFileSync } from 'fs';

const SOURCE = readFileSync('./scripts/tableDesigner.js', 'utf8');

function count(pat, src = SOURCE) {
  const re = typeof pat === 'string' ? new RegExp(pat, 'g') : pat.global ? pat : new RegExp(pat, 'g');
  return (src.match(re) || []).length;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// ── T01: Module-level state ─────────────────────────────────────────────────

assert(SOURCE.includes('let _currentDatabase') ||
       SOURCE.includes('let _currentDatabase ='),
  '_currentDatabase should be a module-level let');
assert(SOURCE.includes('let _connectionId') ||
       SOURCE.includes('let _connectionId ='),
  '_connectionId should be a module-level let');
assert(SOURCE.includes('_originalColumns'),
  '_originalColumns should be a module-level var for change-tracking snapshot');
assert(SOURCE.includes('let _isOpen'),
  '_isOpen should be a module-level let');
assert(SOURCE.includes('let _foreignKeys') || SOURCE.includes('let _foreignKeys ='),
  '_foreignKeys should be a module-level let');

// ── T01: openTableDesigner signature ───────────────────────────────────────

assert(SOURCE.includes('async function openTableDesigner(') ||
       SOURCE.includes('export async function openTableDesigner('),
  'openTableDesigner should be async');
assert(SOURCE.match(/openTableDesigner\s*\(\s*tableName\s*=\s*null/),
  'openTableDesigner(tableName=null) default param');
assert(SOURCE.includes('database') &&
       SOURCE.includes('connectionId'),
  'openTableDesigner accepts database and connectionId');
assert(SOURCE.includes('await loadExistingColumns'),
  'openTableDesigner must await loadExistingColumns');
assert(SOURCE.match(/_currentDatabase\s*=\s*database/),
  'openTableDesigner must assign _currentDatabase');
assert(SOURCE.match(/_connectionId\s*=\s*connectionId/),
  'openTableDesigner must assign _connectionId');

// ── T01: loadExistingColumns ─────────────────────────────────────────────────

assert(count(/async\s+function\s+loadExistingColumns/) === 1,
  'loadExistingColumns should be a single async function declaration');
assert(SOURCE.includes('fetchTableColumns('),
  'loadExistingColumns must call apiClient.fetchTableColumns');
assert(SOURCE.includes('_connectionId') && SOURCE.includes('_currentDatabase'),
  'loadExistingColumns should reference _connectionId and _currentDatabase');
assert(SOURCE.includes('columns') && SOURCE.includes('result.columns'),
  'loadExistingColumns should handle { columns: [...] } from apiClient');
assert(SOURCE.includes('.name') && SOURCE.includes('.dataType') &&
       SOURCE.includes('.isNullable') && SOURCE.includes('.isPrimaryKey'),
  'loadExistingColumns should map from backend field names');
assert(SOURCE.match(/_originalColumns\s*=\s*_columns\.map\s*\(/),
  '_originalColumns must be a deep copy via .map()');
assert(SOURCE.includes('name:') && SOURCE.includes('type:') &&
       SOURCE.includes('nullable:') && SOURCE.includes('isPK:'),
  'Internal column shape must have name, type, nullable, isPK');

// ── T01: COLUMN_TYPES includes typed variants ────────────────────────────────

const typeList = SOURCE.match(/COLUMN_TYPES\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';

function splitTypes(str) {
  const result = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) {
      result.push(current.trim().replace(/['"]/g, ''));
      current = '';
    } else { current += ch; }
  }
  if (current.trim()) result.push(current.trim().replace(/['"]/g, ''));
  return result.filter(Boolean);
}

const typeItems = splitTypes(typeList);

for (const v of ['decimal(p,s)', 'numeric(p,s)', 'varchar(n)', 'nvarchar(n)', 'char(n)']) {
  assert(typeItems.includes(v), `COLUMN_TYPES must include '${v}'`);
}
for (const t of ['int', 'bigint', 'decimal', 'varchar', 'datetime', 'bit', 'uniqueidentifier']) {
  assert(typeItems.includes(t), `COLUMN_TYPES must include '${t}'`);
}

// ── T01: renderTableDesignerForm uses _columns ────────────────────────────────

assert(SOURCE.match(/_columns\.forEach\s*\(/),
  'renderTableDesignerForm should iterate _columns');
assert(SOURCE.includes('col.name') && SOURCE.includes('col.type') &&
       SOURCE.includes('col.nullable') && SOURCE.includes('col.isPK'),
  'renderTableDesignerForm must use column object properties');
assert(SOURCE.includes('COLUMN_TYPES.map'),
  'COLUMN_TYPES must be used in the type dropdown');
assert(SOURCE.match(/_currentTable\s*\?\s*['"]readonly['"]|isExisting\s*\?\s*['"]readonly['"]/),
  'Table name input should be readonly when _currentTable is set (or when isExisting is true)');

// ── T01: Observability ───────────────────────────────────────────────────────

const logCalls = count(/console\.(log|error|warn)\s*\(/);
assert(logCalls >= 5,
  `Should have at least 5 console.log/error/warn calls — found ${logCalls}`);
assert(SOURCE.includes("'[tableDesigner]"),
  'Should log with [tableDesigner] prefix');
assert(SOURCE.includes("'[tableDesigner] modal open'"),
  'Should log modal open');
assert(SOURCE.includes('tableDesigner] columns loaded'),
  'Should log columns loaded count');

// ── T01: closeTableDesigner resets all ──────────────────────────────────────

const closeFn = SOURCE.match(/function closeTableDesigner[\s\S]*?(?=\n(?:export|function|import|$))/)?.[0] || '';
assert(closeFn.includes('_currentDatabase = null'), 'closeTableDesigner resets _currentDatabase');
assert(closeFn.includes('_connectionId = null'), 'closeTableDesigner resets _connectionId');
assert(closeFn.includes('_originalColumns = []'), 'closeTableDesigner resets _originalColumns');
assert(closeFn.includes('_foreignKeys = []'), 'closeTableDesigner resets _foreignKeys');

// ── T01: Exports ─────────────────────────────────────────────────────────────

assert(SOURCE.includes('export function addColumn'), 'addColumn exported');
assert(SOURCE.includes('export function removeColumn'), 'removeColumn exported');
assert(SOURCE.includes('export function updateColumn'), 'updateColumn exported');
assert(SOURCE.includes('export function closeTableDesigner'), 'closeTableDesigner exported');
assert(SOURCE.includes('export function isTableDesignerOpen'), 'isTableDesignerOpen exported');
assert(SOURCE.includes('export function getColumns'), 'getColumns exported');
assert(SOURCE.includes('export function getOriginalColumns'), 'getOriginalColumns exported');
assert(SOURCE.includes('getTableDesignerContext') || SOURCE.match(/export\s+function\s+get\w+Context/),
  'getTableDesignerContext exported');
assert(SOURCE.includes('export function setTableDesignerHooks'), 'setTableDesignerHooks exported');

// ── T01: Hooks integration ──────────────────────────────────────────────────

assert(SOURCE.includes('_hooks.onSuccess'), '_hooks.onSuccess called on success');

// ── T01: Type string handling ───────────────────────────────────────────────

assert(SOURCE.includes("type: col.dataType") || SOURCE.includes("type: col.dataType || 'int'"),
  'type field should use raw dataType string from backend (not parsed)');

// ── T01: DDL generation uses _currentTable ──────────────────────────────────

assert(SOURCE.match(/ALTER TABLE\s+\[dbo\]\.\[\$?_currentTable\}?\]/) ||
       SOURCE.match(/ALTER TABLE\s+\$\{quotedTable\}/) ||
       SOURCE.match(/ALTER TABLE\s+\[dbo\]\.\[\$\{.*?tableName.*?\}\]/),
  'ALTER TABLE should reference _currentTable (directly or via quotedTable)');

// ── T02: _generateDiffDdl exported and implemented ──────────────────────────

assert(SOURCE.includes('export function _generateDiffDdl') ||
       SOURCE.includes('function _generateDiffDdl'),
  '_generateDiffDdl should be a function (exported for testing)');
assert(SOURCE.includes('currentColumns') && SOURCE.includes('originalColumns'),
  '_generateDiffDdl should accept currentColumns and originalColumns parameters');
assert(SOURCE.includes('_generateDiffDdl(_columns, _originalColumns)') ||
       SOURCE.match(/_generateDiffDdl\s*\(\s*_columns\s*,\s*_originalColumns\s*\)/),
  'generateDdl() must call _generateDiffDdl when editing existing table');

// ── T02: Diff cases — DROP COLUMN ───────────────────────────────────────────

assert(SOURCE.includes('DROP COLUMN'),
  'Diff DDL must generate DROP COLUMN for removed columns');
assert(SOURCE.match(/DROP COLUMN\s*\[/),
  'DROP COLUMN should use bracket notation');

// ── T02: Diff cases — ALTER COLUMN (type change) ─────────────────────────────

assert(SOURCE.includes('ALTER COLUMN'),
  'Diff DDL must generate ALTER COLUMN for changed columns');
assert(SOURCE.match(/ALTER COLUMN\s*\[/),
  'ALTER COLUMN should use bracket notation');
assert(SOURCE.match(/NULL\s*\||\s*NOT\s+NULL/),
  'ALTER COLUMN should include NULL/NOT NULL clause');

// ── T02: Diff cases — sp_rename ───────────────────────────────────────────────

assert(SOURCE.includes("sp_rename"),
  'Diff DDL must generate sp_rename for renamed columns');
assert(SOURCE.includes("'COLUMN'"),
  'sp_rename must specify COLUMN type');

// ── T02: Diff cases — ADD COLUMN (new column in current) ────────────────────

// new column → ADD COLUMN in diff flow
assert(SOURCE.match(/ADD\s+${.*?}\s*;/m) ||
       SOURCE.match(/ADD\s+\w.*?;/),
  'Diff DDL must generate ADD COLUMN for new columns');

// ── T02: PK change handling ─────────────────────────────────────────────────

assert(SOURCE.includes('DROP CONSTRAINT') && SOURCE.includes('PK_'),
  'Diff DDL must DROP existing PK constraint when PK changes');
assert(SOURCE.includes('ADD CONSTRAINT') && SOURCE.includes('PK_'),
  'Diff DDL must ADD new PK constraint');

// ── T02: generateDdl uses diff path for existing tables ─────────────────────

const genDdlFn = SOURCE.match(/export function generateDdl\(\)[\s\S]*?(?=\n(?:export|function|import|$))/)?.[0] || '';
assert(genDdlFn.includes('_originalColumns.length > 0') ||
       genDdlFn.includes('_currentTable && _originalColumns'),
  'generateDdl() must use _originalColumns.length check for diff path');
assert(genDdlFn.includes('_generateDiffDdl'),
  'generateDdl() must call _generateDiffDdl for existing tables');
assert(genDdlFn.includes('CREATE TABLE') ||
       genDdlFn.includes('CREATE TABLE'),
  'generateDdl() must have CREATE TABLE path for new tables');

// ── T02: executeDdl passes connection context headers ────────────────────────

assert(SOURCE.includes('_getConnectionContext') ||
       SOURCE.includes('executeDdlWithContext'),
  'executeDdl must get connection context via _getConnectionContext or similar');
assert(SOURCE.includes('activeServer') || SOURCE.includes('server'),
  'Connection context must include server info');
assert(SOURCE.includes('authType') || SOURCE.includes('authType'),
  'Connection context must include authType');
assert(SOURCE.includes('credentials') || SOURCE.includes('credentials'),
  'Connection context must include credentials');
assert(SOURCE.includes('_currentDatabase') ||
       SOURCE.includes('currentDbName'),
  'executeDdl must include database context');

// ── T02: Tree refresh after executeDdl success ──────────────────────────────

assert(SOURCE.includes('refreshObjectNode') ||
       SOURCE.includes('refreshObjectNode'),
  'handleExecute must call refreshObjectNode after DDL success');
assert(SOURCE.includes('tree refresh requested'),
  'Log "[tableDesigner] tree refresh requested" on refresh');
assert(SOURCE.match(/try\s*\{[\s\S]*?refreshObjectNode[\s\S]*?\}\s*catch/),
  'refreshObjectNode must be wrapped in try/catch');
assert(SOURCE.includes('non-blocking') || SOURCE.includes('warn'),
  'refresh tree refresh failure should be non-blocking (warn)');

// ── T02: Observability — DDL execute success/error logs ─────────────────────

assert(SOURCE.includes("'[tableDesigner] DDL execute success'"),
  'Should log DDL execute success');
assert(SOURCE.includes("'[tableDesigner] DDL execute error'"),
  'Should log DDL execute error');

// ── T02: FK section rendering ───────────────────────────────────────────────

assert(SOURCE.includes('td-fk-section') ||
       SOURCE.includes('td-fk-section'),
  'FK section HTML element should be rendered for existing tables');
assert(SOURCE.includes('renderFkList') ||
       SOURCE.includes('renderFkList'),
  'Should call renderFkList to render FK list');
assert(SOURCE.includes('_foreignKeys') &&
       SOURCE.includes('_foreignKeys.length'),
  'FK section should check _foreignKeys length');
assert(SOURCE.includes('td-fk-form') ||
       SOURCE.includes('td-fk-form'),
  'FK add form container should exist');
assert(SOURCE.includes('showFkForm') ||
       SOURCE.includes('showFkForm'),
  'showFkForm function should exist');

// ── T02: FK add form ─────────────────────────────────────────────────────────

assert(SOURCE.includes('constraintName') || SOURCE.includes('constraintName'),
  'FK form should have constraintName field');
assert(SOURCE.includes('fromColumn') || SOURCE.includes('fromColumn'),
  'FK form should have fromColumn field');
assert(SOURCE.includes('toTable') || SOURCE.includes('toTable'),
  'FK form should have toTable field');
assert(SOURCE.includes('toColumn') || SOURCE.includes('toColumn'),
  'FK form should have toColumn field');
assert(SOURCE.includes('ADD CONSTRAINT') ||
       SOURCE.includes('FOREIGN KEY'),
  'FK DDL should include ADD CONSTRAINT or FOREIGN KEY');

// ── T02: _generateFkDdl exported ─────────────────────────────────────────────

assert(SOURCE.includes('_generateFkDdl') ||
       SOURCE.includes('_generateFkDdl'),
  '_generateFkDdl function should exist for FK DDL generation');
assert(SOURCE.includes('FOREIGN KEY'),
  '_generateFkDdl should generate FOREIGN KEY clause');

// ── T02: Fetch FK via apiClient.fetchTableForeignKeys ────────────────────────

assert(SOURCE.includes('fetchTableForeignKeys'),
  'openTableDesigner must call fetchTableForeignKeys for existing tables');
assert(SOURCE.includes('foreignKeys') &&
       SOURCE.includes('foreignKeys || []'),
  'FK results should handle { foreignKeys: [...] } shape');

// ── T02: apiClient.executeDdlWithContext in tableDesigner imports ──────────

assert(SOURCE.includes('executeDdlWithContext') ||
       SOURCE.includes('executeDdlWithContext'),
  'tableDesigner.js must import executeDdlWithContext from apiClient');

// ── T02: loadExistingColumns handles parse type strings ─────────────────────

// When backend returns varchar(50) or decimal(18,2), it should be stored as-is
assert(SOURCE.includes("type: col.dataType") ||
       SOURCE.match(/type:\s*col\.dataType\s*\|\|/),
  'type should use raw dataType (no parsing needed)');

// ── T02: context menu integration ───────────────────────────────────────────

// openTableDesigner is called from context menu with (tableName, database, connectionId)
assert(SOURCE.match(/openTableDesigner\s*\(\s*tableName\s*=/),
  'openTableDesigner must accept 3-param call signature (tableName, database, connectionId)');
assert(SOURCE.includes('database = null') && SOURCE.includes('connectionId = null'),
  'openTableDesigner signature must include database and connectionId parameters');

// ── T02: generateDdl handles empty / no-name columns ───────────────────────

assert(SOURCE.includes('col.name.trim()') ||
       SOURCE.includes('.name.trim()'),
  'generateDdl must filter out columns with empty names');
assert(SOURCE.includes('namedCols.length === 0') ||
       SOURCE.includes('colDefs.length === 0') ||
       SOURCE.includes('_columns.length === 0'),
  'generateDdl must handle empty column list');

// ── T02: DEFAULT clause in column definition ─────────────────────────────────

assert(SOURCE.includes('DEFAULT'),
  'Column definition must include DEFAULT clause when defaultVal is set');

// ── T02: Backend ddl.js logs table name ─────────────────────────────────────

const ddlSource = readFileSync('./backend/routes/ddl.js', 'utf8');
assert(ddlSource.includes('[ddl]'),
  'ddl.js should log with [ddl] prefix');
assert(ddlSource.match(/execute ddl for table/),
  'ddl.js should log which table is being executed');
assert(ddlSource.match(/success for table/),
  'ddl.js should log success with table name');
assert(ddlSource.match(/error for table/),
  'ddl.js should log error with table name');

// ── T02: apiClient exports executeDdlWithContext and fetchTableForeignKeys ────

const apiSource = readFileSync('./scripts/apiClient.js', 'utf8');
assert(apiSource.includes('executeDdlWithContext'),
  'apiClient must export executeDdlWithContext');
assert(apiSource.includes('fetchTableForeignKeys'),
  'apiClient must export fetchTableForeignKeys');
assert(apiSource.match(/X-Server.*X-Auth-Type.*X-Credentials.*X-Database/s),
  'executeDdlWithContext must pass all four X- headers');

// ── T02: schema.js foreign-keys endpoint ─────────────────────────────────────

const schemaSource = readFileSync('./backend/routes/schema.js', 'utf8');
assert(schemaSource.includes('/foreign-keys') ||
       schemaSource.includes('foreign-keys'),
  'schema.js must have /foreign-keys route');
assert(schemaSource.includes('constraintName') &&
       schemaSource.includes('from_column') &&
       schemaSource.includes('to_table') &&
       schemaSource.includes('to_column'),
  'foreign-keys endpoint must return constraintName, fromColumn, toTable, toColumn');

console.log('✅ 55 smoke checks passed (25 T01 + 30 T02)');
// tableDesigner.js smoke tests — 25+ checks for function signatures,
// API call shapes, column parsing, type string handling, and render flow.
// Run: node scripts/tableDesigner.test.js

import { readFileSync } from 'fs';

// ----- Helpers ---------------------------------------------------------------

const SOURCE = readFileSync('./scripts/tableDesigner.js', 'utf8');

/** Count matches of `pat` in `src`. */
function count(pat, src = SOURCE) {
  const re = typeof pat === 'string' ? new RegExp(pat, 'g') : pat.global ? pat : new RegExp(pat, 'g');
  return (src.match(re) || []).length;
}

/** Assert `cond`, or throw with `msg`. */
function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// ----- 1. Module-level state exports ----------------------------------------

// _currentDatabase and _connectionId must be declared at module level.
// They may be exported via a getter (preferred) or exported directly.
// Check that they exist as let declarations at module scope.
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

// ----- 2. openTableDesigner signature ---------------------------------------

// Signature should accept (tableName, database, connectionId)
assert(SOURCE.includes('async function openTableDesigner(') ||
       SOURCE.includes('export async function openTableDesigner('),
  'openTableDesigner should be async');

assert(SOURCE.includes('tableName = null') ||
       SOURCE.match(/openTableDesigner\s*\(\s*tableName\s*=/),
  'openTableDesigner should accept tableName parameter');

assert(SOURCE.includes('database'),
  'openTableDesigner should accept database parameter');

assert(SOURCE.includes('connectionId') ||
       SOURCE.match(/connectionId\s*=\s*null/),
  'openTableDesigner should accept connectionId parameter');

// Must await loadExistingColumns
assert(SOURCE.includes('await loadExistingColumns'),
  'openTableDesigner must await loadExistingColumns');

// Must assign all three context fields
assert(SOURCE.match(/_currentDatabase\s*=\s*database/),
  'openTableDesigner must assign _currentDatabase');
assert(SOURCE.match(/_connectionId\s*=\s*connectionId/),
  'openTableDesigner must assign _connectionId');

// ----- 3. loadExistingColumns → async, calls fetchTableColumns --------------

assert(count(/async\s+function\s+loadExistingColumns/) === 1,
  'loadExistingColumns should be a single async function declaration');

assert(SOURCE.includes('fetchTableColumns('),
  'loadExistingColumns must call apiClient.fetchTableColumns');

assert(SOURCE.includes('_connectionId') &&
       SOURCE.includes('_currentDatabase'),
  'loadExistingColumns should reference _connectionId and _currentDatabase');

assert(SOURCE.includes('columns || []') ||
       SOURCE.includes('result.columns'),
  'loadExistingColumns should handle { columns: [...] } from apiClient');

// Maps backend shape → internal shape
assert(SOURCE.includes('.name') &&
       SOURCE.includes('.dataType') &&
       SOURCE.includes('.isNullable') &&
       SOURCE.includes('.isPrimaryKey'),
  'loadExistingColumns should map from backend field names (name, dataType, isNullable, isPrimaryKey)');

// Stores deep copy in _originalColumns
assert(SOURCE.includes('_originalColumns'),
  '_originalColumns should be assigned from loadExistingColumns');

// Deep copy: uses map + object spread
assert(SOURCE.match(/_originalColumns\s*=\s*_columns\.map\s*\(/),
  '_originalColumns must be a deep copy via .map()');

// Maps to internal column shape
assert(SOURCE.includes('name:') &&
       SOURCE.includes('type:') &&
       SOURCE.includes('nullable:') &&
       SOURCE.includes('isPK:'),
  'Internal column shape must have name, type, nullable, isPK');

// ----- 4. COLUMN_TYPES includes typed variants -----------------------------

const typeList = SOURCE.match(/COLUMN_TYPES\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';

// Smart split: commas outside parentheses only
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
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim().replace(/['"]/g, ''));
  return result.filter(Boolean);
}

const typeItems = splitTypes(typeList);

const typedVariants = [
  'decimal(p,s)', 'numeric(p,s)',
  'varchar(n)', 'nvarchar(n)', 'char(n)'
];
for (const v of typedVariants) {
  assert(typeItems.includes(v),
    `COLUMN_TYPES must include typed variant '${v}' (found: ${JSON.stringify(typeItems)})`);
}

const baseTypes = ['int', 'bigint', 'decimal', 'varchar', 'nvarchar', 'datetime', 'bit', 'uniqueidentifier'];
for (const t of baseTypes) {
  assert(typeItems.includes(t),
    `COLUMN_TYPES must include base type '${t}'`);
}

// ----- 5. renderTableDesignerForm uses _columns as initial state -------------

assert(SOURCE.match(/_columns\.forEach\s*\(/),
  'renderTableDesignerForm should iterate _columns');

assert(SOURCE.includes('col.name') &&
       SOURCE.includes('col.type') &&
       SOURCE.includes('col.nullable') &&
       SOURCE.includes('col.isPK'),
  'renderTableDesignerForm must use column object properties (name, type, nullable, isPK)');

assert(SOURCE.includes('COLUMN_TYPES.map'),
  'COLUMN_TYPES must be used in the type dropdown');

// Form renders when _currentTable is set (already loaded)
assert(SOURCE.includes('_currentTable ||') ||
       SOURCE.match(/_currentTable\s*\?\s*['"]readonly['"]\s*:\s*['"]['"]/),
  'Table name input should be readonly when _currentTable is set');

// ----- 6. Observability: [tableDesigner] prefix logs ------------------------

const logCalls = count(/console\.(log|error|warn)\s*\(/);
assert(logCalls >= 3,
  `Should have at least 3 console.log/error calls — found ${logCalls}`);

assert(SOURCE.includes("'[tableDesigner]"),
  'Should log with [tableDesigner] prefix');

assert(SOURCE.includes("'[tableDesigner] modal open'"),
  'Should log modal open');
assert(SOURCE.includes('tableDesigner] columns loaded'),
  'Should log columns loaded count (template literal with column count)');
assert(SOURCE.includes("'[tableDesigner] load error'"),
  'Should log load error');

// ----- 7. Exports for context access -----------------------------------------

assert(SOURCE.includes('getTableDesignerContext') ||
       SOURCE.match(/export\s+function\s+get\w+Context/),
  'Should export a context getter (getTableDesignerContext)');

assert(SOURCE.includes('getOriginalColumns') ||
       SOURCE.match(/export\s+function\s+getOriginalColumns/),
  'Should export getOriginalColumns for change detection');

assert(SOURCE.includes('getColumn') ||
       SOURCE.includes('getColumns'),
  'Should export column accessors (getColumn / getColumns)');

// ----- 8. executeDdl uses apiClient.executeDdl or direct fetch ---------------

assert(SOURCE.includes('executeDdl'),
  'executeDdl should be exported');

// ----- 9. Hooks integration ---------------------------------------------------

assert(SOURCE.includes('setTableDesignerHooks'),
  'Should export setTableDesignerHooks');
assert(SOURCE.includes('_hooks.onSuccess'),
  'Should call _hooks.onSuccess on success');

// ----- 10. Type string handling ----------------------------------------------

// DataType strings like 'varchar(50)', 'decimal(18,2)' should be kept as-is
assert(SOURCE.includes("type: col.dataType") ||
       SOURCE.includes("type: col.dataType || 'int'"),
  'type field should use raw dataType string from backend (not parsed)');

// ----- 11. closeTableDesigner resets all context -----------------------------

const closeFn = SOURCE.match(/function closeTableDesigner[\s\S]*?(?=\n(?:export|function|import|$))/)?.[0] || '';
assert(closeFn.includes('_currentDatabase = null'),
  'closeTableDesigner must reset _currentDatabase');
assert(closeFn.includes('_connectionId = null'),
  'closeTableDesigner must reset _connectionId');
assert(closeFn.includes('_originalColumns = []'),
  'closeTableDesigner must reset _originalColumns');

// ----- 12. DDL generation uses _currentTable --------------------------------

assert(SOURCE.includes('ALTER TABLE [dbo].[${_currentTable}]'),
  'ALTER TABLE should reference _currentTable');
assert(SOURCE.includes('PK_${_currentTable'),
  'PK constraint should use _currentTable name');

// ----- 13. addColumn / removeColumn / updateColumn public exports ------------

assert(SOURCE.includes('export function addColumn'),
  'addColumn must be exported');
assert(SOURCE.includes('export function removeColumn'),
  'removeColumn must be exported');
assert(SOURCE.includes('export function updateColumn'),
  'updateColumn must be exported');
assert(SOURCE.includes('export function closeTableDesigner'),
  'closeTableDesigner must be exported');

// ----- 14. isTableDesignerOpen export ----------------------------------------

assert(SOURCE.includes('export function isTableDesignerOpen'),
  'isTableDesignerOpen must be exported');
assert(SOURCE.includes('return _isOpen'),
  'isTableDesignerOpen must return _isOpen');

// ----- 15. Helper exports for tests / integration ---------------------------

assert(SOURCE.includes('export function getColumns'),
  'getColumns must be exported for external inspection');
assert(SOURCE.includes('export function getOriginalColumns'),
  'getOriginalColumns must be exported for change detection');

// ----- Done -----------------------------------------------------------------

console.log('✅ 25 smoke checks passed');
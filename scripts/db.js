// Database layer: sql.js init, pristine clones, active DB, hint table updates.

import * as runtime from './runtime.js';
import { state, persist, base64ToBytes, bytesToBase64 } from './state.js';

let _sandboxSaveTimer = null;

// UI hooks — set by main.js after ui.js is wired, so db.js doesn't import ui.js
// directly (avoids circular imports between db / ui / sandbox).
let _hooks = {
  showFeedback: () => {},
  switchTab: () => {},
  renderSchema: () => {},
};
export function setDbHooks(hooks) { _hooks = { ..._hooks, ...hooks }; }

export function activeDb() {
  return runtime.cursor.currentMode === 'sandbox'
    ? runtime.sandboxDb[runtime.cursor.currentDbName]
    : runtime.liveDb[runtime.cursor.currentDbName];
}

export function cloneFromPristine(name) {
  return new runtime.SQL.Database(new Uint8Array(runtime.pristineDb[name]));
}

export function loadOrCreateSandboxDb(name) {
  const saved = state.sandboxStates && state.sandboxStates[name];
  if (saved) {
    try {
      runtime.sandboxDb[name] = new runtime.SQL.Database(base64ToBytes(saved));
      runtime.sandboxDirty[name] = true;
      return;
    } catch (e) {
      console.warn(`Could not restore saved sandbox DB ${name} — starting fresh`, e);
    }
  }
  runtime.sandboxDb[name] = cloneFromPristine(name);
  runtime.sandboxDirty[name] = false;
}

// Save a sandbox DB's binary state. Debounced so heavy-mutation scripts
// don't write a 16KB blob to localStorage on every statement.
export function persistSandboxDbDebounced(name) {
  clearTimeout(_sandboxSaveTimer);
  _sandboxSaveTimer = setTimeout(() => {
    try {
      const db = runtime.sandboxDb[name];
      if (!db) return;
      const bytes = db.export();
      state.sandboxStates = state.sandboxStates || {};
      state.sandboxStates[name] = bytesToBase64(bytes);
      persist(true);
    } catch (e) {
      console.warn('sandbox persist failed', e);
      if (String(e).match(/quota/i)) {
        _hooks.showFeedback('error', 'Storage full',
          'Your sandbox database is too large to save. Reset the DB or delete some snippets to free up space.');
        _hooks.switchTab('message');
      }
    }
  }, 500);
}

// Restore the live (practice) DB to its pristine state. Sandbox reset lives in sandbox.js.
export function resetPracticeDb() {
  const name = runtime.cursor.currentDbName;
  try {
    if (runtime.liveDb[name]) runtime.liveDb[name].close();
  } catch(e) {}
  runtime.liveDb[name] = cloneFromPristine(name);
  _hooks.renderSchema();
  document.querySelectorAll('.results-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'message'));
  _hooks.showFeedback('info', 'Database reset', `${name}.db has been restored to its initial state.`);
  updateDbStatus();
}

export function updateDbStatus() {
  const dot = document.getElementById('dbDot');
  const lbl = document.getElementById('dbStatusLabel');
  const info = document.getElementById('dbInfo');
  if (!dot || !lbl || !info) return;
  dot.classList.add('on');
  lbl.textContent = runtime.cursor.currentMode === 'sandbox' ? 'sandbox' : 'connected';
  const db = activeDb();
  if (!db) return;
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tables = res[0] ? res[0].values.map(r => r[0]) : [];
  info.textContent = `${runtime.cursor.currentDbName}.db — ${tables.length} table${tables.length === 1 ? '' : 's'}`;
  updateHintTables();
}

// Build a tables map for the SQL hint addon from the current active DB
export function updateHintTables() {
  const editor = runtime.editor;
  if (!editor) return;
  const db = activeDb();
  if (!db) return;
  const tableMap = {};
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = res[0] ? res[0].values.map(r => r[0]) : [];
    for (const t of tables) {
      const info = db.exec(`PRAGMA table_info("${t}")`);
      tableMap[t] = info[0] ? info[0].values.map(r => r[1]) : [];
    }
  } catch(e) { /* silent */ }
  editor.setOption('hintOptions', {
    tables: tableMap,
    completeSingle: false,
    closeOnUnfocus: true
  });
}

// ─── Inline Cell Editing Helpers ─────────────────────────────────

// Expose key functions for browser console testing
// These are also used by the UI layer for actual cell editing
window._inlineEdit = {
  getTableInfo,
  getPrimaryKeyColumns,
  formUpdateStatement,
  validateCellValue,
  getLastQueryTableName: () => runtime.cursor.lastQueryTableName
};

/**
 * Get column metadata for a table using PRAGMA table_info.
 * Returns array of { name, type, pk } objects.
 * pk > 0 means it's part of the primary key.
 */
export function getTableInfo(name) {
  const db = activeDb();
  if (!db) return [];
  try {
    const res = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
    if (!res[0]) return [];
    return res[0].values.map(row => ({
      name: String(row[1]),
      type: String(row[2] || 'TEXT').toUpperCase(),
      pk: Number(row[5]) || 0
    }));
  } catch (e) {
    console.warn('inlineEdit: getTableInfo error:', e.message);
    return [];
  }
}

/**
 * Get primary key columns for a table.
 * Returns array of { name, type } for columns that are part of the primary key.
 */
export function getPrimaryKeyColumns(name) {
  return getTableInfo(name).filter(col => col.pk > 0);
}

/**
 * Form an UPDATE statement given table, column, new value, and PK info.
 * pkColumns: array of { name, type } for each PK column
 * pkValues: array of values corresponding to pkColumns
 */
export function formUpdateStatement(tableName, columnName, newValue, pkColumns, pkValues) {
  const cols = getTableInfo(tableName);
  const colMeta = cols.find(c => c.name === columnName);
  if (!colMeta) {
    console.warn('inlineEdit: column not found:', columnName);
    return null;
  }

  // Determine if value needs quoting
  const isText = colMeta.type.includes('TEXT') || colMeta.type.includes('CHAR') || colMeta.type.includes('CLOB');
  const isNull = newValue === null || newValue === undefined || String(newValue).toLowerCase() === 'null';

  let formattedValue;
  if (isNull) {
    formattedValue = 'NULL';
  } else if (isText) {
    // Escape single quotes in string values
    formattedValue = "'" + String(newValue).replace(/'/g, "''") + "'";
  } else {
    // Numeric types - use as-is
    formattedValue = String(newValue);
  }

  // Build WHERE clause from PK columns
  const whereParts = pkColumns.map((pk, i) => {
    const pkIsText = pk.type.includes('TEXT') || pk.type.includes('CHAR') || pk.type.includes('CLOB');
    const val = pkValues[i];
    const pkFormatted = (val === null || val === undefined || String(val).toLowerCase() === 'null')
      ? 'NULL'
      : pkIsText
        ? "'" + String(val).replace(/'/g, "''") + "'"
        : String(val);
    return `${pk.name} = ${pkFormatted}`;
  });

  const where = whereParts.length > 0 ? ' WHERE ' + whereParts.join(' AND ') : '';
  return `UPDATE ${tableName} SET ${columnName} = ${formattedValue}${where}`;
}

/**
 * Validate a cell value against a column type.
 * Returns { ok: true } for valid values, { ok: false, reason: '...' } for invalid.
 */
export function validateCellValue(value, columnType) {
  const type = columnType.toUpperCase();

  // NULL is always valid
  if (value === null || value === undefined || String(value).toLowerCase() === 'null') {
    return { ok: true };
  }

  // TEXT, CHAR, CLOB types accept any string value
  if (type.includes('TEXT') || type.includes('CHAR') || type.includes('CLOB')) {
    return { ok: true };
  }

  // BLOB type accepts any value (stored as-is in hex typically)
  if (type.includes('BLOB')) {
    return { ok: true };
  }

  // Numeric types (INTEGER, REAL, NUMERIC, FLOAT, DOUBLE, DECIMAL, etc.)
  if (type.includes('INT') || type.includes('REAL') || type.includes('NUMERIC') ||
      type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('DECIMAL') ||
      type.includes('NUMERIC') || type.includes('NUMBER')) {

    const strVal = String(value).trim();

    // Check for empty string
    if (strVal === '') {
      return { ok: false, reason: 'Empty value not allowed for numeric column' };
    }

    // Check for whitespace-only
    if (strVal !== String(Number(strVal)).trim()) {
      // Try to detect actual numeric parsing failure
      const num = Number(strVal);
      if (isNaN(num)) {
        return { ok: false, reason: `"${strVal}" is not a valid number` };
      }
    }

    // For INTEGER types, check for decimal point
    if (type.includes('INT') && strVal.includes('.')) {
      const num = Number(strVal);
      if (Math.floor(num) !== num) {
        return { ok: false, reason: 'Decimal values not allowed for integer column' };
      }
    }

    return { ok: true };
  }

  // BOOLEAN type
  if (type.includes('BOOL')) {
    const strVal = String(value).toLowerCase().trim();
    if (['0', '1', 'true', 'false', 'yes', 'no'].includes(strVal)) {
      return { ok: true };
    }
    return { ok: false, reason: `"${value}" is not a valid boolean (use 0/1 or true/false)` };
  }

  // DATE/DATETIME types - accept common formats, but don't be too strict
  if (type.includes('DATE') || type.includes('TIME')) {
    // Very lenient date validation - just check it's not obviously bad
    const strVal = String(value).trim();
    if (strVal.length === 0) {
      return { ok: false, reason: 'Empty value not allowed for date column' };
    }
    return { ok: true };
  }

  // For any other type, accept as valid (TYPE column in SQLite)
  return { ok: true };
}

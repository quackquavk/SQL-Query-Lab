// Table Designer Modal - Visual DDL generator and executor.
// Generates CREATE/ALTER TABLE statements from form input.
// Supports both new table creation and editing of existing tables via diff-based DDL.

import { formatSql } from './format.js';
import { fetchTableColumns, fetchTableForeignKeys, executeDdlWithContext, refreshObjectNode } from './apiClient.js';

let _isOpen = false;
let _currentTable = null;
let _currentDatabase = null;
let _connectionId = null;
let _dirty = false;
let _columns = [];
let _originalColumns = []; // deep copy snapshot for change detection
let _foreignKeys = [];     // current FK list for the table
let _hooks = {};

// Column type options — covers both base types and typed variants with params.
// The dropdown shows common types; users may also type custom types directly.
const COLUMN_TYPES = [
  'int', 'bigint', 'smallint', 'tinyint', 'bit',
  'decimal', 'decimal(p,s)', 'numeric', 'numeric(p,s)',
  'float', 'real',
  'char', 'char(n)', 'varchar', 'varchar(n)', 'nvarchar', 'nvarchar(n)', 'text', 'ntext',
  'datetime', 'date', 'time', 'uniqueidentifier'
];

// Open table designer — async internally so it can await column loading.
export async function openTableDesigner(tableName = null, database = null, connectionId = null) {
  _currentTable = tableName;
  _currentDatabase = database;
  _connectionId = connectionId;
  _dirty = false;
  _foreignKeys = [];

  console.log('[tableDesigner] modal open', { tableName, database, connectionId });

  if (tableName) {
    try {
      _columns = await loadExistingColumns(tableName);
      _originalColumns = _columns.map(col => ({ ...col }));
      console.log(`[tableDesigner] columns loaded ${_columns.length}`);

      // Load FK constraints for existing tables
      try {
        const fkResult = await fetchTableForeignKeys(_connectionId, _currentDatabase, tableName);
        _foreignKeys = fkResult.foreignKeys || [];
      } catch (fkErr) {
        console.warn('[tableDesigner] failed to load FKs', fkErr);
        _foreignKeys = [];
      }
    } catch (err) {
      console.error('[tableDesigner] load error', err);
      _columns = [];
      _originalColumns = [];
    }
  } else {
    _columns = [{ name: '', type: 'int', nullable: true, isPK: false, defaultVal: null }];
    _originalColumns = [];
  }

  _isOpen = true;
  renderTableDesignerModal();
}

// Load existing columns from the backend via apiClient.
async function loadExistingColumns(tableName) {
  const result = await fetchTableColumns(_connectionId, _currentDatabase, tableName);
  // Map backend shape: { name, dataType, isNullable, isPrimaryKey } → internal shape.
  return (result.columns || []).map(col => ({
    name: col.name || '',
    type: col.dataType || 'int',
    nullable: col.isNullable ?? true,
    isPK: col.isPrimaryKey ?? false,
    defaultVal: col.defaultValue ?? null
  }));
}

// Close table designer
export function closeTableDesigner() {
  if (_dirty) {
    if (!confirm('You have unsaved changes. Discard?')) {
      return;
    }
  }
  _isOpen = false;
  _currentTable = null;
  _currentDatabase = null;
  _connectionId = null;
  _dirty = false;
  _columns = [];
  _originalColumns = [];
  _foreignKeys = [];
  removeTableDesignerModal();
}

// Add a new column
export function addColumn() {
  _columns.push({ name: '', type: 'int', nullable: true, isPK: false, defaultVal: null });
  _dirty = true;
  renderTableDesignerForm();
}

// Remove a column
export function removeColumn(index) {
  if (index < 0 || index >= _columns.length) return;
  _columns.splice(index, 1);
  _dirty = true;
  renderTableDesignerForm();
}

// Update a column property
export function updateColumn(index, field, value) {
  if (index < 0 || index >= _columns.length) return;
  _columns[index][field] = value;
  _dirty = true;
  renderDDLPreview();
}

// Get column at index (for external queries)
export function getColumn(index) {
  return _columns[index] || null;
}

// Get all columns (for external queries)
export function getColumns() {
  return _columns;
}

// Get original column snapshot (for change detection)
export function getOriginalColumns() {
  return _originalColumns;
}

// Build the column definition string for a single column.
function _colDef(col) {
  let def = `  ${col.name} ${col.type}`;
  if (!col.nullable) def += ' NOT NULL';
  if (col.defaultVal) def += ` DEFAULT ${col.defaultVal}`;
  return def;
}

// Generate DDL statement.
// Uses diff-based approach when editing an existing table (_originalColumns has data),
// otherwise generates a full CREATE TABLE statement.
export function generateDdl() {
  if (_columns.length === 0) return '';

  const namedCols = _columns.filter(col => col.name.trim());
  if (namedCols.length === 0) return '';

  // If we have an original snapshot and a table name, generate ALTER statements via diff
  if (_currentTable && _originalColumns.length > 0) {
    return _generateDiffDdl(_columns, _originalColumns);
  }

  // New table — generate full CREATE TABLE
  const colDefs = namedCols.map(_colDef);
  const pkCols = namedCols.filter(col => col.isPK);
  const pkClause = pkCols.length > 0
    ? `,\n  CONSTRAINT [PK_NewTable] PRIMARY KEY (${pkCols.map(c => c.name).join(', ')})`
    : '';

  return `CREATE TABLE [dbo].[${_currentTable || 'NewTable'}] (\n${colDefs.join(',\n')}${pkClause}\n);`;
}

/**
 * Generate ALTER TABLE DDL by diffing current vs original column state.
 *
 * Diff rules:
 * - Column in original but not current → DROP COLUMN
 * - Column in both but type/nullable changed → ALTER COLUMN
 * - Column in both but name changed → sp_rename
 * - Column in current but not original → ADD COLUMN (handled via generateDdl flow)
 * - PK changed → ADD/DROP CONSTRAINT for PK
 *
 * @param {Array}  currentColumns  - _columns (edited state)
 * @param {Array}  originalColumns - _originalColumns (loaded from DB)
 * @returns {string} - Multi-statement DDL string
 */
export function _generateDiffDdl(currentColumns, originalColumns) {
  const stmts = [];
  const tableName = _currentTable || 'NewTable';
  const quotedTable = `[dbo].[${tableName}]`;

  // Build name → column maps for O(1) lookup
  const origMap = new Map();
  originalColumns.forEach(col => origMap.set(col.name.toLowerCase(), col));

  const currMap = new Map();
  currentColumns.forEach(col => currMap.set(col.name.toLowerCase(), col));

  // 1. Drop columns that exist in original but not in current
  for (const orig of originalColumns) {
    const key = orig.name.toLowerCase();
    if (!currMap.has(key)) {
      // Check if it's the last column — SQL Server requires at least one column
      stmts.push(`ALTER TABLE ${quotedTable} DROP COLUMN [${orig.name}];`);
    }
  }

  // 2. For columns in both: check for renames, type/nullable changes
  for (const curr of currentColumns) {
    const key = curr.name.toLowerCase();
    const orig = origMap.get(key);

    if (!orig) {
      // New column — ADD COLUMN
      stmts.push(`ALTER TABLE ${quotedTable} ADD ${_colDef(curr).trim()};`);
      continue;
    }

    // Column exists in both — check for changes
    if (orig.name !== curr.name) {
      // Rename via sp_rename
      stmts.push(`EXEC sp_rename '${tableName}.${orig.name}', '${curr.name}', 'COLUMN';`);
    }

    const origType = (orig.type || '').toLowerCase().trim();
    const currType = (curr.type || '').toLowerCase().trim();

    if (origType !== currType) {
      // Type changed
      const nullableClause = curr.nullable ? 'NULL' : 'NOT NULL';
      stmts.push(`ALTER TABLE ${quotedTable} ALTER COLUMN [${curr.name}] ${curr.type} ${nullableClause};`);
    } else {
      // Type same but nullable may have changed
      const origNullable = orig.nullable ?? true;
      if (origNullable !== curr.nullable) {
        const nullableClause = curr.nullable ? 'NULL' : 'NOT NULL';
        stmts.push(`ALTER TABLE ${quotedTable} ALTER COLUMN [${curr.name}] ${curr.type} ${nullableClause};`);
      }
    }
  }

  // 3. Handle PK changes
  const origPKs = originalColumns.filter(c => c.isPK).map(c => c.name.toLowerCase());
  const currPKs = currentColumns.filter(c => c.isPK && c.name.trim()).map(c => c.name.toLowerCase());

  const origPKSet = new Set(origPKs);
  const currPKSet = new Set(currPKs);

  // Drop existing PK if it changed
  if (origPKs.length > 0) {
    const pkSame = origPKs.length === currPKs.length && origPKs.every(n => currPKSet.has(n));
    if (!pkSame) {
      stmts.push(`ALTER TABLE ${quotedTable} DROP CONSTRAINT [PK_${tableName}];`);
    }
  }

  // Add new PK if current has PKs and they differ from original
  if (currPKs.length > 0) {
    const pkSame = origPKs.length === currPKs.length && origPKs.every(n => currPKSet.has(n));
    if (!pkSame) {
      stmts.push(`ALTER TABLE ${quotedTable} ADD CONSTRAINT [PK_${tableName}] PRIMARY KEY (${currPKs.map(n => `[${n}]`).join(', ')});`);
    }
  }

  return stmts.join('\n');
}

// Render DDL preview
function renderDDLPreview() {
  const ddl = generateDdl();
  const previewEl = document.getElementById('td-ddl-preview');
  if (previewEl) {
    previewEl.textContent = ddl;
    highlightDdl(previewEl);
  }

  const executeBtn = document.getElementById('td-execute-btn');
  if (executeBtn) {
    executeBtn.disabled = !ddl.trim();
  }
}

// Simple DDL syntax highlighting
function highlightDdl(el) {
  if (!el) return;
  const keywords = ['CREATE', 'ALTER', 'TABLE', 'ADD', 'DROP', 'PRIMARY', 'KEY', 'NOT', 'NULL',
    'DEFAULT', 'CONSTRAINT', 'REFERENCES', 'FOREIGN', 'EXEC', 'sp_rename'];
  let html = el.textContent;
  keywords.forEach(kw => {
    html = html.replace(new RegExp(`\\b${kw}\\b`, 'g'), `<span class="kw">${kw}</span>`);
  });
}

// Get connection context for API calls.
// Tries runtime.cursor first, then falls back to direct _ vars.
function _getConnectionContext() {
  const rc = window.__runtime?.cursor;
  return {
    server: rc?.activeServer || '',
    authType: rc?.authType || 'sql',
    credentials: rc?.credentials || {},
    database: _currentDatabase || rc?.currentDbName || 'master'
  };
}

// Execute DDL against backend using connection context headers.
export async function executeDdl(ddl) {
  const ctx = _getConnectionContext();
  return executeDdlWithContext(ddl, ctx);
}

// Handle execute button click
async function handleExecute() {
  const ddl = generateDdl();
  if (!ddl.trim()) return;

  const errorEl = document.getElementById('td-error');
  if (errorEl) errorEl.textContent = '';

  try {
    const result = await executeDdl(ddl);
    if (result.error) {
      if (errorEl) errorEl.textContent = result.error;
      console.error('[tableDesigner] DDL execute error', result.error);
      return;
    }

    console.log('[tableDesigner] DDL execute success');

    _dirty = false;

    // Refresh the tree node in Object Explorer
    if (_currentTable && _connectionId) {
      try {
        console.log('[tableDesigner] tree refresh requested');
        await refreshObjectNode(_connectionId, _currentDatabase, 'table', _currentTable);
      } catch (refreshErr) {
        console.warn('[tableDesigner] tree refresh failed (non-blocking)', refreshErr);
      }
    }

    if (typeof toast === 'function') {
      toast('Table created/altered successfully', 'success');
    }
    if (_hooks.onSuccess) {
      _hooks.onSuccess();
    }
    closeTableDesigner();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
    console.error('[tableDesigner] DDL execute error', err.message);
  }
}

// Render the table designer modal
function renderTableDesignerModal() {
  const existingModal = document.getElementById('table-designer-modal');
  if (existingModal) existingModal.remove();

  const isExisting = !!_currentTable;

  const modalHtml = `
    <div class="modal-backdrop" id="td-backdrop">
      <div class="modal" id="td-modal" style="max-width: 1100px;">
        <div class="modal-head">
          <h2>Table Designer${isExisting ? ' — ' + _currentTable : ''}</h2>
          <button class="close-btn" id="td-close">×</button>
        </div>
        <div id="td-content"></div>
        <div id="td-error" class="td-error"></div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  document.getElementById('td-close').addEventListener('click', closeTableDesigner);
  document.getElementById('td-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'td-backdrop') closeTableDesigner();
  });

  renderTableDesignerForm();

  requestAnimationFrame(() => {
    document.getElementById('td-backdrop').classList.add('open');
  });
}

// Render the form content — uses _columns as the source of truth.
// When _currentTable is already set (existing table), _columns is
// pre-populated from the backend load; the form renders those values.
function renderTableDesignerForm() {
  const content = document.getElementById('td-content');
  if (!content) return;

  const isExisting = !!_currentTable;

  content.innerHTML = `
    <div class="td-layout">
      <div class="td-form-area">
        <div class="td-table-name-row">
          <label>Table Name</label>
          <input type="text" id="td-table-name" value="${_currentTable || ''}"
            placeholder="NewTable" ${isExisting ? 'readonly' : ''} />
        </div>
        <div class="td-form-grid">
          <div class="td-grid-header">
            <span>Column Name</span>
            <span>Data Type</span>
            <span>Nullable</span>
            <span>PK</span>
            <span></span>
          </div>
          <div id="td-columns-grid"></div>
        </div>
        <button class="td-add-col-btn" id="td-add-col">+ Add Column</button>

        ${isExisting ? `
        <div class="td-fk-section">
          <div class="td-fk-header">
            <h4>Foreign Keys</h4>
            <button class="td-add-fk-btn" id="td-add-fk">+ Add Foreign Key</button>
          </div>
          <div id="td-fk-list"></div>
          <div id="td-fk-form" class="td-fk-form" style="display:none;"></div>
        </div>
        ` : ''}
      </div>
      <div class="td-preview-area">
        <div class="td-preview-header">DDL Preview</div>
        <pre id="td-ddl-preview" class="td-ddl-preview"></pre>
        <button class="td-execute-btn" id="td-execute-btn" disabled>Execute DDL</button>
      </div>
    </div>
  `;

  // Render columns (already populated in _columns from loadExistingColumns or default)
  const grid = document.getElementById('td-columns-grid');
  _columns.forEach((col, i) => {
    const row = document.createElement('div');
    row.className = 'td-grid-row';
    row.innerHTML = `
      <input type="text" class="td-col-name" data-index="${i}" value="${col.name}"
        placeholder="ColumnName" />
      <select class="td-type-dropdown" data-index="${i}">
        ${COLUMN_TYPES.map(t => `<option value="${t}" ${col.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <input type="checkbox" class="td-nullable" data-index="${i}" ${col.nullable ? 'checked' : ''} />
      <input type="checkbox" class="td-pk" data-index="${i}" ${col.isPK ? 'checked' : ''} />
      <button class="td-remove-col" data-index="${i}">×</button>
    `;
    grid.appendChild(row);
  });

  // Render FK list for existing tables
  if (isExisting) {
    renderFkList();

    document.getElementById('td-add-fk').addEventListener('click', () => {
      showFkForm();
    });
  }

  // Event listeners
  document.getElementById('td-add-col').addEventListener('click', addColumn);

  grid.querySelectorAll('.td-col-name').forEach(input => {
    input.addEventListener('input', (e) => {
      updateColumn(parseInt(e.target.dataset.index), 'name', e.target.value);
    });
  });

  grid.querySelectorAll('.td-type-dropdown').forEach(select => {
    select.addEventListener('change', (e) => {
      updateColumn(parseInt(e.target.dataset.index), 'type', e.target.value);
    });
  });

  grid.querySelectorAll('.td-nullable').forEach(cb => {
    cb.addEventListener('change', (e) => {
      updateColumn(parseInt(e.target.dataset.index), 'nullable', e.target.checked);
    });
  });

  grid.querySelectorAll('.td-pk').forEach(cb => {
    cb.addEventListener('change', (e) => {
      updateColumn(parseInt(e.target.dataset.index), 'isPK', e.target.checked);
    });
  });

  grid.querySelectorAll('.td-remove-col').forEach(btn => {
    btn.addEventListener('click', (e) => {
      removeColumn(parseInt(e.target.dataset.index));
    });
  });

  document.getElementById('td-execute-btn').addEventListener('click', handleExecute);

  const tableNameInput = document.getElementById('td-table-name');
  if (tableNameInput && !_currentTable) {
    tableNameInput.addEventListener('input', (e) => {
      _currentTable = e.target.value || 'NewTable';
      _dirty = true;
      renderDDLPreview();
    });
  }
}

// Render the FK constraint list for existing tables.
function renderFkList() {
  const listEl = document.getElementById('td-fk-list');
  if (!listEl) return;

  if (_foreignKeys.length === 0) {
    listEl.innerHTML = '<div class="td-fk-empty">No foreign keys defined</div>';
    return;
  }

  listEl.innerHTML = _foreignKeys.map((fk, i) => `
    <div class="td-fk-row">
      <span class="td-fk-name">${fk.constraintName}</span>
      <span class="td-fk-detail">[${fk.fromColumn}] → ${fk.toTable}(${fk.toColumn})</span>
      <button class="td-fk-remove" data-index="${i}">×</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.td-fk-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      _foreignKeys.splice(idx, 1);
      _dirty = true;
      renderFkList();
    });
  });
}

// Show the FK add/edit form.
function showFkForm(editIndex = null) {
  const formEl = document.getElementById('td-fk-form');
  if (!formEl) return;

  const editing = editIndex !== null && _foreignKeys[editIndex] !== undefined;
  const fk = editing ? _foreignKeys[editIndex] : null;

  // Populate FK constraint name with a default
  const defaultName = fk ? fk.constraintName : `FK_${_currentTable}_ref`;

  formEl.innerHTML = `
    <div class="td-fk-form-row">
      <label>Constraint Name</label>
      <input type="text" id="td-fk-name" value="${defaultName}" placeholder="FK_ConstraintName" />
    </div>
    <div class="td-fk-form-row">
      <label>From Column</label>
      <select id="td-fk-from-col">
        ${_columns.map(c => `<option value="${c.name}" ${fk && fk.fromColumn === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="td-fk-form-row">
      <label>References Table</label>
      <input type="text" id="td-fk-to-table" value="${fk ? fk.toTable : ''}" placeholder="ReferencedTable" />
    </div>
    <div class="td-fk-form-row">
      <label>References Column</label>
      <input type="text" id="td-fk-to-col" value="${fk ? fk.toColumn : ''}" placeholder="ReferencedColumn" />
    </div>
    <div class="td-fk-form-actions">
      <button class="td-fk-save-btn" id="td-fk-save">${editing ? 'Update' : 'Add'} FK</button>
      <button class="td-fk-cancel-btn" id="td-fk-cancel">Cancel</button>
    </div>
  `;

  formEl.style.display = 'block';

  document.getElementById('td-fk-save').addEventListener('click', () => {
    const nameVal = document.getElementById('td-fk-name').value.trim();
    const fromCol = document.getElementById('td-fk-from-col').value;
    const toTable = document.getElementById('td-fk-to-table').value.trim();
    const toCol = document.getElementById('td-fk-to-col').value.trim();

    if (!nameVal || !fromCol || !toTable || !toCol) {
      alert('All FK fields are required.');
      return;
    }

    const fkEntry = { constraintName: nameVal, fromColumn: fromCol, toTable: toTable, toColumn: toCol };

    if (editing) {
      _foreignKeys[editIndex] = fkEntry;
    } else {
      _foreignKeys.push(fkEntry);
    }

    _dirty = true;
    formEl.style.display = 'none';
    renderFkList();
    renderDDLPreview(); // Update preview with ADD CONSTRAINT statement
  });

  document.getElementById('td-fk-cancel').addEventListener('click', () => {
    formEl.style.display = 'none';
  });
}

// Generate FK DDL statements (for DDL preview inclusion).
// Called when appending FK constraints to the main DDL preview.
export function _generateFkDdl() {
  if (_foreignKeys.length === 0) return '';

  const tableName = _currentTable || 'NewTable';
  return _foreignKeys.map(fk =>
    `ALTER TABLE [dbo].[${tableName}] ADD CONSTRAINT [${fk.constraintName}] FOREIGN KEY ([${fk.fromColumn}]) REFERENCES [${fk.toTable}]([${fk.toColumn}]);`
  ).join('\n');
}

// Remove the modal from DOM
function removeTableDesignerModal() {
  const backdrop = document.getElementById('td-backdrop');
  if (backdrop) backdrop.remove();
}

// Set hooks for external integration
export function setTableDesignerHooks({ onSuccess, onTableEdit }) {
  _hooks.onSuccess = onSuccess;
  _hooks.onTableEdit = onTableEdit;
}

// Check if modal is open
export function isTableDesignerOpen() {
  return _isOpen;
}

// Re-export current context for callers that need to know the active database/connection
export function getTableDesignerContext() {
  return {
    table: _currentTable,
    database: _currentDatabase,
    connectionId: _connectionId
  };
}
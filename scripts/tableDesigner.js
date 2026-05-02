// Table Designer Modal - Visual DDL generator and executor.
// Generates CREATE/ALTER TABLE statements from form input.

import { formatSql } from './format.js';
import { fetchTableColumns } from './apiClient.js';

let _isOpen = false;
let _currentTable = null;
let _currentDatabase = null;
let _connectionId = null;
let _dirty = false;
let _columns = [];
let _originalColumns = []; // deep copy snapshot for change detection
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

  console.log('[tableDesigner] modal open', { tableName, database, connectionId });

  if (tableName) {
    try {
      _columns = await loadExistingColumns(tableName);
      _originalColumns = _columns.map(col => ({ ...col }));
      console.log(`[tableDesigner] columns loaded ${_columns.length}`);
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

// Generate DDL statement
export function generateDdl() {
  if (_columns.length === 0) return '';

  const colDefs = _columns
    .filter(col => col.name.trim())
    .map(col => {
      let def = `  ${col.name} ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.defaultVal) def += ` DEFAULT ${col.defaultVal}`;
      return def;
    });

  if (colDefs.length === 0) return '';

  const pkCols = _columns.filter(col => col.isPK && col.name.trim());
  const pkClause = pkCols.length > 0
    ? `,\n  CONSTRAINT [PK_${_currentTable || 'NewTable'}] PRIMARY KEY (${pkCols.map(c => c.name).join(', ')})`
    : '';

  if (_currentTable) {
    // ALTER TABLE
    return `ALTER TABLE [dbo].[${_currentTable}] ADD (\n${colDefs.join(',\n')}${pkClause}\n);`;
  } else {
    // CREATE TABLE
    return `CREATE TABLE [dbo].[NewTable] (\n${colDefs.join(',\n')}${pkClause}\n);`;
  }
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
  const keywords = ['CREATE', 'ALTER', 'TABLE', 'ADD', 'PRIMARY', 'KEY', 'NOT', 'NULL', 'DEFAULT', 'CONSTRAINT'];
  let html = el.textContent;
  keywords.forEach(kw => {
    html = html.replace(new RegExp(`\\b${kw}\\b`, 'g'), `<span class="kw">${kw}</span>`);
  });
}

// Execute DDL against backend
export async function executeDdl(ddl) {
  const res = await fetch('/api/execute-ddl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ddl })
  });
  return res.json();
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
      return;
    }

    _dirty = false;
    if (typeof toast === 'function') {
      toast('Table created/altered successfully', 'success');
    }
    if (_hooks.onSuccess) {
      _hooks.onSuccess();
    }
    closeTableDesigner();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
  }
}

// Render the table designer modal
function renderTableDesignerModal() {
  const existingModal = document.getElementById('table-designer-modal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div class="modal-backdrop" id="td-backdrop">
      <div class="modal" id="td-modal" style="max-width: 900px;">
        <div class="modal-head">
          <h2>Table Designer</h2>
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

  content.innerHTML = `
    <div class="td-layout">
      <div class="td-form-area">
        <div class="td-table-name-row">
          <label>Table Name</label>
          <input type="text" id="td-table-name" value="${_currentTable || ''}"
            placeholder="NewTable" ${_currentTable ? 'readonly' : ''} />
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

  renderDDLPreview();
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
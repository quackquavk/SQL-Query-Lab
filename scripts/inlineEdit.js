// Inline cell editing for sandbox result tables.
// Double-clicking a cell switches it to an input; Enter commits UPDATE; Escape cancels.

import { showFeedback } from './ui.js';
import { activeDb } from './db.js';
import * as runtime from './runtime.js';
import {
  getTableInfo,
  getPrimaryKeyColumns,
  formUpdateStatement,
  validateCellValue
} from './db.js';

// Track the currently active input element and its parent table.
let _activeInput = null;
let _activeTable = null;

// Expose for browser-console testing / verification.
window._inlineEdit = { getActive: () => _activeInput, getTable: () => _activeTable };

/**
 * Attach double-click handlers to all <td> cells inside tableEl.
 * Checks sandbox mode before enabling.
 */
export function enableInlineEditing(tableEl) {
  if (!tableEl) return;

  if (runtime.cursor.currentMode !== 'sandbox') return;

  const tds = tableEl.querySelectorAll('td');
  if (tds.length === 0) return;

  tds.forEach(td => {
    td.style.cursor = 'text';
    td.addEventListener('dblclick', () => startEditing(td), { once: false });
  });

  // Mark the table as inline-editing capable.
  tableEl.dataset.inlineEditing = 'true';
  console.log('inlineEdit: enabled on', tableEl);
}

/**
 * Start inline editing mode on a <td> cell.
 * Replaces text with an <input>, saves original value in td.dataset.originalValue.
 * Checks that the result set includes PK column(s) before allowing edit.
 */
export function startEditing(td) {
  if (!td) return;

  // Only allow in sandbox mode.
  if (runtime.cursor.currentMode !== 'sandbox') return;

  // If already editing, do nothing.
  if (_activeInput) return;

  const table = td.closest('table.result-table');
  if (!table) return;

  // Check that the table has the required data attributes.
  const tableName = table.dataset.table;
  if (!tableName) {
    showFeedback('error', 'Cannot edit', 'Result set does not include a table name. Run a SELECT FROM table statement.');
    return;
  }

  const colIdx = td.dataset.col;
  const rowIdx = td.dataset.row;
  if (colIdx === undefined || rowIdx === undefined) {
    showFeedback('error', 'Cannot edit', 'Result set must include primary key column(s) for UPDATE.');
    return;
  }

  // Read column name from the header cell at the same column index.
  const headers = table.querySelectorAll('th');
  const colName = headers[colIdx]?.textContent?.trim();
  if (!colName) return;

  // Verify PK columns are present in the result set.
  const pkCols = getPrimaryKeyColumns(tableName);
  if (!pkCols || pkCols.length === 0) {
    showFeedback('error', 'Cannot edit', `"${tableName}" has no primary key — UPDATE requires one.`);
    return;
  }

  // Check that every PK column appears in the result set headers.
  const headerNames = Array.from(headers).map(h => h.textContent?.trim() || '');
  const missingPK = pkCols.filter(pk => !headerNames.includes(pk.name));
  if (missingPK.length > 0) {
    showFeedback('error', 'Cannot edit',
      `Result set must include primary key column(s) for UPDATE. Missing: ${missingPK.map(p => p.name).join(', ')}`);
    return;
  }

  // Save the original value for restore-on-cancel.
  const originalText = td.textContent.replace(/\s*NULL\s*/i, 'NULL').trim();
  td.dataset.originalValue = originalText;

  // Build the original <td> content as a display span.
  const displaySpan = document.createElement('span');
  displaySpan.className = 'inline-edit-display';
  displaySpan.textContent = originalText;
  displaySpan.style.display = 'none';

  // Create the input element.
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = originalText;

  // Replace the text node content — preserve the <td> element.
  const textNode = td.firstChild;
  td.textContent = '';
  td.appendChild(displaySpan);
  td.appendChild(input);

  _activeInput = input;
  _activeTable = table;

  // Mark the table as actively editing.
  table.dataset.editing = 'true';

  // Focus and position cursor at end.
  input.focus();
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;

  // Wire keyboard handler.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // Prevent Enter from bubbling to CodeMirror.
      commitEdit(td, colName, tableName, headerNames, headers);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit(td);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation(); // Prevent Tab from stealing focus from the input.
      // Commit current, then move to next cell.
      commitEdit(td, colName, tableName, headerNames, headers);
      moveToNextCell(td, colIdx, rowIdx, headers);
    }
  });

  // Clear error styling on input.
  input.addEventListener('input', () => {
    input.classList.remove('cell-invalid');
    displaySpan.style.display = 'none';
  });
}

/**
 * Commit the edit: validate the new value, build and execute UPDATE, re-render results.
 */
function commitEdit(td, colName, tableName, headerNames, headers) {
  if (!_activeInput) return;

  const input = _activeInput;
  const newValue = input.value.trim();
  const originalValue = td.dataset.originalValue || '';

  // Remove listeners to avoid double-trigger.
  input.removeEventListener('keydown', () => {});

  // Validate.
  const colType = _getColumnType(tableName, colName);
  const validation = validateCellValue(newValue, colType);
  if (!validation.ok) {
    input.classList.add('cell-invalid');
    showFeedback('error', 'Invalid value', validation.reason);
    // Keep focus on the input.
    setTimeout(() => { input.focus(); input.selectionStart = input.value.length; }, 0);
    return;
  }

  // Build WHERE clause from PK columns.
  const pkCols = getPrimaryKeyColumns(tableName);
  const pkColNames = pkCols.map(p => p.name);
  const pkValues = pkColNames.map(pkName => {
    const idx = headerNames.indexOf(pkName);
    if (idx === -1) return null;
    const pkCell = td.parentElement.querySelectorAll('td')[idx];
    return pkCell ? pkCell.textContent.trim() : null;
  });

  if (pkValues.some(v => v === null || v === undefined)) {
    showFeedback('error', 'Cannot update', 'Could not determine primary key values for this row.');
    cancelEdit(td);
    return;
  }

  // Generate and execute UPDATE.
  const sql = formUpdateStatement(tableName, colName, newValue, pkCols, pkValues);
  const db = activeDb();
  if (!db) {
    showFeedback('error', 'Database error', 'No active database for UPDATE.');
    cancelEdit(td);
    return;
  }

  try {
    db.exec(sql);
  } catch (e) {
    showFeedback('error', 'UPDATE failed', e.message);
    // Restore cell on error.
    restoreCell(td, originalValue);
    return;
  }

  // Success — briefly highlight then restore.
  td.classList.add('cell-modified');
  showFeedback('success', 'Updated', `${colName} = ${newValue} in ${tableName}`);

  // Sync the cell text to the new value so it reflects immediately.
  td.textContent = newValue;

  setTimeout(() => {
    td.classList.remove('cell-modified');
    // Clean up edit state without restoring cell text (already updated above).
    _activeInput = null;
    _activeTable = null;
    delete td.dataset.originalValue;
    const table = td.closest('table.result-table');
    if (table) table.dataset.editing = 'false';
  }, 350);
}

/**
 * Cancel editing and restore the original cell value.
 */
function cancelEdit(td) {
  if (!td) return;
  _activeInput = null;
  _activeTable = null;

  if (td.parentElement) {
    td.parentElement.dataset.editing = 'false';
  }

  restoreCell(td, td.dataset.originalValue || '');
}

/**
 * Restore the cell to its original text display (removes input, restores text).
 */
function restoreCell(td, originalValue) {
  td.textContent = originalValue;
  delete td.dataset.originalValue;
  _activeInput = null;
  _activeTable = null;
  const table = td.closest('table.result-table');
  if (table) table.dataset.editing = 'false';
}

/**
 * Move to the next editable cell after committing the current one.
 * Used for Tab key navigation.
 */
function moveToNextCell(currentTd, colIdx, rowIdx, headers) {
  const table = currentTd.closest('table.result-table');
  if (!table) return;

  const body = table.querySelector('tbody');
  if (!body) return;

  const rows = body.querySelectorAll('tr');
  const currentRowIdx = parseInt(rowIdx, 10);

  // Move to next row in same column.
  let nextRow = rows[currentRowIdx + 1];
  if (!nextRow) {
    // Wrap to first row.
    nextRow = rows[0];
  }

  if (nextRow) {
    const tds = nextRow.querySelectorAll('td');
    const nextTd = tds[colIdx];
    if (nextTd) {
      startEditing(nextTd);
    }
  }
}

/**
 * Get the SQLite column type for a given table and column name.
 */
function _getColumnType(tableName, colName) {
  const info = getTableInfo(tableName);
  const col = info.find(c => c.name === colName);
  return col ? col.type : 'TEXT';
}

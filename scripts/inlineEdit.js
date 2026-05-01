// Inline cell editing for sandbox result tables.
// Double-clicking a cell switches it to an input; Enter commits UPDATE; Escape cancels.

import { showFeedback } from './ui.js';
import { activeDb, persistSandboxDbDebounced } from './db.js';
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
let _lastKey = null; // Track last key to guard blur handler against Tab navigation

// Expose for browser-console testing / verification.
window._inlineEdit = { getActive: () => _activeInput, getTable: () => _activeTable, activateNext: activateNextCell };

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

  // Check that every PK column appears in the result set headers (DOM check).
  const headerNames = Array.from(headers).map(h => h.textContent?.trim() || '');
  const missingPK = pkCols.filter(pk => !headerNames.includes(pk.name));
  if (missingPK.length > 0) {
    showFeedback('error', 'Cannot edit',
      `Result set must include primary key column(s) for UPDATE. Missing: ${missingPK.map(p => p.name).join(', ')}`);
    return;
  }

  // Cross-check: verify against lastUserResult.columns to ensure the query
  // actually returned the PK data (not just that a column with that name exists
  // in the table schema — it must be in the SELECT).
  const result = runtime.cursor.lastUserResult;
  if (result && result.columns) {
    const resultColNames = result.columns.map(c => (typeof c === 'string' ? c : c.name || '').trim());
    const missingFromResult = pkCols.filter(pk => !resultColNames.includes(pk.name));
    if (missingFromResult.length > 0) {
      showFeedback('error', 'Cannot edit',
        `Result set must include primary key column(s) for UPDATE. Missing: ${missingFromResult.map(p => p.name).join(', ')}`);
      return;
    }
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
      _handleEnter(td, colName, tableName, headerNames, headers);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit(td);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      _lastKey = 'Tab'; // Signal blur handler that this is a Tab, not a click-away.
      // Commit current; only move if commit succeeds.
      _handleTab(td, colName, tableName, headerNames, headers);
    }
  });

  // Blur handler — clicking outside the input cancels the edit.
  // _lastKey guard prevents cancel on Tab navigation (Tab fires blur + keydown before tab focus moves).
  input.addEventListener('blur', () => {
    if (_lastKey === 'Tab') {
      // Tab navigation: blur is expected, will be handled by _handleTab → activateNextCell.
      return;
    }
    // Real click-outside: cancel the edit.
    if (_activeInput) {
      cancelEdit(td);
    }
  });

  // Clear error styling on input.
  input.addEventListener('input', () => {
    input.classList.remove('cell-invalid');
    displaySpan.style.display = 'none';
  });
}

/**
 * Handle Enter key: commit the edit, then clean up on success.
 * On validation error the input stays focused and the caller returns early.
 */
function _handleEnter(td, colName, tableName, headerNames, headers) {
  let committed = false;
  commitEdit(td, colName, tableName, headerNames, headers, (ok) => { committed = ok; });
}

/**
 * Handle Tab key: commit the current cell, then advance to next cell.
 * Only advances after a successful commit — validation or SQL errors keep
 * the input focused in the current cell.
 */
function _handleTab(td, colName, tableName, headerNames, headers) {
  let committed = false;
  // Clear the input guard early so activateNextCell → startEditing can run.
  // The 350ms cleanup timer still fires and clears CSS state.
  _activeInput = null;
  _activeTable = null;
  commitEdit(td, colName, tableName, headerNames, headers, (ok) => { committed = ok; });
  // Clear _lastKey after commit so blur can distinguish click-outside from Tab.
  _lastKey = null;
  if (committed) {
    activateNextCell(td, td.dataset.col, td.dataset.row, headers);
  }
}

/**
 * Commit the edit: validate the new value, build and execute UPDATE, re-render results.
 * Calls onComplete(true) on success, onComplete(false) on failure/validation error.
 */
function commitEdit(td, colName, tableName, headerNames, headers, onComplete) {
  if (!_activeInput) { onComplete?.(false); return; }

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
    onComplete?.(false);
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
    onComplete?.(false);
    return;
  }

  // Generate and execute UPDATE.
  const sql = formUpdateStatement(tableName, colName, newValue, pkCols, pkValues);
  const db = activeDb();
  if (!db) {
    showFeedback('error', 'Database error', 'No active database for UPDATE.');
    cancelEdit(td);
    onComplete?.(false);
    return;
  }

  try {
    db.exec(sql);
  } catch (e) {
    showFeedback('error', 'UPDATE failed', e.message);
    // Restore cell on error.
    restoreCell(td, originalValue);
    onComplete?.(false);
    return;
  }

  // Success — briefly highlight then restore.
  td.classList.add('cell-modified');
  showFeedback('success', 'Updated', `${colName} = ${newValue} in ${tableName}`);

  // Mark sandbox as dirty and schedule persistence.
  persistSandboxDbDebounced(runtime.cursor.currentDbName);

  // Sync the cell text to the new value so it reflects immediately.
  td.textContent = newValue;

  // Clear _activeInput BEFORE calling onComplete so that activateNextCell's
  // startEditing() check (which guards against a pre-existing input) passes.
  // The setTimeout only handles cosmetic cleanup (cell-modified class removal).
  _activeInput = null;
  _activeTable = null;
  delete td.dataset.originalValue;
  const table = td.closest('table.result-table');
  if (table) table.dataset.editing = 'false';

  // Signal success to the keyboard handler so it can advance to the next cell.
  onComplete?.(true);

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
 * Activate the next editable cell in column order (left-to-right, then wrap to next row).
 * If the current commit failed (validation or SQL error) this function is NOT called —
 * the input stays in place.
 */
export function activateNextCell(currentTd, colIdx, rowIdx, headers) {
  const table = currentTd.closest('table.result-table');
  if (!table) return;

  const allRows = Array.from(table.querySelectorAll('tbody tr'));
  const currentRowIdx = parseInt(rowIdx, 10);
  const currentColIdx = parseInt(colIdx, 10);

  // Collect all cells in the current row ordered by column index.
  const cellsInRow = allRows[currentRowIdx]
    ? Array.from(allRows[currentRowIdx].querySelectorAll('td'))
        .filter(td => td.dataset.col !== undefined)
        .sort((a, b) => parseInt(a.dataset.col, 10) - parseInt(b.dataset.col, 10))
    : [];

  // Find the next cell in this row.
  const nextIdx = currentColIdx + 1;
  if (nextIdx < cellsInRow.length) {
    startEditing(cellsInRow[nextIdx]);
    return;
  }

  // No more cells in this row — wrap to first cell of the next row.
  const nextRowIdx = currentRowIdx + 1;
  if (nextRowIdx < allRows.length) {
    const nextCells = Array.from(allRows[nextRowIdx].querySelectorAll('td'))
      .filter(td => td.dataset.col !== undefined)
      .sort((a, b) => parseInt(a.dataset.col, 10) - parseInt(b.dataset.col, 10));
    if (nextCells.length > 0) {
      startEditing(nextCells[0]);
    }
  } else {
    // Wrap back to first row, first cell.
    const firstRowCells = allRows[0]
      ? Array.from(allRows[0].querySelectorAll('td'))
          .filter(td => td.dataset.col !== undefined)
          .sort((a, b) => parseInt(a.dataset.col, 10) - parseInt(b.dataset.col, 10))
      : [];
    if (firstRowCells.length > 0) {
      startEditing(firstRowCells[0]);
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

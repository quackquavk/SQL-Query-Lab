// Filter/sort results in-place on cursor.lastUserResult without re-running the query.
import { cursor } from './runtime.js';

/**
 * Store a deep copy of the query result as cursor.originalResult.
 * Called once per new result set so original is never mutated.
 */
export function storeOriginal(result) {
  if (!cursor.originalResult) {
    cursor.originalResult = JSON.parse(JSON.stringify(result));
  }
}

/**
 * Sort cursor.lastUserResult.values by column index.
 * - Toggle: asc → desc → clear (reset to original)
 * - nulls last, numeric-aware sort
 */
export function applySort(colIndex, direction) {
  const result = cursor.lastUserResult;
  if (!result || !result.values) return;

  const state = cursor.filterSortState;

  // Toggle logic: same column
  if (state.sortCol === colIndex) {
    if (direction === 'asc') {
      // Switch to desc
      state.sortDir = 'desc';
    } else if (direction === 'desc') {
      // Clear back to original
      clearState();
      return;
    }
  } else {
    state.sortCol = colIndex;
    state.sortDir = direction;
  }

  const rows = result.values;

  // Detect numeric columns by sampling
  const isNumeric = new Array(result.columns.length).fill(false);
  if (rows.length > 0) {
    for (let c = 0; c < result.columns.length; c++) {
      let numericCount = 0;
      let sampleSize = Math.min(rows.length, 20);
      for (let r = 0; r < sampleSize; r++) {
        const val = rows[r][c];
        if (val === null || val === undefined) continue;
        const str = String(val).trim();
        if (/^-?\d+(\.\d+)?$/.test(str)) numericCount++;
      }
      isNumeric[c] = sampleSize > 0 && numericCount / sampleSize >= 0.8;
    }
  }

  result.values.sort((a, b) => {
    const av = a[colIndex];
    const bv = b[colIndex];

    // nulls last
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;

    let cmp;
    if (isNumeric[colIndex]) {
      cmp = parseFloat(av) - parseFloat(bv);
    } else {
      cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    }

    return state.sortDir === 'desc' ? -cmp : cmp;
  });
}

/**
 * Filter rows by search text (case-insensitive, checks any cell).
 * Empty string restores from originalResult.
 */
export function applyFilter(searchText) {
  const state = cursor.filterSortState;
  state.searchText = searchText;

  if (!searchText) {
    // Restore from original
    if (cursor.originalResult) {
      cursor.lastUserResult = JSON.parse(JSON.stringify(cursor.originalResult));
    }
    return;
  }

  const result = cursor.lastUserResult;
  if (!result || !result.values) return;

  const lower = searchText.toLowerCase();
  result.values = result.values.filter(row =>
    row.some(cell => String(cell ?? '').toLowerCase().includes(lower))
  );
}

/**
 * Reset to original result and clear filter/sort state.
 */
export function clearState() {
  if (cursor.originalResult) {
    cursor.lastUserResult = JSON.parse(JSON.stringify(cursor.originalResult));
  }
  cursor.filterSortState = { searchText: '', sortCol: null, sortDir: 'asc' };
}

/**
 * Return current filterSortState.
 */
export function getState() {
  return { ...cursor.filterSortState };
}
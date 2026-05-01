/**
 * diffTool.js — Pure JS diff algorithm for SQL result set comparison.
 * Exports compareResultsets() and formatDiffSummary().
 * No async, no external calls, no shared state.
 */

/**
 * Compare two SQL result sets and produce a structured diff.
 *
 * @param {object|null|undefined} reference - { columns, values, statement }
 * @param {object|null|undefined} current   - { columns, values, statement }
 * @returns {object} Diff result object
 */
export function compareResultsets(reference, current) {
  // 1. Input validation
  if (!reference || !current || (!reference.values && !current.values)) {
    return {
      reference: reference || null,
      current: current || null,
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
      columnDeltas: {},
      isSame: true,
    };
  }

  const refCols = reference.columns || [];
  const curCols = current.columns || [];
  const refRows = reference.values || [];
  const curRows = current.values || [];

  const refFingerprintMap = buildFingerprintMap(refRows);
  const curFingerprintMap = buildFingerprintMap(curRows);

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  // 2. Find removed rows (in reference but not in current)
  for (let i = 0; i < refRows.length; i++) {
    const fp = fingerprint(refRows[i]);
    if (!curFingerprintMap.has(fp)) {
      removed.push({ fingerprint: fp, row: refRows[i], rowIndex: i });
    }
  }

  // 3. Find added rows and changed/unmatched rows
  for (let j = 0; j < curRows.length; j++) {
    const curRow = curRows[j];
    const fp = fingerprint(curRow);

    if (!refFingerprintMap.has(fp)) {
      // Row not in reference → added
      added.push({ fingerprint: fp, row: curRow, rowIndex: j });
    } else {
      // Fingerprint matches — check for cell-level changes
      // refRow is the first occurrence in reference (same fingerprint = same content)
      const refIdx = refFingerprintMap.get(fp);
      const refRow = refRows[refIdx];

      if (refRow.length !== curRow.length) {
        // Column count differs — treat as changed
        changed.push({ fingerprint: fp, refRow, curRow, rowIndex: j, cells: {} });
      } else {
        const cells = {};
        let hasChange = false;
        for (let k = 0; k < refRow.length; k++) {
          const refVal = normalizeCell(refRow[k]);
          const curVal = normalizeCell(curRow[k]);
          if (refVal !== curVal) {
            cells[k] = [refRow[k], curRow[k]];
            hasChange = true;
          }
        }
        if (hasChange) {
          changed.push({ fingerprint: fp, refRow, curRow, rowIndex: j, cells });
        } else {
          unchanged.push({ fingerprint: fp, row: curRow, rowIndex: j });
        }
      }
    }
  }

  // 4. Compute column deltas
  const columnDeltas = computeColumnDeltas(refCols.length, added, removed, changed);

  const isSame = added.length === 0 && removed.length === 0 && changed.length === 0;

  return {
    reference: { columns: refCols, values: refRows, statement: reference.statement },
    current: { columns: curCols, values: curRows, statement: current.statement },
    added,
    removed,
    changed,
    unchanged,
    columnDeltas,
    isSame,
  };
}

/**
 * Build a map from fingerprint string → row index (first occurrence).
 * Multiple rows with the same fingerprint (identical content) map to the first index.
 * @param {Array<Array>} rows
 * @returns {Map<string, number>}
 */
function buildFingerprintMap(rows) {
  const map = new Map();
  for (let i = 0; i < rows.length; i++) {
    const fp = fingerprint(rows[i]);
    if (!map.has(fp)) {
      map.set(fp, i);
    }
  }
  return map;
}

/**
 * Generate a deterministic string fingerprint for a row.
 * Values are normalized before stringification so that structurally equivalent
 * rows match regardless of numeric representation (e.g. 2 vs 2.0 vs 2.00) or
 * type coercion differences between the two result sets.
 * @param {Array} row
 * @returns {string}
 */
function fingerprint(row) {
  return JSON.stringify(row.map(normalizeCell));
}

/**
 * Normalize a cell value for fingerprinting and comparison.
 * Floats are trimmed to 14 significant digits to handle floating-point drift.
 * NaN/Infinity serialized specially. All numbers become canonical strings.
 * @param {*} val
 * @returns {string}
 */
function normalizeCell(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number') {
    if (Number.isNaN(val)) return 'NaN';
    if (!Number.isFinite(val)) return String(val);
    // toFixed(14) rounds to ~14 sig figs; parse+toString strips trailing zeros
    // so "2", "2.0", "2.00" all produce "2"
    return parseFloat(val.toFixed(14)).toString();
  }
  return String(val);
}

/**
 * Compute per-column delta counts from added, removed, and changed row data.
 * @param {number} colCount
 * @param {Array} added
 * @param {Array} removed
 * @param {Array} changed
 * @returns {object} columnDeltas
 */
function computeColumnDeltas(colCount, added, removed, changed) {
  const deltas = {};
  for (let i = 0; i < colCount; i++) {
    deltas[i] = { added: 0, removed: 0, changed: 0 };
  }

  for (const entry of added) {
    for (let i = 0; i < entry.row.length; i++) {
      if (deltas[i] !== undefined) deltas[i].added++;
    }
  }
  for (const entry of removed) {
    for (let i = 0; i < entry.row.length; i++) {
      if (deltas[i] !== undefined) deltas[i].removed++;
    }
  }
  for (const entry of changed) {
    const cellKeys = Object.keys(entry.cells || {});
    for (const key of cellKeys) {
      if (deltas[key] !== undefined) deltas[key].changed++;
    }
  }

  return deltas;
}

/**
 * Format a diff result as a human-readable summary string.
 * @param {object} diff - result of compareResultsets()
 * @returns {string} e.g. "5 added, 2 removed, 3 changed in 4 columns"
 */
export function formatDiffSummary(diff) {
  if (!diff) return 'No diff available.';

  const parts = [];
  if (diff.added.length > 0) parts.push(`${diff.added.length} added`);
  if (diff.removed.length > 0) parts.push(`${diff.removed.length} removed`);
  if (diff.changed.length > 0) parts.push(`${diff.changed.length} changed`);
  if (diff.unchanged.length > 0) parts.push(`${diff.unchanged.length} unchanged`);

  const colCount = Object.keys(diff.columnDeltas || {}).length;
  const totalDeltaCols = Object.values(diff.columnDeltas || {}).filter(
    (d) => d.added > 0 || d.removed > 0 || d.changed > 0
  ).length;

  let summary = parts.length > 0 ? parts.join(', ') : 'No differences';
  if (totalDeltaCols > 0) {
    summary += ` in ${totalDeltaCols} column${totalDeltaCols !== 1 ? 's' : ''}`;
  } else if (colCount > 0) {
    summary += ` (${colCount} column${colCount !== 1 ? 's' : ''} checked)`;
  }

  return summary;
}
// Schema Diff module: fetch, diff, render, and ALTER-generation for sql.js databases.

import * as runtime from './runtime.js';

let _hooks = {};
let _svg = null;
let _currentDiff = null;

// ─── Hooks ───────────────────────────────────────────────────────

export function setSchemaDiffHooks({ onTableSelect }) {
  _hooks.onTableSelect = onTableSelect;
}

// ─── Schema Fetch ────────────────────────────────────────────────

/**
 * Fetch local schema from a sql.js Database instance.
 * Returns structured schema with tables, columns, and foreign keys.
 */
export async function fetchLocalSchema(db) {
  if (!db) return { tables: [] };

  try {
    const tableRes = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = tableRes[0]
      ? tableRes[0].values.map(r => r[0])
      : [];

    const tables = [];

    for (const name of tableNames) {
      // Column info
      const infoRes = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
      const columns = infoRes[0]
        ? infoRes[0].values.map(row => ({
            name: String(row[1]),
            type: String(row[2] || 'TEXT').toUpperCase(),
            notnull: row[3] === 1,
            dfltValue: row[4],
            pk: Number(row[5]) || 0,
            isFK: false,
          }))
        : [];

      // FK info
      const fkRes = db.exec(`PRAGMA foreign_key_list("${name.replace(/"/g, '""')}")`);
      const foreignKeys = fkRes[0]
        ? fkRes[0].values.map(row => ({
            from: String(row[3]),
            to: { table: String(row[2]), column: String(row[4]) },
          }))
        : [];

      // Mark FK columns
      foreignKeys.forEach(fk => {
        const col = columns.find(c => c.name === fk.from);
        if (col) col.isFK = true;
      });

      tables.push({ name, columns, foreignKeys });
    }

    return { tables };
  } catch (e) {
    console.error('fetchLocalSchema error:', e.message);
    return { tables: [] };
  }
}

// ─── Diff Computation ─────────────────────────────────────────────

/**
 * Compute the diff between two schemas.
 * Returns sourceOnly, targetOnly, and different tables.
 */
export function diffSchemas(srcSchema, tgtSchema) {
  const srcMap = new Map(srcSchema.tables.map(t => [t.name, t]));
  const tgtMap = new Map(tgtSchema.tables.map(t => [t.name, t]));

  const sourceOnly = [];
  const targetOnly = [];
  const inBoth = [];

  for (const [name, srcTable] of srcMap) {
    if (tgtMap.has(name)) {
      inBoth.push(name);
    } else {
      sourceOnly.push(srcTable);
    }
  }

  for (const [name, tgtTable] of tgtMap) {
    if (!srcMap.has(name)) {
      targetOnly.push(tgtTable);
    }
  }

  const different = [];

  for (const name of inBoth) {
    const srcTable = srcMap.get(name);
    const tgtTable = tgtMap.get(name);
    const columnDiffs = compareColumns(srcTable.columns, tgtTable.columns);

    different.push({
      name,
      srcColumns: srcTable.columns,
      tgtColumns: tgtTable.columns,
      srcForeignKeys: srcTable.foreignKeys,
      tgtForeignKeys: tgtTable.foreignKeys,
      columnDiffs,
    });
  }

  return { sourceOnly, targetOnly, different };
}

/**
 * Compare two column arrays and return diff entries.
 */
function compareColumns(srcCols, tgtCols) {
  const diffs = [];
  const srcColMap = new Map(srcCols.map(c => [c.name, c]));
  const tgtColMap = new Map(tgtCols.map(c => [c.name, c]));

  for (const [name, srcCol] of srcColMap) {
    if (!tgtColMap.has(name)) {
      diffs.push({ col: name, srcDef: srcCol, tgtDef: null, diffType: 'removed' });
    } else {
      const tgtCol = tgtColMap.get(name);
      const changes = [];

      if (srcCol.type !== tgtCol.type) {
        changes.push({ field: 'type', srcVal: srcCol.type, tgtVal: tgtCol.type });
      }
      if (srcCol.pk !== tgtCol.pk) {
        changes.push({ field: 'pk', srcVal: srcCol.pk, tgtVal: tgtCol.pk });
      }
      if (srcCol.notnull !== tgtCol.notnull) {
        changes.push({ field: 'notnull', srcVal: srcCol.notnull, tgtVal: tgtCol.notnull });
      }
      if (String(srcCol.dfltValue) !== String(tgtCol.dfltValue)) {
        changes.push({ field: 'dfltValue', srcVal: srcCol.dfltValue, tgtVal: tgtCol.dfltValue });
      }

      if (changes.length > 0) {
        diffs.push({ col: name, srcDef: srcCol, tgtDef: tgtCol, diffType: 'modified', changes });
      }
    }
  }

  for (const [name, tgtCol] of tgtColMap) {
    if (!srcColMap.has(name)) {
      diffs.push({ col: name, srcDef: null, tgtDef: tgtCol, diffType: 'added' });
    }
  }

  return diffs;
}

// ─── D3+dagre Rendering ───────────────────────────────────────────

/**
 * Render a schema diff into an SVG element.
 */
export function renderSchemaDiff(svgEl, diff) {
  _svg = svgEl;
  _currentDiff = diff;

  const d3 = window.d3;
  const dagre = window.dagre;

  if (!d3 || !dagre) {
    console.warn('D3 or dagre not available');
    showEmptyState(svgEl, 'D3/dagre library not loaded');
    return;
  }

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  svg.append('g').attr('class', 'schema-diff-content');

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const entries = [
    ...diff.sourceOnly.map(t => ({ ...t, _cat: 'sourceOnly' })),
    ...diff.targetOnly.map(t => ({ ...t, _cat: 'targetOnly' })),
    ...diff.different.map(t => ({ ...t, _cat: 'different' })),
  ];

  for (const entry of entries) {
    const cat = entry._cat;
    const label = cat === 'sourceOnly' ? 'SOURCE ONLY'
      : cat === 'targetOnly' ? 'TARGET ONLY'
      : 'DIFFERENT';

    const colCount = (entry.columns || entry.srcColumns || entry.tgtColumns || []).length;
    const extraHeight = cat === 'different' ? 24 : 0; // extra for summary text
    const height = 60 + (colCount * 22) + extraHeight + 10;
    const nodeWidth = 200;

    g.setNode(entry.name, {
      width: nodeWidth,
      height: Math.max(height, 90),
      _cat: cat,
      _entry: entry,
      _label: label,
    });
  }

  dagre.layout(g);

  const content = svg.select('.schema-diff-content');

  g.nodes().forEach(nodeId => {
    const node = g.node(nodeId);
    if (!node) return;

    const cat = node._cat;
    const entry = node._entry;
    const label = node._label;
    const isDifferent = cat === 'different';
    const cols = isDifferent
      ? entry.srcColumns || []
      : (entry.columns || []);

    const nodeGroup = content.append('g')
      .attr('class', `er-node diff-${cat.replace(/([A-Z])/g, '-$1').toLowerCase()}`)
      .attr('data-table', nodeId)
      .attr('data-cat', cat)
      .attr('transform', `translate(${node.x - node.width / 2},${node.y - node.height / 2})`);

    const headerH = 52;

    // Background rect
    nodeGroup.append('rect')
      .attr('width', node.width)
      .attr('height', node.height)
      .attr('rx', 6)
      .attr('class', 'er-node-bg');

    // Header rect
    nodeGroup.append('rect')
      .attr('width', node.width)
      .attr('height', headerH)
      .attr('rx', 6)
      .attr('class', 'er-node-header');

    // Shape icon at top-left of header
    const iconX = 12;
    const iconY = 14;
    const iconSize = 10;

    if (cat === 'sourceOnly') {
      // Circle for source only
      nodeGroup.append('circle')
        .attr('cx', iconX + iconSize / 2)
        .attr('cy', iconY + iconSize / 2)
        .attr('r', iconSize / 2)
        .attr('class', 'diff-shape-icon');
    } else if (cat === 'targetOnly') {
      // Square for target only
      nodeGroup.append('rect')
        .attr('x', iconX)
        .attr('y', iconY)
        .attr('width', iconSize)
        .attr('height', iconSize)
        .attr('class', 'diff-shape-icon');
    } else {
      // Diamond for different (rotated rect)
      const cx = iconX + iconSize / 2;
      const cy = iconY + iconSize / 2;
      nodeGroup.append('polygon')
        .attr('points', `${cx},${cy - iconSize / 2} ${cx + iconSize / 2},${cy} ${cx},${cy + iconSize / 2} ${cx - iconSize / 2},${cy}`)
        .attr('class', 'diff-shape-icon');
    }

    // Category label
    nodeGroup.append('text')
      .attr('x', 28)
      .attr('y', iconY + 8)
      .attr('class', 'diff-badge')
      .text(label);

    // Table name
    nodeGroup.append('text')
      .attr('x', node.width / 2)
      .attr('y', 38)
      .attr('text-anchor', 'middle')
      .attr('class', 'er-node-title')
      .text(nodeId);

    // Columns
    cols.forEach((col, i) => {
      const y = headerH + (i * 22) + 16;

      // PK badge
      if (col.pk > 0) {
        nodeGroup.append('rect')
          .attr('x', 8)
          .attr('y', y - 7)
          .attr('width', 6)
          .attr('height', 6)
          .attr('rx', 1)
          .attr('class', 'er-pk-badge');
      }

      // Column name
      nodeGroup.append('text')
        .attr('x', 20)
        .attr('y', y)
        .attr('class', 'er-col-name')
        .text(col.name);

      // Data type
      nodeGroup.append('text')
        .attr('x', node.width - 10)
        .attr('y', y)
        .attr('text-anchor', 'end')
        .attr('class', 'er-col-type')
        .text(col.type);

      // FK indicator
      if (col.isFK) {
        nodeGroup.append('circle')
          .attr('cx', 8)
          .attr('cy', y)
          .attr('r', 3)
          .attr('class', 'er-fk-dot');
      }
    });

    // Summary text for different tables
    if (isDifferent && entry.columnDiffs) {
      const diffCount = entry.columnDiffs.length;
      const summaryY = headerH + (cols.length * 22) + 28;
      nodeGroup.append('text')
        .attr('x', node.width / 2)
        .attr('y', summaryY)
        .attr('text-anchor', 'middle')
        .attr('class', 'diff-summary-text')
        .text(`${diffCount} col${diffCount === 1 ? '' : 's'} differ`);
    }

    // Click handler
    nodeGroup.on('click', () => {
      selectDiffTable(nodeId, entry, cat);
    });
  });

  setupZoom(svgEl);
}

function selectDiffTable(tableName, diffEntry, cat) {
  // Update runtime cursor
  if (typeof runtime !== 'undefined' && runtime.cursor) {
    runtime.cursor.schemaDiff = runtime.cursor.schemaDiff || {};
    runtime.cursor.schemaDiff.selectedTable = tableName;
    runtime.cursor.schemaDiff.selectedCategory = cat;
  }

  // Highlight selected node
  if (_svg) {
    const d3 = window.d3;
    d3.select(_svg).selectAll('.er-node').classed('er-node-selected', false);
    d3.select(_svg).select(`.er-node[data-table="${tableName}"]`).classed('er-node-selected', true);
  }

  // Fire hook
  if (_hooks.onTableSelect) {
    _hooks.onTableSelect(tableName, diffEntry, cat);
  }
}

export function setupZoom(svgElement) {
  const d3 = window.d3;
  if (!d3) return;

  const svg = d3.select(svgElement);

  const zoom = d3.zoom()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      svg.select('.schema-diff-content').attr('transform', event.transform);
    });

  svg.call(zoom);
  svg.style('cursor', 'grab');

  svg.on('mousedown', () => svg.style('cursor', 'grabbing'));
  svg.on('mouseup', () => svg.style('cursor', 'grab'));
}

function addZoomControls(svgEl) {
  const container = svgEl.parentElement;
  if (!container) return;

  // Remove existing controls
  const existing = container.querySelector('.er-zoom-controls');
  if (existing) existing.remove();

  const controls = document.createElement('div');
  controls.className = 'er-zoom-controls';
  controls.innerHTML = `
    <button class="er-zoom-btn" title="Zoom In" data-action="zoom-in">+</button>
    <button class="er-zoom-btn" title="Zoom Out" data-action="zoom-out">−</button>
    <button class="er-zoom-btn" title="Reset" data-action="zoom-reset">⊙</button>
  `;

  container.appendChild(controls);

  controls.querySelector('[data-action="zoom-in"]').addEventListener('click', () => {
    const d3 = window.d3;
    if (!d3) return;
    d3.select(svgEl).transition().duration(300).call(
      d3.zoom().scaleBy, 1.3
    );
  });

  controls.querySelector('[data-action="zoom-out"]').addEventListener('click', () => {
    const d3 = window.d3;
    if (!d3) return;
    d3.select(svgEl).transition().duration(300).call(
      d3.zoom().scaleBy, 0.7
    );
  });

  controls.querySelector('[data-action="zoom-reset"]').addEventListener('click', () => {
    const d3 = window.d3;
    if (!d3) return;
    d3.select(svgEl).transition().duration(300).call(
      d3.zoom().transform, d3.zoomIdentity
    );
  });
}

function showEmptyState(svgEl, message) {
  const d3 = window.d3;
  if (!d3) return;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('class', 'er-empty-state');
  g.append('text')
    .attr('x', svgEl.clientWidth / 2)
    .attr('y', svgEl.clientHeight / 2)
    .attr('text-anchor', 'middle')
    .attr('class', 'er-empty-state-text')
    .text(message || 'No schema data to display');
}

// ─── ALTER Statement Generation ──────────────────────────────────

/**
 * Generate ALTER statements to migrate target DB toward source schema.
 */
export function generateAlterStatements(diff) {
  const sourceOnlyDDL = [];
  const targetOnlyDrop = [];
  const alterAdd = [];
  const alterDrop = [];
  const migrationNotes = [];

  // Tables only in source → CREATE TABLE
  for (const table of diff.sourceOnly) {
    const ddl = buildCreateTableDDL(table);
    sourceOnlyDDL.push(ddl);
  }

  // Tables only in target → DROP TABLE (SQLite limitation note)
  for (const table of diff.targetOnly) {
    targetOnlyDrop.push(`DROP TABLE "${table.name}";`);
    migrationNotes.push(
      `DROP TABLE "${table.name}": Removes table present only in target.`
    );
  }

  // Columns in different tables
  for (const entry of diff.different) {
    const tableName = entry.name;
    const srcMap = new Map(entry.srcColumns.map(c => [c.name, c]));
    const tgtMap = new Map(entry.tgtColumns.map(c => [c.name, c]));

    for (const diffItem of entry.columnDiffs) {
      if (diffItem.diffType === 'added') {
        // Column added in source (missing in target) → ALTER TABLE ADD
        const colDef = diffItem.tgtDef;
        if (colDef) {
          const defStr = formatColumnDef(colDef);
          alterAdd.push(`ALTER TABLE "${tableName}" ADD COLUMN ${defStr};`);
        }
      } else if (diffItem.diffType === 'removed') {
        // Column removed from source (extra in target) → SQLite cannot DROP
        migrationNotes.push(
          `DROP COLUMN "${diffItem.col}" ON "${tableName}": SQLite does not support DROP COLUMN. ` +
          `Use table-rebuild migration: CREATE TABLE new_${tableName} (... without ${diffItem.col} ...); ` +
          `INSERT INTO new_${tableName} SELECT ... FROM "${tableName}"; DROP TABLE "${tableName}"; ` +
          `ALTER TABLE new_${tableName} RENAME TO "${tableName}";`
        );
        alterDrop.push(`-- Cannot execute: SQLite has no DROP COLUMN`);
        alterDrop.push(`-- TODO: Rebuild table "${tableName}" without column "${diffItem.col}"`);
      } else if (diffItem.diffType === 'modified') {
        // Column type changed → SQLite cannot ALTER COLUMN type
        const typeChange = diffItem.changes?.find(c => c.field === 'type');
        if (typeChange) {
          migrationNotes.push(
            `ALTER COLUMN TYPE for "${diffItem.col}" ON "${tableName}": ` +
            `SQLite does not support ALTER COLUMN to change type. ` +
            `Use table-rebuild migration for "${tableName}.${diffItem.col}" ` +
            `(${typeChange.srcVal} → ${typeChange.tgtVal}).`
          );
        }
        alterDrop.push(`-- Cannot execute: SQLite type change requires table rebuild`);
        alterDrop.push(`-- TODO: Rebuild table "${tableName}" with column "${diffItem.col}" type ${typeChange?.tgtVal}`);
      }
    }
  }

  return { sourceOnlyDDL, targetOnlyDrop, alterAdd, alterDrop, migrationNotes };
}

function buildCreateTableDDL(table) {
  const colDefs = table.columns.map(col => {
    const def = `  "${col.name}" ${col.type || 'TEXT'}`;
    if (col.pk > 0) {
      return def + ' PRIMARY KEY';
    }
    if (col.notnull) {
      return def + ' NOT NULL';
    }
    if (col.dfltValue !== null && col.dfltValue !== undefined) {
      return def + ` DEFAULT ${col.dfltValue}`;
    }
    return def;
  });

  const fkClauses = table.foreignKeys.map(fk =>
    `  FOREIGN KEY ("${fk.from}") REFERENCES "${fk.to.table}"("${fk.to.column}")`
  );

  const allParts = [...colDefs, ...fkClauses];
  return `CREATE TABLE "${table.name}" (\n${allParts.join(',\n')}\n);`;
}

function formatColumnDef(col) {
  let def = `"${col.name}" ${col.type || 'TEXT'}`;
  if (col.pk > 0) def += ' PRIMARY KEY';
  else if (col.notnull) def += ' NOT NULL';
  if (col.dfltValue !== null && col.dfltValue !== undefined) {
    def += ` DEFAULT ${col.dfltValue}`;
  }
  return def;
}

// Expose for browser console testing
window._schemaDiff = {
  fetchLocalSchema,
  diffSchemas,
  renderSchemaDiff,
  generateAlterStatements,
};
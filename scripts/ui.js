// UI rendering: schema, resources, history, results, modal, toast, feedback, splash.
// Also includes streaming results grid renderer for live query mode.

import * as runtime from './runtime.js';
import { state, solved, persist, MAX_HISTORY, formatHistoryTime, clearHistory, historySearch, historyFilterOk, historyFilterDb, setHistorySearch, setHistoryFilter, getHistoryFilters, BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from './state.js';
import { QUESTIONS } from './questions.js';
import { activeDb } from './db.js';
import { escapeHtml, previewStatement, exportToCsv, exportToJson, exportToXlsx, downloadBlob } from './utils.js';
import * as apiClient from './apiClient.js';
import { applySort, applyFilter, clearState, getState, storeOriginal } from './filterSort.js';
import { compareResultsets, formatDiffSummary } from './diffTool.js';

// Cache the inlineEdit module after first dynamic import.
let _inlineEditModule = null;

/**
 * Dynamically import inlineEdit.js and enable editing on any result-table
 * rendered inside container.  Preserves in-progress edits across re-renders.
 */
async function _enableInlineEditing(container) {
  if (runtime.cursor.currentMode !== 'sandbox') return;
  const tables = container.querySelectorAll('table.result-table');
  if (tables.length === 0) return;

  if (!_inlineEditModule) {
    _inlineEditModule = await import('./inlineEdit.js');
  }

  tables.forEach(table => {
    _inlineEditModule.enableInlineEditing(table);
  });
}

const ROW_HEIGHT = 28; // pixels per row for virtual scrolling

// Hooks injected by main.js to call back into other modules without import cycles.
let _hooks = {
  loadQuestion: () => {},
  loadHistoryItem: () => {},
};
export function setUiHooks(hooks) { _hooks = { ..._hooks, ...hooks }; }

export function flashResumedNote() {
  const n = document.getElementById('resumedNote');
  if (!n) return;
  n.classList.add('show');
  clearTimeout(window._rnT);
  window._rnT = setTimeout(() => n.classList.remove('show'), 2400);
}

// ─── Column Profile Panel ───────────────────────────────────────────────────

const MAX_DISTINCT = 10000;

/**
 * Compute per-column statistics for a query result set.
 * @param {string[]} columns
 * @param {any[][]} values — 2D array of row data
 * @returns {Array<{name, nullCount, distinctCount, min, max, avg, isNumeric, samples, truncated}>}
 */
export function computeColumnStats(columns, values) {
  if (!columns || columns.length === 0 || !values) {
    return [];
  }

  return columns.map((colName) => {
    if (values.length === 0) {
      return { name: colName, nullCount: 0, distinctCount: 0, min: null, max: null, avg: null, isNumeric: false, samples: [], truncated: false };
    }

    let nullCount = 0;
    let numericSum = 0;
    let numericCount = 0;
    let min = null;
    let max = null;
    const distinctSet = new Set();
    let truncated = false;
    const samples = [];
    const colIdx = columns.indexOf(colName);

    for (const row of values) {
      const cell = colIdx < row.length ? row[colIdx] : null;

      if (cell === null || cell === undefined) {
        nullCount++;
        continue;
      }

      // Track distinct values with early break at limit
      if (distinctSet.size < MAX_DISTINCT) {
        if (!distinctSet.has(cell)) {
          distinctSet.add(cell);
          if (samples.length < 5) samples.push(cell);
        }
      } else if (!truncated) {
        truncated = true;
      }

      // Track min/max on non-null string comparison
      const cellStr = String(cell);
      if (min === null || cellStr < min) min = cellStr;
      if (max === null || cellStr > max) max = cellStr;

      // Track numeric values
      if (!isNaN(cell) && cell !== '' && String(cell).trim() !== '') {
        const n = parseFloat(cell);
        if (!isNaN(n)) {
          numericSum += n;
          numericCount++;
        }
      }
    }

    const distinctCount = distinctSet.size;
    const avg = numericCount > 0 ? numericSum / numericCount : null;

    // Determine isNumeric: >80% of non-null values are numeric
    const nonNullCount = values.length - nullCount;
    const isNumeric = nonNullCount > 0 && (numericCount / nonNullCount) > 0.8;

    return {
      name: colName,
      nullCount,
      distinctCount,
      min,
      max,
      avg: isNumeric && numericCount > 0 ? avg : null,
      isNumeric,
      samples,
      truncated,
    };
  });
}

/**
 * Render a profile panel for a query result.
 * Returns an HTML string for the panel.
 */
export function renderProfilePanel(result) {
  if (!result) return '';

  // Handle multi-result (array) by computing stats from all blocks combined
  let columns, values;
  if (Array.isArray(result)) {
    if (result.length === 0) return '';
    const first = result[0];
    columns = first.columns || [];
    values = first.values || [];
  } else {
    if (!result.columns || !result.values) return '';
    columns = result.columns;
    values = result.values;
  }

  const stats = computeColumnStats(columns, values);

  const cardsHtml = stats.map(col => {
    const avgStr = col.avg !== null
      ? Number(col.avg).toFixed(2).replace(/\.?0+$/, '')
      : null;
    const distinctStr = col.truncated
      ? '>10,000'
      : String(col.distinctCount);

    const fmt = (v) => v === null ? '—' : String(v);

    return `
      <div class="profile-card">
        <div class="profile-card-name">${escapeHtml(col.name)}</div>
        <div class="profile-stat"><span class="label">MIN</span><span class="val">${fmt(col.min)}</span></div>
        <div class="profile-stat"><span class="label">MAX</span><span class="val">${fmt(col.max)}</span></div>
        ${col.isNumeric && avgStr !== null ? `<div class="profile-stat"><span class="label">AVG</span><span class="val">${avgStr}</span></div>` : ''}
        <div class="profile-stat"><span class="label">NULL</span><span class="val">${String(col.nullCount)}</span></div>
        <div class="profile-stat"><span class="label">DISTINCT</span><span class="val">${distinctStr}</span></div>
        <div class="profile-stat"><span class="label">SAMPLES</span><span class="val">${col.samples.slice(0, 5).map(s => escapeHtml(String(s).slice(0, 20))).join(', ') || '—'}</span></div>
      </div>
    `;
  }).join('');

  return `<div class="profile-panel">${cardsHtml}</div>`;
}

// ─── Tab Bar ─────────────────────────────────────────

export function renderTabBar() {
  const bar = document.getElementById('tabBar');
  if (!bar) return;
  const tabs = runtime.openTabs || [];
  const activeId = runtime.activeTabId;

  let html = '';
  for (const tab of tabs) {
    const isActive = tab.id === activeId;
    const dirtyMark = tab.dirty ? '<span style="color:var(--accent);margin-right:2px">*</span>' : '';
    html += `
      <div class="tab ${isActive ? 'active' : ''}" data-tab-id="${tab.id}" draggable="true">
        ${dirtyMark}${escapeHtml(tab.title)}
        <button class="tab-close" data-close="${tab.id}">×</button>
      </div>
    `;
  }
  html += `<button class="tab-new" id="tabNewBtn" title="New tab">+</button>`;
  bar.innerHTML = html;

  // Tab click → switch
  bar.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) return;
      const tabApi = runtime.getTabApi?.() || {};
      const { switchTabById } = tabApi;
      if (switchTabById) switchTabById(el.dataset.tabId);
    });
  });

  // Close button
  bar.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { closeTab } = tabApi;
      if (closeTab) closeTab(btn.dataset.close);
    });
  });

  // New tab button
  const newBtn = document.getElementById('tabNewBtn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      const tabApi = runtime.getTabApi?.() || {};
      const { createTab, switchTabById } = tabApi;
      if (createTab) {
        const id = createTab(runtime.cursor.currentDbName, runtime.cursor.connectionId);
        if (switchTabById) switchTabById(id);
      }
    });
  }

  // Drag-and-drop reorder
  let dragTabId = null;
  bar.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragTabId = el.dataset.tabId;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      bar.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!dragTabId || dragTabId === el.dataset.tabId) return;
      const tabs = runtime.openTabs;
      const fromIdx = tabs.findIndex(t => t.id === dragTabId);
      const toIdx = tabs.findIndex(t => t.id === el.dataset.tabId);
      const { reorderTabs } = tabApi;
      if (reorderTabs && fromIdx !== -1 && toIdx !== -1) {
        reorderTabs(fromIdx, toIdx);
      }
    });
  });
}

export function updateBadges() {
  document.getElementById('outCount').textContent =
    runtime.cursor.lastUserResult ? (runtime.cursor.lastUserResult.values || []).length : 0;
  document.getElementById('expCount').textContent =
    runtime.cursor.lastExpectedResult ? (runtime.cursor.lastExpectedResult.values || []).length : 0;
}

export function switchTab(tab) {
  document.querySelectorAll('.results-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderResultsTab(tab);
}

export function renderResultsTab(tab) {
  const body = document.getElementById('resultsBody');
  const exportDiv = document.getElementById('results-export');
  const last = runtime.cursor.lastUserResult;
  const exp = runtime.cursor.lastExpectedResult;

  // Show export toolbar when results are available
  if (exportDiv) {
    if (last && last.columns && last.columns.length > 0) {
      exportDiv.classList.remove('hidden');
    } else {
      exportDiv.classList.add('hidden');
    }
  }

  if (tab === 'output') {
    if (!last) {
      body.innerHTML = '<div class="results-empty">Run a query to see results</div>';
    } else if (Array.isArray(last)) {
      if (last.length === 0) {
        body.innerHTML = '<div class="results-empty">No SELECT results — statements executed</div>';
      } else {
        // Store original for filter/sort before rendering
        last.forEach((blk) => storeOriginal(blk));
        // Prepend profile panel for multi-result using first SELECT block stats
        const profileHtml = runtime.cursor.profileVisible ? renderProfilePanel(last) : '';
        body.innerHTML = profileHtml + last.map((blk, i) => `
          <div class="multi-result">
            <div class="stmt-header">
              <span class="num">#${i + 1}</span>
              <span class="preview">${escapeHtml(blk._stmt || 'result')}</span>
              <span style="color:var(--text-dim)">${(blk.values||[]).length} row${(blk.values||[]).length === 1 ? '' : 's'}</span>
            </div>
            ${renderTable(blk, runtime.cursor.lastQueryTableName)}
          </div>
        `).join('');
      }
    } else {
      // Store original for filter/sort before rendering
      storeOriginal(last);
      // Prepend profile panel if visible (sibling to results content inside body)
      const profileHtml = runtime.cursor.profileVisible ? renderProfilePanel(last) : '';
      body.innerHTML = profileHtml + renderTable(last, runtime.cursor.lastQueryTableName);
    }
    // Wire filter/sort handlers after DOM insertion
    wireFilterSortHandlers(body);
    // Wire inline editing for sandbox mode after DOM insertion.
    _enableInlineEditing(body);
  } else if (tab === 'expected') {
    if (!exp) body.innerHTML = '<div class="results-empty">No expected output yet</div>';
    else body.innerHTML = renderTable(exp, runtime.cursor.lastQueryTableName);
  } else if (tab === 'diff') {
    if (runtime.cursor.diffResult) {
      body.innerHTML = renderDiffView(runtime.cursor.diffResult);
    } else {
      body.innerHTML = '<div class="results-empty">No diff available. Click Compare after running two queries.</div>';
    }
  } else {
    body.innerHTML = runtime.cursor.lastMessage || '<div class="results-empty">No messages yet</div>';
  }
}

export function renderTable(res, tableName) {
  if (!res.columns || res.columns.length === 0) {
    return '<div class="results-empty">Query executed but returned no columns</div>';
  }
  const safeTableName = tableName ? escapeHtml(tableName) : '';
  const fsState = getState();
  const sortCol = fsState.sortCol;
  const sortDir = fsState.sortDir;

  let html = `<div class="fs-bar">
    <input class="fs-search" type="text" placeholder="Filter rows..." value="${escapeHtml(fsState.searchText || '')}" />
    <button class="fs-clear" title="Clear filter/sort" ${!fsState.searchText && sortCol === null ? 'style="opacity:0.3;pointer-events:none"' : ''}>×</button>
  </div>
  <table class="result-table" data-table="${safeTableName}"><thead><tr>`;

  res.columns.forEach((c, ci) => {
    const isSorted = sortCol === ci;
    const arrow = isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const sortClass = isSorted ? ` sort-${sortDir}` : '';
    html += `<th class="sortable${sortClass}" data-sort-col="${ci}" data-sort-dir="${isSorted ? sortDir : ''}" style="cursor:pointer;user-select:none">${escapeHtml(c)}${arrow}</th>`;
  });
  html += '</tr></thead><tbody>';
  if (res.values.length === 0) {
    html += `<tr><td colspan="${res.columns.length}" style="color:var(--text-dim);font-style:italic;padding:14px">(no rows)</td></tr>`;
  } else {
    res.values.forEach((row, ri) => {
      html += '<tr>';
      row.forEach((cell, ci) => {
        const safeVal = escapeHtml(String(cell ?? ''));
        if (cell === null) {
          html += `<td class="null" data-col="${ci}" data-row="${ri}" data-value="NULL"><span data-original="NULL">NULL</span></td>`;
        } else {
          html += `<td data-col="${ci}" data-row="${ri}" data-value="${safeVal}"><span data-original="${safeVal}">${safeVal}</span></td>`;
        }
      });
      html += '</tr>';
    });
  }
  html += '</tbody></table>';
  return html;
}

// ─── Diff View ─────────────────────────────────────────────────────────────

/**
 * Render a side-by-side diff view from a compareResultsets() result object.
 * Three-column layout: Reference table | Current table | Delta summary.
 * @param {object} diff - result of compareResultsets()
 * @returns {string} HTML string
 */
export function renderDiffView(diff) {
  if (!diff) {
    return '<div class="diff-empty">No diff data available.</div>';
  }

  const { reference, current, added, removed, changed, unchanged, columnDeltas, isSame } = diff;
  const refCols = (reference && reference.columns) ? reference.columns : [];
  const curCols = (current && current.columns) ? current.columns : [];
  const colCount = Math.max(refCols.length, curCols.length);

  const totalAdded = added.length;
  const totalRemoved = removed.length;
  const totalChanged = changed.length;
  const totalUnchanged = unchanged.length;

  // Build column headers row (shared across reference + current panels)
  function buildColHeaders(cols) {
    if (!cols || cols.length === 0) return '<tr><th class="diff-col-header-empty">—</th></tr>';
    return '<tr>' + cols.map(c => `<th class="diff-table-col-th">${escapeHtml(c)}</th>`).join('') + '</tr>';
  }

  // Build rows with diff-cell classes
  function buildDiffRows(rows, type) {
    if (!rows || rows.length === 0) return '';
    return rows.map(entry => {
      const row = entry.row || entry.curRow || entry.refRow || [];
      const cells = entry.cells || {};
      return '<tr>' + row.map((cell, ci) => {
        const cls = type === 'added' ? 'diff-added'
          : type === 'removed' ? 'diff-removed'
          : type === 'changed' ? 'diff-changed'
          : 'diff-unchanged';
        return `<td class="${cls}" title="${escapeHtml(String(cell ?? ''))}">${escapeHtml(String(cell ?? ''))}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }

  // Build delta summary
  let summaryHtml = '';
  if (colCount > 0) {
    summaryHtml += `
      <div class="diff-summary-row">
        <span class="col-name">SUMMARY</span>
        <span class="delta">${formatDiffSummary(diff)}</span>
      </div>
    `;
    for (let ci = 0; ci < colCount; ci++) {
      const deltas = columnDeltas[ci] || { added: 0, removed: 0, changed: 0 };
      const colName = curCols[ci] || refCols[ci] || `col_${ci}`;
      summaryHtml += `
        <div class="diff-summary-row">
          <span class="col-name">${escapeHtml(colName)}</span>
          ${deltas.added > 0 ? `<span class="delta delta-added">+${deltas.added}</span>` : ''}
          ${deltas.removed > 0 ? `<span class="delta delta-removed">-${deltas.removed}</span>` : ''}
          ${deltas.changed > 0 ? `<span class="delta delta-changed">~${deltas.changed}</span>` : ''}
          ${deltas.added === 0 && deltas.removed === 0 && deltas.changed === 0
            ? '<span class="delta" style="color:var(--text-dim)">—</span>' : ''}
        </div>
      `;
    }
  } else {
    summaryHtml = '<div class="diff-summary-empty">No column data</div>';
  }

  // Build side-by-side diff view
  const refHeader = buildColHeaders(refCols);
  const curHeader = buildColHeaders(curCols);
  const addedRows = buildDiffRows(added, 'added');
  const removedRows = buildDiffRows(removed, 'removed');
  const changedRows = buildDiffRows(changed, 'changed');
  const unchangedRows = buildDiffRows(unchanged, 'unchanged');

  const isIdentical = isSame !== false && totalAdded === 0 && totalRemoved === 0 && totalChanged === 0;

  return `
    <div class="diff-view">
      <div class="diff-col-panel">
        <div class="diff-col-header">Reference</div>
        <table class="diff-table">
          <thead>${refHeader}</thead>
          <tbody>
            ${removedRows || '<tr class="diff-header-row"><td colspan="99" style="color:var(--text-dim);font-size:10px;text-align:center;padding:8px">No removed rows</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="diff-col-panel">
        <div class="diff-col-header">Current</div>
        <table class="diff-table">
          <thead>${curHeader}</thead>
          <tbody>
            ${addedRows || '<tr class="diff-header-row"><td colspan="99" style="color:var(--text-dim);font-size:10px;text-align:center;padding:8px">No added rows</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="diff-col-panel diff-summary-panel">
        <div class="diff-col-header">Delta</div>
        ${summaryHtml}
        ${isIdentical ? '<div class="diff-summary-row"><span class="delta" style="color:var(--success)">✓ Identical</span></div>' : ''}
      </div>
    </div>
  `;
}

export function showFeedback(kind, label, html) {
  const klass = kind === 'success' ? 'success' : kind === 'error' ? 'error' : '';
  runtime.cursor.lastMessage = `<div class="feedback ${klass}"><span class="label">${label}</span>${html}</div>`;
  const active = document.querySelector('.results-tab.active');
  if (active && active.dataset.tab === 'message') renderResultsTab('message');
}

export function toast(text, title) {
  const t = document.getElementById('toast');
  const ttitle = t.querySelector('.t-title');
  ttitle.textContent = title || 'Correct';
  document.getElementById('toastMsg').textContent = text;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove('show'), 2400);
}

export function renderSchema() {
  const el = document.getElementById('leftContent');
  const db = activeDb();
  if (!db) return;
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tables = tablesRes[0] ? tablesRes[0].values.map(r => r[0]) : [];

  let html = `<h3>${runtime.cursor.currentDbName}.db</h3><div class="sub">${tables.length} tables</div>`;
  tables.forEach(t => {
    const info = db.exec(`PRAGMA table_info("${t}")`);
    const cols = info[0] ? info[0].values : [];
    html += `<div class="schema-table" data-t="${t}">
      <div class="schema-head"><span>${t}</span><span><span style="color:var(--text-dim);font-size:11px;margin-right:6px">${cols.length}</span><span class="arrow">▸</span></span></div>
      <div class="schema-cols">`;
    cols.forEach(c => {
      html += `<div class="schema-col"><span>${c[1]}${c[5] ? '<span class="pk">PK</span>' : ''}</span><span class="type">${c[2] || ''}</span></div>`;
    });
    html += '</div></div>';
  });
  el.innerHTML = html;
  el.querySelectorAll('.schema-head').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
  const first = el.querySelector('.schema-table');
  if (first) first.classList.add('open');
}

// ─── Object Explorer Tree ───────────────────────────────────────────────────

/**
 * Render the object explorer tree.
 * @param {Object} treeData - { databases: [...], groups: [...] } from fetchObjectTree
 * @param {HTMLElement} container - defaults to document.querySelector('.obj-tree')
 */
export function renderObjectTree(treeData, container) {
  container = container || document.querySelector('.obj-tree');
  if (!container) return;

  container.innerHTML = '';

  // Render connection groups/favorites at top (CONN-06)
  const groups = treeData.groups || [];
  if (groups.length > 0) {
    const groupsSection = document.createElement('div');
    groupsSection.className = 'obj-section';
    groupsSection.innerHTML = '<div class="obj-section-header">★ Favorites</div>';
    groups.forEach(group => {
      const node = createTreeNode(group.name, 'group', 0, true);
      node.dataset.groupId = group.id;
      node.innerHTML = `★ ${group.name}`;
      groupsSection.appendChild(node);
    });
    container.appendChild(groupsSection);
  }

  // Render databases and their children
  const databases = treeData.databases || [];
  databases.forEach(db => {
    // Database node (expandable folder)
    const dbNode = createTreeNode(db.name, 'database', 0, true);
    dbNode.innerHTML = `🗄️ ${db.name}`;
    container.appendChild(dbNode);

    // Child folders: Tables, Views, Stored Procedures, Functions, SQL Agent Jobs
    const childFolders = [
      { name: 'Tables', type: 'table', items: db.tables || [] },
      { name: 'Views', type: 'view', items: db.views || [] },
      { name: 'Stored Procedures', type: 'procedure', items: db.procedures || [] },
      { name: 'Functions', type: 'function', items: db.functions || [] },
      { name: 'SQL Agent Jobs', type: 'sql-agent', items: [{ name: 'Jobs' }] },
    ];

    childFolders.forEach(folder => {
      if (folder.items.length === 0) return;

      const folderNode = createTreeNode(folder.name, folder.type + '_folder', 1, true);
      folderNode.innerHTML = folder.name;
      dbNode.appendChild(folderNode);

      folder.items.forEach(item => {
        const itemNode = createTreeNode(item.name, folder.type, 2, false);
        itemNode.innerHTML = item.name;
        itemNode.dataset.database = db.name;
        itemNode.dataset.type = folder.type;
        folderNode.appendChild(itemNode);
      });
    });
  });

  wireTreeEvents(container);
}

/**
 * Create a tree node element.
 */
function createTreeNode(name, type, level, expandable) {
  const node = document.createElement('div');
  node.className = 'obj-node' + (expandable ? ' obj-expandable' : '');
  node.dataset.name = name;
  node.dataset.type = type;
  node.dataset.level = level;
  return node;
}

/**
 * Wire click-to-expand and context menu events on tree container.
 */
function wireTreeEvents(container) {
  container.addEventListener('click', (e) => {
    const node = e.target.closest('.obj-node');
    if (!node) return;

    const type = node.dataset.type;
    const name = node.dataset.name;

    // Expandable folder click → lazy load children
    if (node.classList.contains('obj-expandable') && !node.classList.contains('expanded')) {
      node.classList.add('expanded');
      handleNodeExpand(node);
      return;
    }

    // Object click (table, view, procedure, function, sql-agent) → show schema or job browser
    if (['table', 'view', 'procedure', 'function'].includes(type)) {
      handleObjectClick(node, type, name);
    } else if (type === 'sql-agent') {
      import('./jobBrowser.js').then(m => m.initJobBrowser());
    }
  });

  // Right-click context menu (OBJE-06)
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const node = e.target.closest('.obj-node');
    if (!node) return;

    const nodeType = node.dataset.type;
    const nodeName = node.dataset.name;
    const database = node.dataset.database || '';
    showContextMenu(e.clientX, e.clientY, nodeType, nodeName, database);
  });
}

/**
 * Handle tree node expansion with lazy loading (OBJE-02, D-05).
 * Fetches children on first expand.
 */
async function handleNodeExpand(node) {
  const type = node.dataset.type;
  const name = node.dataset.name;
  const database = node.dataset.database || '';
  const connectionId = runtime.cursor.connectionId;

  // Already loaded
  if (node.dataset.loaded === 'true') return;
  node.dataset.loaded = 'true';

  // Show loading state
  const loading = document.createElement('div');
  loading.className = 'obj-loading';
  loading.textContent = 'Loading...';
  node.appendChild(loading);

  try {
    if (type === 'database') {
      // Lazy load database children (tables/views/procedures/functions)
      const data = await apiClient.fetchObjectTree(connectionId);
      // Find this database in response and update children
      const dbData = data.databases.find(d => d.name === name);
      if (dbData) {
        node.innerHTML = `🗄️ ${name}`;
        // Re-add child folders with real data
        renderDatabaseChildren(node, dbData);
      }
    } else if (['table', 'view', 'procedure', 'function'].includes(type)) {
      // Lazy load column info or procedure definition
      if (type === 'table' || type === 'view') {
        const data = await apiClient.fetchTableColumns(connectionId, database, name);
        node.innerHTML = name;
        data.columns.forEach(col => {
          const colNode = createTreeNode(`${col.name} (${col.dataType})`, 'column', 3, false);
          if (col.isPrimaryKey) colNode.innerHTML += ' 🔑';
          node.appendChild(colNode);
        });
      } else {
        const def = await apiClient.fetchProcedureDefinition(connectionId, database, name);
        node.innerHTML = name;
        const defNode = createTreeNode('Definition', 'definition', 3, false);
        defNode.textContent = def.substring(0, 100) + '...';
        node.appendChild(defNode);
      }
    }
  } catch (err) {
    showFeedback('error', 'Failed to load: ' + err.message);
    node.innerHTML = name;
  }
}

/**
 * Render child folders under a database node after lazy load.
 */
function renderDatabaseChildren(dbNode, dbData) {
  const childFolders = [
    { name: 'Tables', type: 'table', items: dbData.tables || [] },
    { name: 'Views', type: 'view', items: dbData.views || [] },
    { name: 'Stored Procedures', type: 'procedure', items: dbData.procedures || [] },
    { name: 'Functions', type: 'function', items: dbData.functions || [] },
    { name: 'SQL Agent Jobs', type: 'sql-agent', items: [{ name: 'Jobs' }] },
  ];

  childFolders.forEach(folder => {
    if (folder.items.length === 0) return;

    const folderNode = createTreeNode(folder.name, folder.type + '_folder', 1, true);
    folderNode.innerHTML = folder.name;
    dbNode.appendChild(folderNode);

    folder.items.forEach(item => {
      const itemNode = createTreeNode(item.name, folder.type, 2, false);
      itemNode.innerHTML = item.name;
      itemNode.dataset.database = dbData.name;
      itemNode.dataset.type = folder.type;
      folderNode.appendChild(itemNode);
    });
  });
}

/**
 * Handle object node click → show schema panel or open definition in new tab.
 */
function handleObjectClick(node, type, name) {
  const database = node.dataset.database;
  if (type === 'sql-agent') {
    import('./jobBrowser.js').then(m => m.initJobBrowser());
    return;
  }
  if (type === 'table' || type === 'view') {
    // Show schema in right sidebar
    if (typeof renderSchema === 'function') {
      renderSchema(activeDb(), name);
    }
  } else if (type === 'procedure' || type === 'function') {
    // Open definition in SP Editor panel (D-21, S06)
    import('./spEditor.js').then(m => {
      m.openSpEditor(name);
    });
  }
}

/**
 * Show context menu at x, y for given node (OBJE-06, D-19).
 */
function showContextMenu(x, y, nodeType, nodeName, database) {
  // Remove existing menu
  const existing = document.querySelector('.obj-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'obj-context-menu';
  menu.style.position = 'fixed';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.zIndex = 1000;

  const items = getContextMenuItems(nodeType, nodeName, database);
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'obj-menu-item';
    btn.textContent = item.label;
    btn.onclick = () => { item.action(); menu.remove(); };
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 0);
}

function getContextMenuItems(nodeType, nodeName, database) {
  const items = [];
  const connId = runtime.cursor.connectionId;

  if (nodeType === 'table') {
    items.push(
      { label: 'Select Top 100', action: () => { runtime.editor?.setValue(`SELECT TOP 100 * FROM ${nodeName};`); } },
      { label: 'New Query', action: () => {
        if (typeof window.openNewTab === 'function') {
          const tabId = window.openNewTab(runtime.cursor.currentDbName, connId, `SELECT TOP 100 * FROM ${nodeName};`);
          if (tabId && runtime.openTabs && runtime.activeTabId !== tabId) {
            const { switchTabById } = runtime.getTabApi?.() || {};
            switchTabById?.(tabId);
          }
        }
      }},
      { label: 'Show ER Diagram', action: async () => {
        const panel = document.getElementById('erDiagramPanel');
        const svg = panel?.querySelector('svg');
        if (!svg) { showFeedback('error', 'ER Diagram', 'ER diagram SVG element not found'); return; }
        if (!connId) { showFeedback('error', 'ER Diagram', 'No active connection'); return; }
        try {
          const schema = await apiClient.fetchErSchema(connId, database);
          const { initErDiagram } = await import('./erDiagram.js');
          initErDiagram(svg, schema);
          document.getElementById('leftContent').style.display = 'none';
          panel.style.display = '';
          // Switch left tab if needed
          document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('active'));
          const erTab = document.querySelector('.left-tab[data-left="er-diagram"]');
          if (erTab) erTab.classList.add('active');
        } catch (err) {
          showFeedback('error', 'ER Diagram', 'Failed to load schema: ' + err.message);
        }
      }},
      { label: 'Open in Table Designer', action: async () => {
        const { openTableDesigner } = await import('./tableDesigner.js');
        openTableDesigner(nodeName);
      }},
      { label: 'Refresh', action: async () => {
        try {
          const data = await apiClient.refreshObjectNode(connId, database, 'table', nodeName);
          showFeedback('success', 'Refreshed', nodeName);
        } catch (err) {
          showFeedback('error', 'Refresh failed', err.message);
        }
      }}
    );
  } else if (nodeType === 'view') {
    items.push(
      { label: 'Select Top 100', action: () => { runtime.editor?.setValue(`SELECT TOP 100 * FROM ${nodeName};`); } },
      { label: 'New Query', action: () => {
        if (typeof window.openNewTab === 'function') {
          const tabId = window.openNewTab(runtime.cursor.currentDbName, connId, `SELECT TOP 100 * FROM ${nodeName};`);
          if (tabId && runtime.openTabs && runtime.activeTabId !== tabId) {
            const { switchTabById } = runtime.getTabApi?.() || {};
            switchTabById?.(tabId);
          }
        }
      }},
      { label: 'Show ER Diagram', action: async () => {
        const panel = document.getElementById('erDiagramPanel');
        const svg = panel?.querySelector('svg');
        if (!svg) { showFeedback('error', 'ER Diagram', 'ER diagram SVG element not found'); return; }
        if (!connId) { showFeedback('error', 'ER Diagram', 'No active connection'); return; }
        try {
          const schema = await apiClient.fetchErSchema(connId, database);
          const { initErDiagram } = await import('./erDiagram.js');
          initErDiagram(svg, schema);
          document.getElementById('leftContent').style.display = 'none';
          panel.style.display = '';
          document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('active'));
          const erTab = document.querySelector('.left-tab[data-left="er-diagram"]');
          if (erTab) erTab.classList.add('active');
        } catch (err) {
          showFeedback('error', 'ER Diagram', 'Failed to load schema: ' + err.message);
        }
      }},
      { label: 'Refresh', action: async () => {
        try {
          await apiClient.refreshObjectNode(connId, database, 'view', nodeName);
          showFeedback('success', 'Refreshed', nodeName);
        } catch (err) {
          showFeedback('error', 'Refresh failed', err.message);
        }
      }}
    );
  } else if (nodeType === 'procedure') {
    items.push(
      { label: 'Execute', action: () => { runtime.editor?.setValue(`EXEC ${nodeName};`); } },
      { label: 'Open in SP Editor', action: async () => {
        const { openSpEditor } = await import('./spEditor.js');
        openSpEditor(nodeName);
      }},
      { label: 'Open in New Tab', action: () => {
        apiClient.fetchProcedureDefinition(connId, database, nodeName).then(def => {
          if (typeof window.openNewTab === 'function') {
            window.openNewTab(database, connId, def);
          }
        });
      }},
      { label: 'Refresh', action: async () => {
        try {
          await apiClient.refreshObjectNode(connId, database, 'procedure', nodeName);
          showFeedback('success', 'Refreshed', nodeName);
        } catch (err) {
          showFeedback('error', 'Refresh failed', err.message);
        }
      }}
    );
  } else if (nodeType === 'function') {
    items.push(
      { label: 'Open in New Tab', action: () => {
        apiClient.fetchProcedureDefinition(connId, database, nodeName).then(def => {
          if (typeof window.openNewTab === 'function') {
            window.openNewTab(database, connId, def);
          }
        });
      }},
      { label: 'Open in SP Editor', action: async () => {
        const { openSpEditor } = await import('./spEditor.js');
        openSpEditor(nodeName);
      }},
      { label: 'Refresh', action: async () => {
        try {
          await apiClient.refreshObjectNode(connId, database, 'function', nodeName);
          showFeedback('success', 'Refreshed', nodeName);
        } catch (err) {
          showFeedback('error', 'Refresh failed', err.message);
        }
      }}
    );
  } else if (nodeType === 'database') {
    items.push(
      { label: 'New Query', action: () => {
        if (typeof window.openNewTab === 'function') {
          const tabId = window.openNewTab(database, connId, `USE ${database};\nSELECT TOP 100 * FROM tablename`);
          if (tabId && runtime.openTabs && runtime.activeTabId !== tabId) {
            const { switchTabById } = runtime.getTabApi?.() || {};
            switchTabById?.(tabId);
          }
        }
      }},
      { label: 'Refresh', action: async () => {
        try {
          const data = await apiClient.refreshObjectNode(connId, database, 'database');
          runtime.assignObjectTree(data);
          renderObjectTree(data);
          showFeedback('success', 'Refreshed', database);
        } catch (err) {
          showFeedback('error', 'Refresh failed', err.message);
        }
      }}
    );
  } else if (nodeType === 'procedure_folder') {
    items.push(
      { label: 'New Stored Procedure', action: () => {
        import('./spEditor.js').then(m => {
          m.openSpEditor(null);
        });
      }}
    );
  } else if (nodeType === 'group') {
    const groupId = node.dataset?.groupId;
    items.push(
      { label: 'Connect', action: () => {
        // Load the first connection in this group
        apiClient.listConnections().then(conns => {
          const first = conns.find(c => String(c.groupId) === String(groupId));
          if (first) {
            runtime.cursor.connectionId = first.id;
            runtime.cursor.connectionName = first.name;
            runtime.cursor.connected = true;
            updateConnectionUI();
            initObjectExplorer();
            showFeedback('success', 'Connected to', first.name);
          }
        }).catch(err => showFeedback('error', 'Connect failed', err.message));
      }},
      { label: 'Rename Group', action: () => {
        const newName = prompt('New group name:');
        if (newName && groupId) {
          apiClient.updateConnectionGroup(groupId, { name: newName }).catch(err => showFeedback('error', 'Rename failed', err.message));
        }
      }},
      { label: 'Delete', action: () => { apiClient.deleteConnectionGroup(groupId); } },
      { label: '★ Add Favorite', action: () => { apiClient.toggleConnectionFavorite(groupId); } }
    );
  }

  return items;
}

/**
 * Initialize the object explorer after connection is established.
 */
export async function initObjectExplorer() {
  const connId = runtime.cursor.connectionId;
  if (!connId) return;

  // Use per-connection storage in runtime.objectTree
  const existing = runtime.getObjectTree(connId);
  if (existing) {
    // Already loaded — just render
    renderObjectTree(existing);
    showObjectExplorer();
    return;
  }

  try {
    const treeData = await apiClient.fetchObjectTree(connId);
    runtime.assignObjectTree(treeData);
    // Assign per-connection using connId
    runtime.objectTree[connId] = treeData;
    renderObjectTree(treeData);
    showObjectExplorer();
  } catch (err) {
    console.warn('Object explorer initialization failed:', err.message);
  }
}

function showObjectExplorer() {
  const panel = document.getElementById('objExplorer');
  if (panel) panel.classList.add('visible');
  // Also ensure live tab is active when in live mode
  const mode = runtime.cursor.currentMode;
  if (mode === 'live') {
    document.querySelectorAll('.left-tab').forEach(b => {
      if (b.dataset.left === 'obj-explorer') b.classList.add('active');
      else b.classList.remove('active');
    });
    document.getElementById('leftContent').style.display = 'none';
  }
}

export function renderResources() {
  const el = document.getElementById('leftContent');
  el.innerHTML = `
    <h3>Resources</h3>
    <div class="sub">Quick SQL reference</div>
    <div class="resource">
      <h4>SELECT</h4>
      <code>SELECT col1, col2 FROM table
WHERE cond
ORDER BY col DESC
LIMIT n;</code>
    </div>
    <div class="resource">
      <h4>INSERT</h4>
      <code>INSERT INTO t (c1, c2)
VALUES (v1, v2);

-- from query
INSERT INTO t (c1)
SELECT c FROM other;</code>
    </div>
    <div class="resource">
      <h4>UPDATE</h4>
      <code>UPDATE t
SET col = value
WHERE condition;</code>
    </div>
    <div class="resource">
      <h4>DELETE</h4>
      <code>DELETE FROM t
WHERE condition;</code>
    </div>
    <div class="resource">
      <h4>DDL</h4>
      <code>CREATE TABLE t (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

ALTER TABLE t ADD COLUMN c TEXT;

DROP TABLE t;

CREATE INDEX i ON t(col);

CREATE VIEW v AS SELECT …;</code>
    </div>
    <div class="resource">
      <h4>JOINs</h4>
      <code>SELECT *
FROM a
LEFT JOIN b ON a.id = b.a_id;</code>
    </div>
    <div class="resource">
      <h4>Aggregates</h4>
      <code>SELECT dept, COUNT(*), AVG(sal)
FROM emp
GROUP BY dept
HAVING AVG(sal) > 50000;</code>
    </div>
  `;
}

export function renderHistory() {
  const el = document.getElementById('leftContent');
  const hist = state.history || [];

  // Apply filters
  let filtered = hist.filter(h => {
    if (historySearch && !h.sql.toLowerCase().includes(historySearch)) return false;
    if (historyFilterOk !== null && h.ok !== historyFilterOk) return false;
    if (historyFilterDb && h.db !== historyFilterDb) return false;
    return true;
  });

  // Get unique database names for filter dropdown
  const dbNames = [...new Set(hist.map(h => h.db).filter(Boolean))];

  let html = `
    <h3>Query history</h3>
    <div class="hist-search-wrap">
      <input type="text" id="histSearch" placeholder="Search queries..." value="${escapeHtml(historySearch)}" />
    </div>
    <div class="hist-filter-row">
      <button class="hist-chip ${historyFilterOk === null ? 'active' : ''}" data-filter-ok="">All</button>
      <button class="hist-chip ${historyFilterOk === true ? 'active' : ''}" data-filter-ok="true">✓ OK</button>
      <button class="hist-chip ${historyFilterOk === false ? 'active' : ''}" data-filter-ok="false">✗ Error</button>
    </div>
    <div class="hist-db-row">
      <select id="histDbFilter" class="hist-filter-db">
        <option value="">All databases</option>
        ${dbNames.map(db => `<option value="${escapeHtml(db)}" ${historyFilterDb === db ? 'selected' : ''}>${escapeHtml(db)}</option>`).join('')}
      </select>
      ${historySearch || historyFilterOk !== null || historyFilterDb ? '<button id="histClearFilters" class="hist-clear-btn">Clear</button>' : ''}
    </div>
    <div class="sub" style="display:flex;justify-content:space-between;align-items:center">
      <span>${filtered.length} of ${hist.length} runs</span>
      ${hist.length ? `<a href="javascript:void(0)" id="clearHistBtn" style="color:var(--text-dim);font-size:10px;text-decoration:none">Clear</a>` : ''}
    </div>
    <div class="history-list" id="historyList">
  `;
  if (filtered.length === 0) {
    html += `<div class="history-empty">No matching queries.<br><span style="font-family:var(--sans);font-style:normal;font-size:11.5px;color:var(--text-dim);letter-spacing:0.05em">${hist.length === 0 ? 'Run a query — it\'ll appear here.' : 'Try adjusting your filters.'}</span></div>`;
  } else {
    for (const h of filtered) {
      const execLabel = h.executionTime !== null && h.executionTime !== undefined
        ? `${h.executionTime}ms`
        : '—';
      const rowsLabel = h.rowCount !== null && h.rowCount !== undefined
        ? `${h.rowCount} rows`
        : '—';
      html += `
        <div class="history-item" data-id="${h.id}" title="${escapeHtml(h.sql)}">
          <span class="ts">
            <span class="status-dot ${h.ok ? 'ok' : 'err'}"></span>
            ${h.db}.db · ${formatHistoryTime(h.ranAt)}
          </span>
          <span class="exec-meta">${execLabel} · ${rowsLabel}</span>
          <div class="preview">${escapeHtml(previewStatement(h.sql, 140))}</div>
        </div>
      `;
    }
  }
  html += '</div>';
  el.innerHTML = html;

  // Wire search input
  el.querySelector('#histSearch')?.addEventListener('input', (e) => {
    setHistorySearch(e.target.value);
    renderHistory();
  });

  // Wire filter chips
  el.querySelectorAll('.hist-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.filterOk;
      const okFilter = val === '' ? null : val === 'true';
      setHistoryFilter(okFilter, historyFilterDb);
      renderHistory();
    });
  });

  // Wire database select
  el.querySelector('#histDbFilter')?.addEventListener('change', (e) => {
    const dbFilter = e.target.value || null;
    setHistoryFilter(historyFilterOk, dbFilter);
    renderHistory();
  });

  // Wire clear filters button
  el.querySelector('#histClearFilters')?.addEventListener('click', () => {
    setHistorySearch('');
    setHistoryFilter(null, null);
    renderHistory();
  });

  // Wire history item click
  el.querySelectorAll('.history-item').forEach(it => {
    it.addEventListener('click', () => _hooks.loadHistoryItem(it.dataset.id));
  });

  // Wire clear history button
  const cb = document.getElementById('clearHistBtn');
  if (cb) cb.addEventListener('click', () => {
    if (confirm('Clear all query history?')) clearHistory(renderHistory);
  });
}

// ─── Snippets Panel ─────────────────────────────────────────────

let _snippetSearch = '';
let _snippetCategory = 'All';
let _snippetModule = null;
async function getSandboxModule() {
  if (!_snippetModule) _snippetModule = await import('./sandbox.js');
  return _snippetModule;
}

export function renderSnippets() {
  const el = document.getElementById('leftContent');
  const categories = state.snippetCategories || ['General', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  const builtinSnippets = [
    { id: 'builtin-select-top', name: 'SELECT TOP 100', category: 'SELECT', sql: 'SELECT TOP 100 * FROM table_name\nWHERE condition;', builtin: true },
    { id: 'builtin-insert', name: 'INSERT Statement', category: 'INSERT', sql: 'INSERT INTO table_name (column1, column2, column3)\nVALUES (value1, value2, value3);', builtin: true },
    { id: 'builtin-update', name: 'UPDATE Statement', category: 'UPDATE', sql: 'UPDATE table_name\nSET column1 = value1, column2 = value2\nWHERE condition;', builtin: true },
    { id: 'builtin-delete', name: 'DELETE Statement', category: 'DELETE', sql: 'DELETE FROM table_name\nWHERE condition;', builtin: true },
  ];
  const userSnippets = state.snippets || [];
  const allSnippets = [...builtinSnippets, ...userSnippets];

  let html = `
    <h3>Snippets</h3>
    <div class="snippet-search-wrap">
      <input type="text" id="snippetSearchInput" placeholder="Search snippets..." />
    </div>
    <div class="snippet-cats">
      <button class="cat-chip ${_snippetCategory === 'All' ? 'active' : ''}" data-cat="All">All</button>
  `;
  for (const cat of categories) {
    html += `<button class="cat-chip ${_snippetCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
  }
  html += `</div>`;

  let filtered = allSnippets;
  if (_snippetCategory !== 'All') {
    filtered = filtered.filter(s => s.category === _snippetCategory);
  }
  if (_snippetSearch) {
    const q = _snippetSearch.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.sql.toLowerCase().includes(q)
    );
  }

  html += `<div class="snippet-panel-list">`;
  if (filtered.length === 0) {
    html += `<div class="snippet-empty">No snippets match.</div>`;
  } else {
    for (const s of filtered) {
      html += `
        <div class="snippet-row" data-id="${s.id}">
          <div class="s-row-head">
            <span class="name">${escapeHtml(s.name)}</span>
            ${s.builtin ? '<span class="builtin-tag">built-in</span>' : `<button class="del" data-del="${s.id}">×</button>`}
          </div>
          <div class="preview">${escapeHtml(s.sql.replace(/\s+/g, ' ').slice(0, 80))}</div>
          <div class="s-row-actions">
            <button class="ins-btn" data-ins="${s.id}">Insert</button>
            ${!s.builtin ? `<button class="edit-btn" data-edit="${s.id}">Edit</button>` : ''}
          </div>
        </div>
      `;
    }
  }
  html += `</div>`;

  html += `
    <div class="snippet-new-btn-wrap">
      <button class="btn btn-primary" id="newSnippetBtn">+ New Snippet</button>
    </div>
  `;

  el.innerHTML = html;

  // Search
  el.querySelector('#snippetSearchInput')?.addEventListener('input', (e) => {
    _snippetSearch = e.target.value;
    renderSnippets();
  });

  // Category filter
  el.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _snippetCategory = btn.dataset.cat;
      renderSnippets();
    });
  });

  // Insert button
  el.querySelectorAll('.ins-btn').forEach(b => {
    b.addEventListener('click', () => {
      getSandboxModule().then(mod => mod.insertSnippetAtCursor(b.dataset.ins));
    });
  });

  // Edit button
  el.querySelectorAll('.edit-btn').forEach(b => {
    b.addEventListener('click', () => {
      const s = (state.snippets || []).find(x => x.id === b.dataset.edit);
      if (!s) return;
      const name = prompt('Snippet name:', s.name);
      if (!name) return;
      const sql = prompt('SQL:', s.sql);
      if (sql === null) return;
      getSandboxModule().then(mod => mod.updateSnippet(b.dataset.edit, { name, sql, category: s.category }));
    });
  });

  // Delete button
  el.querySelectorAll('.del').forEach(b => {
    b.addEventListener('click', () => {
      getSandboxModule().then(mod => {
        mod.deleteSnippet(b.dataset.del);
        renderSnippets();
      });
    });
  });

  // New snippet
  el.querySelector('#newSnippetBtn')?.addEventListener('click', () => {
    const name = prompt('Snippet name:');
    if (!name) return;
    const category = prompt('Category (e.g. General, SELECT, INSERT):', 'General') || 'General';
    const sql = prompt('SQL content:');
    if (!sql) return;
    getSandboxModule().then(mod => {
      mod.saveSnippet({ name, category, sql });
      renderSnippets();
    });
  });
}

// ─── Templates Panel ──────────────────────────────────────────────────────

let _tmplSearch = '';
let _tmplCategory = 'All';

export function renderTemplates() {
  const el = document.getElementById('leftContent');
  const builtinTemplates = BUILTIN_TEMPLATES || [];
  const userTemplates = state.userTemplates || [];
  const allTemplates = [...builtinTemplates, ...userTemplates];
  const categories = ['All', ...TEMPLATE_CATEGORIES];

  let html = `
    <h3>SQL Templates</h3>
    <div class="tmpl-search-wrap">
      <input type="text" class="tmpl-search" id="tmplSearch" placeholder="Search templates..." value="${escapeHtml(_tmplSearch)}" />
    </div>
    <div class="tmpl-cats">
  `;

  for (const cat of categories) {
    html += `<button class="tmpl-cat-chip ${_tmplCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
  }
  html += `</div>`;

  // Filter
  let filtered = allTemplates;
  if (_tmplCategory !== 'All') {
    filtered = filtered.filter(t => t.category === _tmplCategory);
  }
  if (_tmplSearch) {
    const q = _tmplSearch.toLowerCase();
    filtered = filtered.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }

  html += `<div class="tmpl-panel-list">`;
  if (filtered.length === 0) {
    html += `<div class="tmpl-empty">No templates match.</div>`;
  } else {
    for (const t of filtered) {
      const isBuiltin = t.builtin !== undefined;
      html += `
        <div class="tmpl-row" data-id="${t.id}">
          <div class="tmpl-row-head">
            <span class="name">${escapeHtml(t.name)}</span>
            ${isBuiltin ? '<span class="builtin-tag">built-in</span>' : ''}
          </div>
          <div class="desc">${escapeHtml(t.description || '')}</div>
          <div class="preview">${escapeHtml((t.sql || '').replace(/\s+/g, ' ').slice(0, 80))}</div>
          <div class="s-row-actions">
            <button class="tmpl-ins-btn" data-ins="${t.id}">Insert</button>
            ${!isBuiltin ? `<button class="tmpl-edit-btn" data-edit="${t.id}">Edit</button>
            <button class="tmpl-del-btn" data-del="${t.id}">Delete</button>` : ''}
          </div>
        </div>
      `;
    }
  }
  html += `</div>`;

  html += `
    <div class="tmpl-save-btn-wrap">
      <button class="tmpl-save-btn" id="newTmplBtn">+ Save as Template</button>
    </div>
  `;

  el.innerHTML = html;

  // Search
  el.querySelector('#tmplSearch')?.addEventListener('input', (e) => {
    _tmplSearch = e.target.value;
    renderTemplates();
  });

  // Category chips
  el.querySelectorAll('.tmpl-cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _tmplCategory = btn.dataset.cat;
      renderTemplates();
    });
  });

  // Insert button
  el.querySelectorAll('.tmpl-ins-btn').forEach(b => {
    b.addEventListener('click', () => {
      getSandboxModule().then(mod => mod.insertTemplateAtCursor(b.dataset.ins));
    });
  });

  // Edit button (user templates only)
  el.querySelectorAll('.tmpl-edit-btn').forEach(b => {
    b.addEventListener('click', () => {
      const tpl = (state.userTemplates || []).find(x => x.id === b.dataset.edit);
      if (!tpl) return;
      const name = prompt('Template name:', tpl.name);
      if (!name) return;
      const description = prompt('Description:', tpl.description || '');
      if (description === null) return;
      const sql = prompt('SQL:', tpl.sql);
      if (!sql) return;
      getSandboxModule().then(mod => {
        mod.updateUserTemplate(b.dataset.edit, { name, description, sql });
        renderTemplates();
      });
    });
  });

  // Delete button (user templates only)
  el.querySelectorAll('.tmpl-del-btn').forEach(b => {
    b.addEventListener('click', () => {
      if (!confirm('Delete this template?')) return;
      getSandboxModule().then(mod => {
        mod.deleteUserTemplate(b.dataset.del);
        renderTemplates();
      });
    });
  });

  // Save as Template button
  el.querySelector('#newTmplBtn')?.addEventListener('click', () => {
    const name = prompt('Template name:');
    if (!name) return;
    const description = prompt('Description:', '') || '';
    const sql = prompt('SQL:');
    if (!sql) return;
    getSandboxModule().then(mod => {
      mod.saveUserTemplate({ name, description, sql });
      renderTemplates();
    });
  });
}

// ─── Filter/Sort Handlers ─────────────────────────────────────────────────

/**
 * Wire click/keyup handlers on the filter bar and sortable column headers.
 * Called after renderResultsTab inserts new DOM content.
 */
let _debounceTimer = null;

export function wireFilterSortHandlers(container) {
  // Clear button: reset to original
  const clearBtn = container.querySelector('.fs-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearState();
      renderResultsTab('output');
    });
  }

  // Search input: debounced filter
  const searchInput = container.querySelector('.fs-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        applyFilter(searchInput.value);
        renderResultsTab('output');
      }, 200);
    });
  }

  // Column header clicks: sort
  container.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = parseInt(th.dataset.sortCol);
      const currentDir = th.dataset.sortDir;
      // Toggle: asc → desc → clear
      const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
      applySort(col, nextDir);
      renderResultsTab('output');
    });
  });
}

export function renderFilters() {
  const cats = ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL'];
  const diffs = ['ALL', 'easy', 'medium', 'hard'];
  const f = document.getElementById('filters');
  f.innerHTML = '';

  cats.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (runtime.cursor.activeCategoryFilter === c ? ' active' : '');
    b.textContent = c;
    b.addEventListener('click', () => {
      runtime.cursor.activeCategoryFilter = c;
      state.lastCategoryFilter = c;
      persist();
      renderFilters();
      renderQuestionList();
    });
    f.appendChild(b);
  });
  const sep = document.createElement('span');
  sep.style.cssText = 'width:1px;background:var(--border);margin:0 4px';
  f.appendChild(sep);
  diffs.forEach(d => {
    const b = document.createElement('button');
    b.className = 'chip' + (runtime.cursor.activeDifficultyFilter === d ? ' active' : '');
    b.textContent = d;
    b.addEventListener('click', () => {
      runtime.cursor.activeDifficultyFilter = d;
      state.lastDifficultyFilter = d;
      persist();
      renderFilters();
      renderQuestionList();
    });
    f.appendChild(b);
  });
}

export function renderQuestionList() {
  const body = document.getElementById('modalBody');
  const filtered = QUESTIONS.filter(q =>
    (runtime.cursor.activeCategoryFilter === 'ALL' || q.category === runtime.cursor.activeCategoryFilter) &&
    (runtime.cursor.activeDifficultyFilter === 'ALL' || q.difficulty === runtime.cursor.activeDifficultyFilter)
  );
  if (filtered.length === 0) {
    body.innerHTML = '<div class="results-empty" style="padding:40px">Nothing matches those filters.</div>';
    return;
  }
  body.innerHTML = filtered.map(q => {
    const hasDraft = !!state.drafts[q.id];
    let status = '';
    if (solved.has(q.id)) status = 'solved';
    else if (hasDraft) status = 'in progress';
    return `
    <div class="q-row" data-id="${q.id}">
      <div class="num">${String(q.id).padStart(2,'0')}</div>
      <div><span class="diff ${q.difficulty}">${q.difficulty}</span></div>
      <div><span class="cat">${q.category.toLowerCase()}</span></div>
      <div>
        <div class="title">${q.title}</div>
        <div class="db">${q.db}.db</div>
      </div>
      <div class="status ${solved.has(q.id) ? 'done' : (hasDraft ? 'wip' : '')}">${status}</div>
    </div>
  `;}).join('');
  body.querySelectorAll('.q-row').forEach(r => {
    r.addEventListener('click', () => {
      _hooks.loadQuestion(parseInt(r.dataset.id));
      document.getElementById('modal').classList.remove('open');
    });
  });
}

export function updateDirtyMark() {
  const m = document.getElementById('dirtyMark');
  if (!m) return;
  if (runtime.cursor.currentMode === 'sandbox' && runtime.sandboxDirty[runtime.cursor.currentDbName]) m.classList.add('show');
  else m.classList.remove('show');
}

/**
 * Update the topbar live connection indicator to reflect current connection state.
 * Called after a successful connection save and on live mode entry.
 */
export function updateConnectionUI() {
  const indicator = document.getElementById('liveIndicator');
  const nameEl = document.getElementById('liveConnectionName');
  const liveStatusEl = document.getElementById('live-status');
  const connNameEl = document.getElementById('conn-name');

  if (!indicator || !nameEl) return;

  if (runtime.cursor.connected && runtime.cursor.connectionName) {
    indicator.classList.add('active');
    nameEl.textContent = runtime.cursor.connectionName;
    if (liveStatusEl) liveStatusEl.classList.remove('hidden');
    if (connNameEl) connNameEl.textContent = runtime.cursor.connectionName;
  } else {
    indicator.classList.remove('active');
    nameEl.textContent = 'Not connected';
    if (liveStatusEl) liveStatusEl.classList.add('hidden');
  }
}

export function renderConnectionDialog() {
  const existing = document.getElementById('connection-dialog');
  if (existing) existing.remove();

  const html = `
    <div id="connection-dialog" class="modal">
      <div class="modal-content conn-modal">
        <div class="modal-header">
          <h2>Connect to SQL Server</h2>
          <button class="modal-close" id="conn-dialog-close">&times;</button>
        </div>
        <div id="conn-saved-section" class="conn-saved-section">
          <div class="conn-saved-header">
            <span>Saved Connections</span>
          </div>
          <div id="conn-saved-list" class="conn-saved-list">
            <div class="conn-saved-loading">Loading...</div>
          </div>
        </div>
        <form id="connection-form">
          <div class="conn-field">
            <label for="conn-name">Connection Name</label>
            <input type="text" id="conn-name" placeholder="My Production DB" required>
          </div>
          <div class="conn-field">
            <label for="conn-server">Server</label>
            <input type="text" id="conn-server" placeholder="server.database.windows.net" required>
          </div>
          <div class="conn-field">
            <label for="conn-database">Database (optional)</label>
            <input type="text" id="conn-database" placeholder="master">
          </div>
          <div class="conn-field">
            <label for="conn-auth-type">Authentication</label>
            <select id="conn-auth-type">
              <option value="sql">SQL Server Authentication</option>
              <option value="windows">Windows Integrated Authentication</option>
              <option value="entra">Azure Active Directory / Entra ID</option>
            </select>
          </div>
          <div id="conn-dynamic-fields"></div>
          <div class="conn-actions">
            <button type="button" id="conn-test-btn" class="btn-secondary">Test Connection</button>
            <button type="submit" class="btn-primary">Save & Connect</button>
            <button type="button" class="btn-cancel" id="conn-cancel-btn">Cancel</button>
          </div>
          <div id="conn-test-result" class="conn-test-result"></div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('conn-dialog-close').addEventListener('click', hideConnectionDialog);
  document.getElementById('conn-cancel-btn').addEventListener('click', hideConnectionDialog);
  document.getElementById('connection-dialog').addEventListener('click', (e) => {
    if (e.target.id === 'connection-dialog') hideConnectionDialog();
  });

  const authTypeSelect = document.getElementById('conn-auth-type');
  authTypeSelect.addEventListener('change', () => renderDynamicAuthFields(authTypeSelect.value));

  renderDynamicAuthFields('sql');

  const testBtn = document.getElementById('conn-test-btn');
  testBtn.addEventListener('click', async () => {
    const form = document.getElementById('connection-form');
    const server = form['conn-server'].value;
    const database = form['conn-database'].value;
    const authType = form['conn-auth-type'].value;
    const credentials = buildCredentialsFromForm(form, authType);

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';

    try {
      const { testConnection } = await import('./apiClient.js');
      const result = await testConnection({ server, database, authType, credentials });
      showConnectionTestResult(result.success, result.success
        ? `Connected! Server: ${result.serverVersion}`
        : `Failed: ${result.error}`);
    } catch (err) {
      showConnectionTestResult(false, `Error: ${err.message}`);
    }

    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  });

  document.getElementById('connection-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const connection = {
      name: form['conn-name'].value,
      server: form['conn-server'].value,
      database: form['conn-database'].value,
      authType: form['conn-auth-type'].value,
      credentials: buildCredentialsFromForm(form, form['conn-auth-type'].value)
    };

    const { saveConnection } = await import('./apiClient.js');
    const result = await saveConnection(connection);

    if (result.id) {
      runtime.cursor.connectionId = result.id;
      runtime.cursor.connectionName = result.name;
      runtime.cursor.connected = true;
      updateConnectionUI();
      hideConnectionDialog();
      showFeedback('success', `Connected to ${result.name}`);
    } else {
      showConnectionTestResult(false, result.error || 'Failed to save connection');
    }
  });

  document.getElementById('connection-dialog').classList.add('open');

  // Load saved connections list
  loadSavedConnections();
}

function renderDynamicAuthFields(authType) {
  const container = document.getElementById('conn-dynamic-fields');
  let fields = '';

  switch (authType) {
    case 'sql':
      fields = `
        <div class="conn-field">
          <label for="conn-username">Username</label>
          <input type="text" id="conn-username" autocomplete="username">
        </div>
        <div class="conn-field">
          <label for="conn-password">Password</label>
          <input type="password" id="conn-password" autocomplete="current-password">
        </div>
      `;
      break;
    case 'windows':
      fields = `<p class="conn-hint">Windows credentials will be used automatically via backend.</p>`;
      break;
    case 'entra':
      fields = `
        <div class="conn-field">
          <label for="conn-tenant">Tenant ID</label>
          <input type="text" id="conn-tenant" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
        </div>
        <div class="conn-field">
          <label for="conn-client-id">Client ID</label>
          <input type="text" id="conn-client-id">
        </div>
        <div class="conn-field">
          <label for="conn-client-secret">Client Secret</label>
          <input type="password" id="conn-client-secret">
        </div>
      `;
      break;
  }

  container.innerHTML = fields;
}

function buildCredentialsFromForm(form, authType) {
  switch (authType) {
    case 'sql':
      return {
        username: form['conn-username']?.value || '',
        password: form['conn-password']?.value || ''
      };
    case 'entra':
      return {
        tenantId: form['conn-tenant']?.value || '',
        clientId: form['conn-client-id']?.value || '',
        clientSecret: form['conn-client-secret']?.value || ''
      };
    case 'windows':
    default:
      return {};
  }
}

export function showConnectionTestResult(success, message) {
  const el = document.getElementById('conn-test-result');
  if (!el) return;
  el.className = success ? 'conn-test-result success' : 'conn-test-result error';
  el.textContent = message;
}

export function hideConnectionDialog() {
  const dialog = document.getElementById('connection-dialog');
  if (dialog) dialog.classList.remove('open');
  setTimeout(() => dialog?.remove(), 200);
}

async function loadSavedConnections() {
  const listEl = document.getElementById('conn-saved-list');
  if (!listEl) return;

  try {
    const { listConnections, getConnection, deleteConnection } = await import('./apiClient.js');
    const conns = await listConnections();

    if (!conns || conns.length === 0) {
      listEl.innerHTML = '<div class="conn-saved-empty">No saved connections yet.</div>';
      return;
    }

    listEl.innerHTML = conns.map(c => `
      <div class="conn-saved-row" data-id="${c.id}">
        <div>
          <div class="conn-saved-name">${escapeHtml(c.name || '')}</div>
          <div class="conn-saved-server">${escapeHtml(c.server || '')}</div>
        </div>
        <button class="conn-saved-delete" data-delete="${c.id}" title="Delete">&times;</button>
      </div>
    `).join('');

    // Click a row → fetch full credentials and auto-fill form
    listEl.querySelectorAll('.conn-saved-row').forEach(row => {
      row.addEventListener('click', async (e) => {
        if (e.target.classList.contains('conn-saved-delete')) return;
        const id = row.dataset.id;
        try {
          const full = await getConnection(id);
          if (full && !full.error) {
            // Auto-fill form fields
            document.getElementById('conn-name').value = full.name || '';
            document.getElementById('conn-server').value = full.server || '';
            document.getElementById('conn-database').value = full.database || '';
            const authType = full.authType || 'sql';
            document.getElementById('conn-auth-type').value = authType;
            renderDynamicAuthFields(authType);
            // Fill credentials after dynamic fields are rendered
            setTimeout(() => {
              if (authType === 'sql' && full.credentials) {
                document.getElementById('conn-username').value = full.credentials.username || '';
                document.getElementById('conn-password').value = full.credentials.password || '';
              } else if (authType === 'entra' && full.credentials) {
                document.getElementById('conn-tenant').value = full.credentials.tenantId || '';
                document.getElementById('conn-client-id').value = full.credentials.clientId || '';
                document.getElementById('conn-client-secret').value = full.credentials.clientSecret || '';
              }
            }, 0);
            showFeedback('success', 'Loaded', full.name);
          }
        } catch (err) {
          showFeedback('error', 'Load failed', err.message);
        }
      });
    });

    // Delete button
    listEl.querySelectorAll('.conn-saved-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this saved connection?')) return;
        const id = btn.dataset.delete;
        try {
          await deleteConnection(id);
          loadSavedConnections(); // Re-render list
          showFeedback('success', 'Deleted', '');
        } catch (err) {
          showFeedback('error', 'Delete failed', err.message);
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<div class="conn-saved-error">Could not load saved connections.</div>';
  }
}

/**
 * Open the saved connections dropdown, fetching list from API.
 * On item click, loads the connection and opens the dialog with it pre-filled.
 */
export async function openSavedConnectionsDropdown() {
  const dropdown = document.getElementById('savedConnDropdown');
  if (!dropdown) return;

  dropdown.classList.add('open');
  dropdown.innerHTML = '<div class="conn-dropdown-loading">Loading...</div>';

  try {
    const { listConnections, getConnection } = await import('./apiClient.js');
    const conns = await listConnections();

    if (!conns || conns.length === 0) {
      dropdown.innerHTML = '<div class="conn-dropdown-empty">No saved connections.</div>';
      return;
    }

    dropdown.innerHTML = conns.map(c => `
      <div class="conn-dropdown-item" data-id="${c.id}">
        <div>
          <div class="conn-dropdown-name">${escapeHtml(c.name || '')}</div>
          <div class="conn-dropdown-server">${escapeHtml(c.server || '')}</div>
        </div>
      </div>
    `).join('');

    // Click an item → load and pre-fill dialog
    dropdown.querySelectorAll('.conn-dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        dropdown.classList.remove('open');
        const id = item.dataset.id;
        try {
          const full = await getConnection(id);
          if (full && !full.error) {
            runtime.cursor.connectionId = full.id;
            runtime.cursor.connectionName = full.name;
            runtime.cursor.connected = true;
            updateConnectionUI();
            showFeedback('success', 'Reconnected to', full.name);
          } else {
            showFeedback('error', 'Load failed', full?.error || 'Unknown error');
          }
        } catch (err) {
          showFeedback('error', 'Reconnect failed', err.message);
        }
      });
    });
  } catch (err) {
    dropdown.innerHTML = '<div class="conn-dropdown-empty">Could not load connections.</div>';
  }
}

export function hideSavedConnectionsDropdown() {
  const dropdown = document.getElementById('savedConnDropdown');
  if (dropdown) dropdown.classList.remove('open');
}

// ─── Live Query Streaming Results ────────────────────────────────────────

export function renderResultsStreaming(columns, options = {}) {
  const { pageSize = 100, onPageChange, onSort, onExport } = options;

  const wrap = document.getElementById('results-grid-wrap');
  const header = document.getElementById('results-header');
  const body = document.getElementById('results-body');

  if (!wrap || !header || !body) return null;

  // Build column header HTML
  let headerHtml = '<tr>';
  columns.forEach((col, i) => {
    headerHtml += `<th data-col="${i}">${escapeHtml(col.name || String(col))}</th>`;
  });
  headerHtml += '</tr>';
  header.innerHTML = headerHtml;

  // Sort state
  let sortCol = null;
  let sortDir = 'asc';

  // Streaming state
  let allRows = [];
  let currentPage = 1;
  let totalPages = 1;

  function renderPageRows() {
    const start = (currentPage - 1) * pageSize;
    const page = allRows.slice(start, start + pageSize);

    body.innerHTML = page.map(row => {
      let html = '<tr>';
      row.forEach((cell, ci) => {
        if (cell === null) html += `<td class="null">NULL</td>`;
        else if (!isNaN(cell) && cell !== '' && String(cell).match(/^-?\d+(\.\d+)?$/)) html += `<td class="num">${escapeHtml(String(cell))}</td>`;
        else html += `<td title="${escapeHtml(String(cell))}">${escapeHtml(String(cell).slice(0, 300))}</td>`;
      });
      html += '</tr>';
      return html;
    }).join('');
  }

  function updatePagination() {
    totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
    renderPagination(currentPage, totalPages, pageSize, allRows.length, (page, newSize) => {
      if (newSize) pageSize = newSize;
      currentPage = page;
      renderPageRows();
      onPageChange?.(page);
    });
  }

  // Attach sort handlers
  header.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const col = parseInt(th.dataset.col);
      if (sortCol === col) {
        if (sortDir === 'asc') sortDir = 'desc';
        else if (sortDir === 'desc') { sortCol = null; sortDir = 'asc'; }
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      // Update sort indicators
      header.querySelectorAll('th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      if (sortCol !== null) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      // Sort rows
      if (sortCol !== null) {
        allRows.sort((a, b) => {
          const va = a[col] ?? '';
          const vb = b[col] ?? '';
          const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
      currentPage = 1;
      renderPageRows();
      updatePagination();
      onSort?.(sortCol, sortDir);
    });
  });

  // Virtual scrolling setup
  let scrollTimer = null;
  wrap.addEventListener('scroll', () => {
    if (allRows.length > pageSize * 3) {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const st = wrap.scrollTop;
        const viewH = wrap.clientHeight;
        const startIdx = Math.floor(st / ROW_HEIGHT);
        const visibleCount = Math.ceil(viewH / ROW_HEIGHT);
        // For large result sets, we render visible window + buffer
        // For now, basic pagination handles most cases; virtual scroll deferred
      }, 16);
    }
  });

  return {
    addRows(rows) {
      allRows.push(...rows);
      if (currentPage === totalPages || totalPages === 1) {
        renderPageRows();
        updatePagination();
      } else {
        updatePagination();
      }
    },
    complete(executionTime, rowCount) {
      const statusEl = document.getElementById('results-status');
      if (statusEl) {
        statusEl.className = 'results-status';
        statusEl.textContent = `✓ Query executed in ${executionTime}ms — ${rowCount ?? allRows.length} rows`;
      }
      updatePagination();
    },
    error(message) {
      const statusEl = document.getElementById('results-status');
      if (statusEl) {
        statusEl.className = 'results-status error';
        statusEl.textContent = `✗ ${message}`;
      }
      body.innerHTML = `<div class="results-empty" style="color:var(--error)">${escapeHtml(message)}</div>`;
    },
    getPage() { return currentPage; },
    getTotalPages() { return totalPages; },
    setPageSize(size) {
      pageSize = size;
      currentPage = 1;
      renderPageRows();
      updatePagination();
    },
    getRows() { return allRows; },
    getColumns() { return columns; }
  };
}

export function renderPagination(currentPage, totalPages, pageSize, rowCount, onPageChange) {
  const el = document.getElementById('results-pagination');
  if (!el) return;

  if (totalPages <= 1 && (!rowCount || rowCount <= pageSize)) {
    el.innerHTML = '';
    return;
  }

  let html = '';

  // Prev button
  html += `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>`;

  // Page numbers
  const maxPages = 7;
  let startPage = Math.max(1, currentPage - 3);
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  if (endPage - startPage < maxPages - 1) startPage = Math.max(1, endPage - maxPages + 1);

  if (startPage > 1) { html += `<button class="page-btn" data-page="1">1</button>`; if (startPage > 2) html += '<span class="page-ellipsis">…</span>'; }
  for (let p = startPage; p <= endPage; p++) html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  if (endPage < totalPages) { if (endPage < totalPages - 1) html += '<span class="page-ellipsis">…</span>'; html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`; }

  // Next button
  html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>`;

  // Page size selector
  html += `<select class="page-size-select">
    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
    <option value="200" ${pageSize === 200 ? 'selected' : ''}>200</option>
    <option value="500" ${pageSize === 500 ? 'selected' : ''}>500</option>
  </select>`;

  // Row count display
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, rowCount || 0);
  html += `<span class="page-info">${rowCount ? startRow + '-' + endRow + ' of ' + rowCount + ' rows' : ''}</span>`;

  el.innerHTML = html;

  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) onPageChange(p);
    });
  });

  el.querySelector('.page-size-select')?.addEventListener('change', (e) => {
    onPageChange(1, parseInt(e.target.value));
  });
}

let _resultsets = [];
export function storeResultSet(columns, rows) {
  _resultsets.push({ columns, rows });
}
export function getResultSet(index) { return _resultsets[index] ?? null; }
export function clearResultSets() { _resultsets = []; }

export function handleExportCsv(resultSetIndex) {
  const rs = resultSetIndex !== undefined ? getResultSet(resultSetIndex) : runtime.cursor.lastUserResult;
  if (!rs) return;
  const csv = exportToCsv(rs.columns, rs.rows);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  downloadBlob(csv, `results_${ts}.csv`, 'text/csv');
}
export function handleExportJson(resultSetIndex) {
  const rs = resultSetIndex !== undefined ? getResultSet(resultSetIndex) : runtime.cursor.lastUserResult;
  if (!rs) return;
  const json = exportToJson(rs.columns, rs.rows);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  downloadBlob(json, `results_${ts}.json`, 'application/json');
}

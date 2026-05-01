// UI rendering: schema, resources, history, results, modal, toast, feedback, splash.
// Also includes streaming results grid renderer for live query mode.

import * as runtime from './runtime.js';
import { state, solved, persist, MAX_HISTORY, formatHistoryTime, clearHistory } from './state.js';
import { QUESTIONS } from './questions.js';
import { activeDb } from './db.js';
import { escapeHtml, previewStatement, exportToCsv, exportToJson, downloadBlob } from './utils.js';
import * as apiClient from './apiClient.js';

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
  const last = runtime.cursor.lastUserResult;
  const exp = runtime.cursor.lastExpectedResult;
  if (tab === 'output') {
    if (!last) {
      body.innerHTML = '<div class="results-empty">Run a query to see results</div>';
    } else if (Array.isArray(last)) {
      if (last.length === 0) {
        body.innerHTML = '<div class="results-empty">No SELECT results — statements executed</div>';
      } else {
        body.innerHTML = last.map((blk, i) => `
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
      body.innerHTML = renderTable(last, runtime.cursor.lastQueryTableName);
    }
    // Wire inline editing for sandbox mode after DOM insertion.
    _enableInlineEditing(body);
  } else if (tab === 'expected') {
    if (!exp) body.innerHTML = '<div class="results-empty">No expected output yet</div>';
    else body.innerHTML = renderTable(exp, runtime.cursor.lastQueryTableName);
  } else {
    body.innerHTML = runtime.cursor.lastMessage || '<div class="results-empty">No messages yet</div>';
  }
}

export function renderTable(res, tableName) {
  if (!res.columns || res.columns.length === 0) {
    return '<div class="results-empty">Query executed but returned no columns</div>';
  }
  const safeTableName = tableName ? escapeHtml(tableName) : '';
  let html = `<table class="result-table" data-table="${safeTableName}"><thead><tr>`;
  res.columns.forEach((c, ci) => html += `<th data-col-idx="${ci}">${escapeHtml(c)}</th>`);
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
    // Open definition in new tab (D-21)
    apiClient.fetchProcedureDefinition(runtime.cursor.connectionId, database, name)
      .then(def => {
        if (typeof window.openNewTab === 'function') {
          window.openNewTab(database, runtime.cursor.connectionId, def);
        }
        showFeedback('info', 'Opened ' + name + ' definition');
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
      { label: 'New Query', action: () => { /* sandbox.createTab(database, connId); */ } },
      { label: 'Refresh', action: () => { /* refresh logic */ } }
    );
  } else if (nodeType === 'view') {
    items.push(
      { label: 'Select Top 100', action: () => { runtime.editor?.setValue(`SELECT TOP 100 * FROM ${nodeName};`); } },
      { label: 'Script As CREATE', action: () => { /* future feature */ } },
      { label: 'Refresh', action: () => { /* refresh logic */ } }
    );
  } else if (nodeType === 'procedure') {
    items.push(
      { label: 'Execute', action: () => { runtime.editor?.setValue(`EXEC ${nodeName};`); } },
      { label: 'Script As CREATE', action: () => { /* future feature */ } },
      { label: 'Open in New Tab', action: () => {
        apiClient.fetchProcedureDefinition(connId, database, nodeName).then(def => {
          if (typeof window.openNewTab === 'function') {
            window.openNewTab(database, connId, def);
          }
        });
      }}
    );
  } else if (nodeType === 'function') {
    items.push(
      { label: 'Script As CREATE', action: () => { /* future feature */ } },
      { label: 'Open in New Tab', action: () => {
        apiClient.fetchProcedureDefinition(connId, database, nodeName).then(def => {
          if (typeof window.openNewTab === 'function') {
            window.openNewTab(database, connId, def);
          }
        });
      }}
    );
  } else if (nodeType === 'database') {
    items.push(
      { label: 'New Query', action: () => { /* sandbox.createTab(database, connId); */ } },
      { label: 'Refresh', action: () => { /* refresh logic */ } }
    );
  } else if (nodeType === 'group') {
    const groupId = node.dataset.groupId;
    items.push(
      { label: 'Connect', action: () => { /* connect logic */ } },
      { label: 'Rename', action: () => { /* rename inline */ } },
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

  try {
    const treeData = await apiClient.fetchObjectTree(connId);
    runtime.assignObjectTree(treeData);
    renderObjectTree(treeData);

    // Show object explorer panel
    const panel = document.getElementById('objExplorer');
    if (panel) panel.classList.add('visible');
  } catch (err) {
    console.warn('Object explorer initialization failed:', err.message);
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
  let html = `
    <h3>Query history</h3>
    <div class="sub" style="display:flex;justify-content:space-between;align-items:center">
      <span>${hist.length} of ${MAX_HISTORY} runs</span>
      ${hist.length ? `<a href="javascript:void(0)" id="clearHistBtn" style="color:var(--text-dim);font-size:10px;text-decoration:none">Clear</a>` : ''}
    </div>
    <div class="history-list" id="historyList">
  `;
  if (hist.length === 0) {
    html += `<div class="history-empty">No queries yet.<br><span style="font-family:var(--sans);font-style:normal;font-size:11.5px;color:var(--text-dim);letter-spacing:0.05em">Run a query — it'll appear here.</span></div>`;
  } else {
    for (const h of hist) {
      html += `
        <div class="history-item" data-id="${h.id}" title="${escapeHtml(h.sql)}">
          <span class="ts">
            <span class="status-dot ${h.ok ? 'ok' : 'err'}"></span>
            ${h.db}.db · ${formatHistoryTime(h.ranAt)}
          </span>
          <div class="preview">${escapeHtml(previewStatement(h.sql, 140))}</div>
        </div>
      `;
    }
  }
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('.history-item').forEach(it => {
    it.addEventListener('click', () => _hooks.loadHistoryItem(it.dataset.id));
  });
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
      hideConnectionDialog();
      showFeedback('success', `Connected to ${result.name}`);
    } else {
      showConnectionTestResult(false, result.error || 'Failed to save connection');
    }
  });

  document.getElementById('connection-dialog').classList.add('open');
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
  const rs = getResultSet(resultSetIndex);
  if (!rs) return;
  const csv = exportToCsv(rs.columns, rs.rows);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  downloadBlob(csv, `results_${resultSetIndex + 1}_${ts}.csv`, 'text/csv');
}
export function handleExportJson(resultSetIndex) {
  const rs = getResultSet(resultSetIndex);
  if (!rs) return;
  const json = exportToJson(rs.columns, rs.rows);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  downloadBlob(json, `results_${resultSetIndex + 1}_${ts}.json`, 'application/json');
}

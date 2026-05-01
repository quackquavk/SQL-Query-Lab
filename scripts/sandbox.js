// Sandbox + MS SQL modes: scratchpad SQL execution, multi-statement support,
// snippet management, MS SQL T-SQL translation.

import * as runtime from './runtime.js';
import { state, persist, addToHistory, BUILTIN_SNIPPETS } from './state.js';
import {
  cloneFromPristine, loadOrCreateSandboxDb, persistSandboxDbDebounced,
  updateDbStatus, updateHintTables
} from './db.js';
import {
  showFeedback, switchTab, toast, renderSchema, renderResultsTab,
  renderHistory, updateDirtyMark, renderResultsStreaming,
  storeResultSet, getResultSet, handleExportCsv, handleExportJson,
  clearResultSets, initObjectExplorer
} from './ui.js';
import { renderBarChart, renderLineChart, renderPieChart, destroyChart, getChartConfig, updateChartColumnOptions } from './chartRenderer.js';
import { enableOptimizationHints, clearOptimizationDecorations, isOptimizationEnabled } from './optimizationHighlights.js';
import { fetchOptimizationSuggestions } from './apiClient.js';
import { escapeHtml, splitSqlStatements, previewStatement } from './utils.js';
import { enterPractice } from './practice.js';
import { connectQuerySocket, executeQuery, cancelQuery, disconnectQuerySocket, createQueryStreamer } from './apiClient.js';

export function setMode(mode) {
  runtime.cursor.currentMode = mode;
  state.mode = mode;
  persist(true);
  document.body.classList.toggle('sandbox-active', mode === 'sandbox');
  document.body.classList.toggle('mssql-active', mode === 'mssql');
  document.body.classList.toggle('sandbox-mode', mode === 'sandbox');
  document.body.classList.toggle('mssql-mode', mode === 'mssql');
  document.body.classList.toggle('live-active', mode === 'live');

  document.getElementById('modePractice').classList.toggle('active', mode === 'practice');
  document.getElementById('modeSandbox').classList.toggle('active', mode === 'sandbox');
  document.getElementById('modeMssql').classList.toggle('active', mode === 'mssql');

  if (mode === 'sandbox') enterSandbox();
  else if (mode === 'mssql') enterMssql();
  else if (mode === 'live') enterLive();
  else enterPractice();
}

export function enterSandbox() {
  hideLiveResultsUI();

  const targetDb = state.sandboxDb || 'hospital';
  runtime.cursor.currentDbName = targetDb;
  document.getElementById('dbSelect').value = targetDb;

  loadOrCreateSandboxDb(targetDb);

  const editor = runtime.editor;
  runtime.cursor.editorLoading = true;
  const script = state.sandboxScript || `-- Sandbox mode\n-- Run anything: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE…\n-- Multi-statement scripts work — separate with ;\n\nSELECT name FROM sqlite_master WHERE type='table';\n`;
  editor.setValue(script);
  editor.setCursor({ line: editor.lineCount(), ch: 0 });
  runtime.cursor.editorLoading = false;

  updateDbStatus();
  renderSchema();
  updateDirtyMark();
  renderSnippetList();

  document.querySelectorAll('.left-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.left === 'history');
  });
  renderHistory();

  runtime.cursor.lastUserResult = null;
  runtime.cursor.lastExpectedResult = null;
  renderResultsTab('output');
  document.querySelectorAll('.results-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'output'));
  showFeedback('info', 'Sandbox', 'Run any SQL — SELECT, INSERT, UPDATE, DELETE, DDL. Multi-statement scripts work. Your DB and scripts auto-save per database.');
}

export function enterMssql() {
  const targetDb = state.mssqlDb || 'hospital';
  runtime.cursor.currentDbName = targetDb;
  document.getElementById('dbSelect').value = targetDb;

  if (!runtime.sandboxDb[targetDb]) {
    loadOrCreateSandboxDb(targetDb);
  }

  const editor = runtime.editor;
  const script = state.mssqlScript || `-- MS SQL Translation Mode\n-- Write SQLite SQL in the editor.\n-- Click "Translate to MS SQL" to see the T-SQL equivalent.\n\nSELECT name, sql FROM sqlite_master WHERE type='table';\n`;
  runtime.cursor.editorLoading = true;
  editor.setValue(script);
  editor.setCursor({ line: editor.lineCount(), ch: 0 });
  runtime.cursor.editorLoading = false;

  updateDbStatus();
  renderSchema();
  updateDirtyMark();

  runtime.cursor.lastUserResult = null;
  runtime.cursor.lastExpectedResult = null;
  renderResultsTab('output');
  document.querySelectorAll('.results-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'output'));
  showFeedback('info', 'MS SQL', 'Write SQLite SQL in the editor and click "Translate to MS SQL" to convert it to T-SQL syntax.');
}

export async function enterLive() {
  const editor = runtime.editor;
  const script = state.liveScript || `-- Live SQL Server Mode\n-- Connected to: ${runtime.cursor.connectionName || 'SQL Server'}\n-- Run queries against your live database.\n\nSELECT 1 as test;\n`;
  runtime.cursor.editorLoading = true;
  editor.setValue(script);
  editor.setCursor({ line: editor.lineCount(), ch: 0 });
  runtime.cursor.editorLoading = false;

  runtime.cursor.lastUserResult = null;
  runtime.cursor.lastExpectedResult = null;
  renderResultsTab('output');
  document.querySelectorAll('.results-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'output'));
  showFeedback('info', 'Live Mode', `Connected to ${runtime.cursor.connectionName || 'SQL Server'}. Run queries against your live database.`);

  // Show live-specific results UI
  showLiveResultsUI();

  // Initialize object explorer if connected
  if (runtime.cursor.connectionId) {
    initObjectExplorer();
  }
}

export function showLiveResultsUI() {
  const body = document.getElementById('resultsBody');
  const gridWrap = document.getElementById('results-grid-wrap');
  const exportDiv = document.getElementById('results-export');
  const pagination = document.getElementById('results-pagination');
  const status = document.getElementById('results-status');
  const loading = document.getElementById('results-loading');
  const empty = document.getElementById('results-empty');
  const chartToolbar = document.getElementById('chartToolbar');
  const chartContainer = document.getElementById('chartContainer');
  if (body) body.style.display = 'none';
  if (gridWrap) gridWrap.classList.remove('hidden');
  if (exportDiv) exportDiv.classList.remove('hidden');
  if (pagination) pagination.classList.remove('hidden');
  if (status) status.classList.remove('hidden');
  if (loading) loading.classList.add('hidden');
  if (empty) empty.classList.add('hidden');
  if (chartToolbar) chartToolbar.style.display = '';
  if (chartContainer) chartContainer.style.display = '';

  // Update live status indicator
  const liveStatus = document.getElementById('live-status');
  const connName = document.getElementById('conn-name');
  const liveConnName = document.getElementById('liveConnectionName');
  if (liveStatus && runtime.cursor.connectionName) {
    liveStatus.classList.remove('hidden');
    if (connName) connName.textContent = runtime.cursor.connectionName;
    if (liveConnName) liveConnName.textContent = 'Connected: ' + runtime.cursor.connectionName;
  } else if (liveStatus) {
    liveStatus.classList.add('hidden');
    if (liveConnName) liveConnName.textContent = 'Not connected';
  }

  // Wire export buttons
  const csvBtn = document.getElementById('btn-export-csv');
  const jsonBtn = document.getElementById('btn-export-json');
  if (csvBtn) csvBtn.onclick = () => handleExportCsv(0);
  if (jsonBtn) jsonBtn.onclick = () => handleExportJson(0);
}

export function hideLiveResultsUI() {
  const body = document.getElementById('resultsBody');
  const gridWrap = document.getElementById('results-grid-wrap');
  const exportDiv = document.getElementById('results-export');
  const pagination = document.getElementById('results-pagination');
  const status = document.getElementById('results-status');
  const loading = document.getElementById('results-loading');
  const empty = document.getElementById('results-empty');
  const chartToolbar = document.getElementById('chartToolbar');
  const chartContainer = document.getElementById('chartContainer');
  if (body) body.style.display = '';
  if (gridWrap) gridWrap.classList.add('hidden');
  if (exportDiv) exportDiv.classList.add('hidden');
  if (pagination) pagination.innerHTML = '';
  if (status) { status.className = 'results-status hidden'; status.textContent = ''; }
  if (loading) loading.classList.add('hidden');
  if (empty) empty.classList.add('hidden');
  if (chartToolbar) chartToolbar.style.display = 'none';
  if (chartContainer) { chartContainer.style.display = 'none'; destroyChart(); }

  const liveStatus = document.getElementById('live-status');
  if (liveStatus) liveStatus.classList.add('hidden');
  const liveConnName = document.getElementById('liveConnectionName');
  if (liveConnName) liveConnName.textContent = 'Not connected';

  clearResultSets();
}

export async function fetchAndShowOptimizations(sql) {
  if (!runtime.cursor.connectionId || !sql.trim()) return;
  try {
    const data = await fetchOptimizationSuggestions(sql, runtime.cursor.currentDbName);
    if (data.suggestions && data.suggestions.length > 0) {
      enableOptimizationHints(runtime.editor, data.suggestions);
      showFeedback('info', 'Optimization', `${data.suggestions.length} suggestion(s) found — look for the wavy underlines`);
    }
  } catch (e) {
    console.warn('Optimization fetch failed:', e.message);
  }
}

export function toggleOptimizationHints() {
  if (isOptimizationEnabled()) {
    disableOptimizationHints();
    showFeedback('info', 'Optimization', 'Optimization hints disabled');
  } else {
    const sql = runtime.editor.getValue();
    if (sql.trim()) {
      fetchAndShowOptimizations(sql);
    }
  }
}

export async function runLiveQuery(sql, options = {}) {
  const { connectionId, timeout = 30000 } = options;
  const connId = connectionId || runtime.cursor.connectionId;
  if (!connId) {
    throw new Error('Not connected to a server');
  }

  runtime.cursor.queryState = 'running';
  runtime.cursor.currentResultsView = null;

  const { createQueryStreamer } = await import('./apiClient.js');

  return new Promise((resolve, reject) => {
    const streamer = createQueryStreamer(connId, sql, { timeout });

    streamer.addEventListener('columns', ({ columns }) => {
      const resultsView = renderResultsStreaming(columns, {
        pageSize: runtime.cursor.livePageSize || 100,
        onPageChange: (page) => { runtime.cursor.livePage = page; },
        onSort: (col, dir) => { runtime.cursor.liveSort = { col, dir }; }
      });
      runtime.cursor.currentResultsView = resultsView;
      storeResultSet(columns, []);
      runtime.cursor.currentResultSetIndex = 0;
      runtime.cursor.lastUserResult = { columns, values: [] };
      updateChartColumnOptions(columns.map(c => c.name));
    });

    streamer.addEventListener('rows', ({ rows, total }) => {
      const rv = runtime.cursor.currentResultsView;
      if (rv) rv.addRows(rows);
      const idx = runtime.cursor.currentResultSetIndex ?? 0;
      const rs = getResultSet(idx);
      if (rs) rs.rows.push(...rows);
      if (runtime.cursor.lastUserResult) {
        runtime.cursor.lastUserResult.values.push(...rows);
      }
    });

    streamer.addEventListener('done', ({ rowsAffected, executionTime }) => {
      const rv = runtime.cursor.currentResultsView;
      if (rv) rv.complete(executionTime, rowsAffected);
      runtime.cursor.queryState = 'done';
      runtime.cursor.lastExecutionTime = executionTime;
      runtime.cursor.lastRowCount = rowsAffected;
      showFeedback('success', 'OK', `${rowsAffected} rows, ${executionTime}ms`);
      switchTab('output');

      if (isOptimizationEnabled()) {
        fetchAndShowOptimizations(sql);
      }

      streamer.destroy();
      resolve({ executionTime, rowCount: rowsAffected });
    });

    streamer.addEventListener('error', ({ message }) => {
      const rv = runtime.cursor.currentResultsView;
      if (rv) rv.error(message);
      runtime.cursor.queryState = 'error';
      runtime.cursor.lastError = message;
      showFeedback('error', 'Query error', message);
      switchTab('message');
      streamer.destroy();
      reject(new Error(message));
    });

    streamer.connect().then(() => {
      streamer.setTimeout(timeout, () => {
        runtime.cursor.queryState = 'timeout';
        runtime.cursor.lastError = 'Query timeout';
        showFeedback('error', 'Timeout', `Query timed out after ${timeout / 1000}s`);
        switchTab('message');
        streamer.destroy();
        reject(new Error('Query timeout'));
      });
    }).catch(err => {
      runtime.cursor.queryState = 'error';
      runtime.cursor.lastError = err.message;
      showFeedback('error', 'Connection error', err.message);
      switchTab('message');
      reject(err);
    });
  });
}

export function cancelLiveQuery() {
  if (runtime.cursor.queryState !== 'running') return;
  runtime.cursor.queryState = 'cancelled';
  const rv = runtime.cursor.currentResultsView;
  if (rv) rv.error('Query cancelled');
  showFeedback('warn', 'Cancelled', 'Query was cancelled');
  switchTab('message');
}

export function translateToMssql(sql) {
  let result = sql;

  result = result.replace(/\|\|/g, '+');
  result = result.replace(/\bAUTOINCREMENT\b/gi, 'IDENTITY(1,1)');
  result = result.replace(/\bSERIAL\b/gi, 'INT IDENTITY(1,1)');
  result = result.replace(/\bINTEGER PRIMARY KEY\b/gi, 'INT PRIMARY KEY IDENTITY(1,1)');
  result = result.replace(/\bTINYINT\b/gi, 'TINYINT');
  result = result.replace(/\bINT\b/gi, 'INT');
  result = result.replace(/\bREAL\b/gi, 'FLOAT');
  result = result.replace(/\bDOUBLE\b/gi, 'FLOAT');
  result = result.replace(/\bTEXT\b/gi, 'NVARCHAR(MAX)');
  result = result.replace(/\bBLOB\b/gi, 'VARBINARY(MAX)');
  result = result.replace(/\bBOOLEAN\b/gi, 'BIT');
  result = result.replace(/\bDATE\b/gi, 'DATE');
  result = result.replace(/\bDATETIME\b/gi, 'DATETIME');
  result = result.replace(/\bTIMESTAMP\b/gi, 'DATETIME2');

  result = result.replace(/\bIFNULL\s*\(/gi, 'ISNULL(');
  result = result.replace(/\bIIF\s*\(/gi, 'IIF(');

  result = result.replace(/\bSUBSTR\s*\(/gi, 'SUBSTRING(');
  result = result.replace(/\bLENGTH\s*\(/gi, 'LEN(');
  result = result.replace(/\bUPPER\s*\(/gi, 'UPPER(');
  result = result.replace(/\bLOWER\s*\(/gi, 'LOWER(');
  result = result.replace(/\bTRIM\s*\(/gi, 'TRIM(');
  result = result.replace(/\bLTRIM\s*\(/gi, 'LTRIM(');
  result = result.replace(/\bRTRIM\s*\(/gi, 'RTRIM(');
  result = result.replace(/\bINSTR\s*\(/gi, 'CHARINDEX(');
  result = result.replace(/\bREPLACE\s*\(/gi, 'REPLACE(');
  result = result.replace(/\bSUBSTRING\s*\(/gi, 'SUBSTRING(');

  result = result.replace(/\bDATE\s*\(\s*'now'\s*\)/gi, 'GETDATE()');
  result = result.replace(/\bDATE\s*\(\s*'localtime'\s*\)/gi, 'GETDATE()');
  result = result.replace(/\bSTRFTIME\s*\(\s*['"]%Y-%m-%d['"]\s*,\s*([^)]+)\s*\)/gi, 'FORMAT($1, \'yyyy-MM-dd\')');
  result = result.replace(/\bSTRFTIME\s*\(\s*['"]%H:%M:%S['"]\s*,\s*([^)]+)\s*\)/gi, 'FORMAT($1, \'HH:mm:ss\')');
  result = result.replace(/\bSTRFTIME\s*\(\s*['"]%Y-%m-%d %H:%M:%S['"]\s*,\s*([^)]+)\s*\)/gi, 'FORMAT($1, \'yyyy-MM-dd HH:mm:ss\')');
  result = result.replace(/\bJULIANDAY\s*\(/gi, 'DATEDIFF(day, \'1970-01-01\', ');

  result = result.replace(/\bRANDOM\s*\(\s*\)/gi, 'NEWID()');
  result = result.replace(/\bLAST_INSERT_ROWID\s*\(\s*\)/gi, 'SCOPE_IDENTITY()');
  result = result.replace(/\bCHANGES\s*\(\s*\)/gi, '@@ROWCOUNT');
  result = result.replace(/\bTOTAL\s*\(\s*\)/gi, 'SUM(');
  result = result.replace(/\bCOUNT\s*\(\s*\*\s*\)/gi, 'COUNT(*)');

  result = result.replace(/\bLIKE\s+([^'"]+)\s+ESCAPE\s+['"]([^'"]+)['"]/gi, 'LIKE $1 ESCAPE \'$2\'');

  result = result.replace(/\bDROP TABLE IF EXISTS\s+(\w+)/gi, 'IF OBJECT_ID(\'$1\', \'U\') IS NOT NULL DROP TABLE $1');
  result = result.replace(/\bDROP INDEX IF EXISTS\s+(\w+)\s+ON\s+(\w+)/gi, 'IF EXISTS (SELECT * FROM sys.indexes WHERE name = \'$1\' AND object_id = OBJECT_ID(\'$2\')) DROP INDEX $2.$1');
  result = result.replace(/\bCREATE TABLE IF NOT EXISTS\s+(\w+)/gi, 'IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = \'$1\') CREATE TABLE');

  result = result.replace(/\bLIMIT\s+(\d+)\s*(?:,\s*(\d+))?\s*$/gi, (match, offset, limit) => {
    if (limit !== undefined) {
      return ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    }
    return ` OFFSET 0 ROWS FETCH NEXT ${offset} ROWS ONLY`;
  });

  result = result.replace(/\bLIMIT\s+(\d+)\s*(?:,\s*(\d+))?\s*\b/gi, (match, offset, limit) => {
    if (limit !== undefined) {
      return ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    }
    return ` OFFSET 0 ROWS FETCH NEXT ${offset} ROWS ONLY`;
  });

  result = result.replace(/\bRETURNING\s+([^;]+)/gi, 'OUTPUT INSERTED.$1');

  result = result.replace(/\bVACUUM\b/gi, '-- VACUUM not needed in MS SQL');

  result = result.replace(/\bPRAGMA\s+([\w_]+)\s*\(/gi, '-- PRAGMA not supported: PRAGMA $1(');
  result = result.replace(/\bPRAGMA\s+([\w_]+)/gi, '-- PRAGMA not supported: PRAGMA $1');

  result = result.replace(/\'(?=(?:[^']*\'[^']*\')*[^"]*\Z)(?!"")(?!"")(?!\')/g, "''");

  return result;
}

export function runMssqlTranslation() {
  const editor = runtime.editor;
  const sql = editor.getValue().trim();
  if (!sql || sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim() === '') {
    showFeedback('error', 'Empty query', 'Write some SQL before translating.');
    switchTab('message');
    return;
  }

  const mssql = translateToMssql(sql);

  const output = document.getElementById('mssqlOutput');
  const empty = document.getElementById('mssqlEmpty');
  if (output && empty) {
    output.style.display = 'block';
    empty.style.display = 'none';
    output.innerHTML = `<div class="mssql-label">T-SQL (MS SQL Server)</div>${escapeHtml(mssql)}`;
  }

  const mssqlRight = document.getElementById('mssqlRight');
  if (mssqlRight) {
    const sb = mssqlRight.querySelector('.sandbox-body');
    if (sb) sb.scrollTop = 0;
  }
  showFeedback('success', 'Translated', 'SQLite SQL has been translated to MS SQL Server T-SQL syntax.');
  switchTab('message');
}

// Run sandbox SQL. Multiple statements OK. We render every result block
// so the user can see results from each SELECT in order.
export function runSandboxQuery() {
  const editor = runtime.editor;
  const sql = editor.getValue().trim();
  if (!sql || sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim() === '') {
    showFeedback('error', 'Empty', 'Write some SQL before running.');
    switchTab('message');
    return;
  }
  const db = runtime.sandboxDb[runtime.cursor.currentDbName];
  let results;
  const startedAt = Date.now();
  try {
    results = db.exec(sql);
  } catch (e) {
    addToHistory(sql, false, e.message, renderHistory);
    showFeedback('error', 'SQL error', `<pre>${escapeHtml(e.message)}</pre>`);
    switchTab('message');
    return;
  }
  const elapsed = Date.now() - startedAt;

  const allStmts = splitSqlStatements(sql);
  let tableExtracted = false;
  if (results && results.length > 0) {
    let ri = 0;
    for (const stmt of allStmts) {
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b/i.test(stmt) && ri < results.length) {
        results[ri]._stmt = previewStatement(stmt);
        // Extract table name from first non-PRAGMA/EXPLAIN statement
        if (!tableExtracted && /^\s*(SELECT|WITH|VALUES)\b/i.test(stmt)) {
          tableExtracted = true;
          try {
            // Try "FROM tableName" pattern first (most common in SELECT)
            const fromMatch = stmt.match(/\bFROM\s+([^\s,;()]+)/i);
            if (fromMatch) {
              runtime.cursor.lastQueryTableName = fromMatch[1].replace(/[`"\[\]]/g, '');
            } else {
              // For WITH (CTE), try to find the table referenced after the WITH name
              const cteMatch = stmt.match(/\bWITH\s+\w+\s+as\s*\(\s*(?:SELECT.*?\bFROM\s+([^\s,;()]+)|VALUES.*?\bIN\s*\(\s*SELECT\s+\w+\s+FROM\s+([^\s,;()]+))/i);
              if (cteMatch && cteMatch[1]) {
                runtime.cursor.lastQueryTableName = cteMatch[1].replace(/[`"\[\]]/g, '');
              } else if (cteMatch && cteMatch[2]) {
                runtime.cursor.lastQueryTableName = cteMatch[2].replace(/[`"\[\]]/g, '');
              }
            }
          } catch (e) {
            console.warn('inlineEdit: ERROR extracting table name:', e.message);
            runtime.cursor.lastQueryTableName = null;
          }
        }
        ri++;
      }
    }
  }

  const isMutating = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|TRUNCATE|VACUUM|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql);
  if (isMutating) {
    runtime.sandboxDirty[runtime.cursor.currentDbName] = true;
    persistSandboxDbDebounced(runtime.cursor.currentDbName);
    updateDirtyMark();
    renderSchema();
    updateHintTables();
  }

  addToHistory(sql, true, null, renderHistory);

  if (results && results.length > 0) {
    runtime.cursor.lastUserResult = results;
    const totalRows = results.reduce((a, r) => a + (r.values || []).length, 0);
    document.getElementById('outCount').textContent = totalRows;
    const stmtCount = allStmts.length;
    const resCount = results.length;
    showFeedback('success', 'OK',
      `${stmtCount} statement${stmtCount === 1 ? '' : 's'} executed in ${elapsed}ms · ${resCount} result block${resCount === 1 ? '' : 's'} · ${totalRows} total row${totalRows === 1 ? '' : 's'}.`);
  } else {
    runtime.cursor.lastUserResult = { columns: [], values: [] };
    document.getElementById('outCount').textContent = '0';
    const stmtCount = allStmts.length;
    showFeedback('success', 'OK', `${stmtCount} statement${stmtCount === 1 ? '' : 's'} executed in ${elapsed}ms. No SELECT results.`);
  }
  switchTab('output');
}

// Reset the active sandbox DB back to its seed state
export function resetSandboxDb() {
  const name = runtime.cursor.currentDbName;
  if (!confirm(`Reset ${name}.db back to its original seed data? All your changes to this database will be lost.`)) return;
  runtime.sandboxDb[name] = cloneFromPristine(name);
  runtime.sandboxDirty[name] = false;
  if (state.sandboxStates) delete state.sandboxStates[name];
  persist(true);
  updateDbStatus();
  renderSchema();
  updateDirtyMark();
  toast(`${name}.db restored to seed.`, 'Reset');
}

// ─── Tab Management ─────────────────────────────────

runtime.setTabApi({
  createTab, closeTab, switchTabById, persistTabs, markTabDirty, reorderTabs, restoreTabs
});

export function createTab(database, connectionId) {
  const id = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const tabCount = runtime.openTabs.length + 1;
  const title = database ? `${database}.db` : `Query ${tabCount}`;
  runtime.openTabs.push({
    id,
    title,
    sql: '',
    database: database || runtime.cursor.currentDbName,
    connectionId: connectionId || runtime.cursor.connectionId,
    dirty: false
  });
  runtime.incTabCounter();
  persistTabs();
  return id;
}

export function closeTab(tabId) {
  const idx = runtime.openTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  const tab = runtime.openTabs[idx];
  if (tab.dirty) {
    const save = confirm('Close without saving changes to "' + tab.title + '"?');
    if (!save) return;
  }
  runtime.openTabs.splice(idx, 1);
  if (runtime.activeTabId === tabId) {
    if (runtime.openTabs.length > 0) {
      const nextIdx = Math.min(idx, runtime.openTabs.length - 1);
      switchTabById(runtime.openTabs[nextIdx].id);
    } else {
      runtime.setActiveTabId(null);
    }
  }
  persistTabs();
}

export function switchTabById(tabId) {
  const tab = runtime.openTabs.find(t => t.id === tabId);
  if (!tab) return;

  // Save current tab SQL to state before switching
  if (runtime.activeTabId && runtime.editor) {
    const currentTab = runtime.openTabs.find(t => t.id === runtime.activeTabId);
    if (currentTab) {
      currentTab.sql = runtime.editor.getValue();
    }
  }

  runtime.setActiveTabId(tabId);
  state.activeTabId = tabId;

  if (runtime.editor) {
    runtime.cursor.editorLoading = true;
    runtime.editor.setValue(tab.sql || '');
    runtime.editor.setCursor({ line: 0, ch: 0 });
    runtime.cursor.editorLoading = false;
  }

  if (tab.database) {
    runtime.cursor.currentDbName = tab.database;
    if (runtime.cursor.currentMode === 'sandbox') {
      state.sandboxDb = tab.database;
      document.getElementById('dbSelect').value = tab.database;
      loadOrCreateSandboxDb(tab.database);
      updateDbStatus();
      renderSchema();
    }
  }

  persistTabs();
  if (typeof renderTabBar === 'function') renderTabBar();
}

export function persistTabs() {
  state.openTabs = runtime.openTabs;
  state.activeTabId = runtime.activeTabId;
  persist(true);
}

export function markTabDirty(tabId, dirty) {
  const tab = runtime.openTabs.find(t => t.id === tabId);
  if (tab) {
    tab.dirty = dirty;
    persistTabs();
  }
  if (typeof renderTabBar === 'function') renderTabBar();
}

export function reorderTabs(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const tabs = runtime.openTabs;
  const [moved] = tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, moved);
  persistTabs();
  if (typeof renderTabBar === 'function') renderTabBar();
}

export function restoreTabs() {
  if (state.openTabs && state.openTabs.length > 0) {
    runtime.setOpenTabs(state.openTabs);
    runtime.setActiveTabId(state.activeTabId);
    if (runtime.openTabs.length > 0 && runtime.activeTabId) {
      const tab = runtime.openTabs.find(t => t.id === runtime.activeTabId);
      if (tab) {
        if (runtime.editor) {
          runtime.cursor.editorLoading = true;
          runtime.editor.setValue(tab.sql || '');
          runtime.editor.setCursor({ line: 0, ch: 0 });
          runtime.cursor.editorLoading = false;
        }
        if (tab.database) {
          runtime.cursor.currentDbName = tab.database;
          if (runtime.cursor.currentMode === 'sandbox') {
            state.sandboxDb = tab.database;
            document.getElementById('dbSelect').value = tab.database;
          }
        }
      }
    }
  } else {
    // Create default tab
    const defaultId = createTab(runtime.cursor.currentDbName, runtime.cursor.connectionId);
    runtime.setActiveTabId(defaultId);
  }
  if (typeof renderTabBar === 'function') renderTabBar();
}

// ─── Snippets ─────────────────────────────────────────

export function renderSnippetList() {
  const list = document.getElementById('snippetList');
  const count = document.getElementById('snippetCount');
  if (!list) return;

  const builtin = BUILTIN_SNIPPETS || [];
  const userSnippets = state.snippets || [];
  const allSnippets = [...builtin, ...userSnippets];
  const snippets = allSnippets;

  count.textContent = snippets.length;
  if (snippets.length === 0) {
    list.innerHTML = '<div class="snippet-empty">No saved snippets yet</div>';
    return;
  }
  const sorted = [...snippets].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  list.innerHTML = sorted.map(s => `
    <div class="snippet-row" data-id="${s.id}">
      <div class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
      <div class="preview" title="${escapeHtml(s.sql.slice(0, 200))}">${escapeHtml(s.sql.replace(/\s+/g, ' ').slice(0, 60))}</div>
      ${s.builtin ? '<span class="builtin-tag">built-in</span>' : ''}
      <button class="ins-btn" data-ins="${s.id}" title="Insert at cursor">→</button>
      ${!s.builtin ? `<button class="del" data-del="${s.id}" title="Delete snippet">×</button>` : ''}
    </div>
  `).join('');
  list.querySelectorAll('.snippet-row').forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.classList.contains('del') || e.target.classList.contains('ins-btn')) return;
      loadSnippet(r.dataset.id);
    });
  });
  list.querySelectorAll('.ins-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      insertSnippetAtCursor(b.dataset.ins);
    });
  });
  list.querySelectorAll('.del').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSnippet(b.dataset.del);
    });
  });
}

export function saveCurrentAsSnippet() {
  const editor = runtime.editor;
  const sql = editor.getValue().trim();
  if (!sql) {
    toast('Nothing to save — write some SQL first.', 'Empty');
    return;
  }
  const name = prompt('Name this snippet:', `Snippet ${(state.snippets || []).length + 1}`);
  if (!name) return;
  const snippet = {
    id: 'snip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: name.slice(0, 80),
    db: runtime.cursor.currentDbName,
    sql: sql,
    createdAt: Date.now()
  };
  state.snippets = state.snippets || [];
  state.snippets.push(snippet);
  persist(true);
  renderSnippetList();
  toast('Saved as "' + name + '"', 'Snippet saved');
}

export function loadSnippet(id) {
  const editor = runtime.editor;
  // Check built-ins first
  const builtin = BUILTIN_SNIPPETS.find(x => x.id === id);
  if (builtin) {
    runtime.cursor.editorLoading = true;
    editor.setValue(builtin.sql);
    editor.setCursor({ line: editor.lineCount(), ch: 0 });
    runtime.cursor.editorLoading = false;
    toast('Loaded "' + builtin.name + '"', 'Snippet');
    return;
  }
  const s = (state.snippets || []).find(x => x.id === id);
  if (!s) return;
  if (s.db !== runtime.cursor.currentDbName) {
    runtime.cursor.currentDbName = s.db;
    state.sandboxDb = s.db;
    document.getElementById('dbSelect').value = s.db;
    loadOrCreateSandboxDb(s.db);
    updateDbStatus();
    renderSchema();
    updateDirtyMark();
  }
  runtime.cursor.editorLoading = true;
  editor.setValue(s.sql);
  editor.setCursor({ line: editor.lineCount(), ch: 0 });
  runtime.cursor.editorLoading = false;
  state.sandboxScript = s.sql;
  persist();
  editor.focus();
  toast('Loaded "' + s.name + '"', 'Snippet');
}

export function deleteSnippet(id) {
  state.snippets = (state.snippets || []).filter(s => s.id !== id);
  persist(true);
  renderSnippetList();
}

// ─── Snippet CRUD ─────────────────────────────────────────
// SNIP-01: save with name/category, SNIP-03: delete by id, SNIP-03: edit snippet
export function saveSnippet({ id, name, category, sql }) {
  if (!name || !sql) return;
  if (id) {
    const idx = (state.snippets || []).findIndex(s => s.id === id);
    if (idx !== -1) {
      state.snippets[idx] = { ...state.snippets[idx], name, category, sql, updatedAt: Date.now() };
    }
  } else {
    state.snippets = state.snippets || [];
    state.snippets.push({
      id: 'snip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name,
      category: category || 'General',
      sql,
      db: runtime.cursor.currentDbName,
      createdAt: Date.now(),
      builtin: false
    });
  }
  persist(true);
  renderSnippetList();
}

export function updateSnippet(id, updates) {
  const idx = (state.snippets || []).findIndex(s => s.id === id);
  if (idx === -1) return;
  state.snippets[idx] = { ...state.snippets[idx], ...updates, updatedAt: Date.now() };
  persist(true);
  renderSnippetList();
}

// SNIP-02: insert snippet SQL at current cursor position
export function insertSnippetAtCursor(id) {
  const editor = runtime.editor;
  const s = (state.snippets || []).find(x => x.id === id);
  if (!s) return;
  const from = editor.listSelections()[0];
  editor.replaceRange(s.sql, from.from, from.to);
}

// Get all snippets including built-ins
export function getAllSnippets() {
  const builtin = BUILTIN_SNIPPETS || [];
  return [...builtin, ...(state.snippets || [])];
}

// Save snippet at cursor (for "New Snippet" workflow)
export function saveSnippetAtCursor(name, category) {
  const editor = runtime.editor;
  const sql = editor.getSelection() || editor.getValue();
  if (!sql.trim()) {
    toast('Nothing to save — write some SQL first.', 'Empty');
    return;
  }
  if (!name) {
    name = prompt('Name this snippet:', `Snippet ${(state.snippets || []).length + 1}`);
    if (!name) return;
  }
  saveSnippet({ name, category: category || 'General', sql });
  toast('Saved as "' + name + '"', 'Snippet saved');
}

// Add/remove snippet categories (SNIP-04)
export function addSnippetCategory(name) {
  if (!name || state.snippetCategories.includes(name)) return;
  state.snippetCategories.push(name);
  persist(true);
}

export function deleteSnippetCategory(name) {
  if (!name || name === 'General') return;
  const idx = state.snippetCategories.indexOf(name);
  if (idx === -1) return;
  state.snippetCategories.splice(idx, 1);
  // Move snippets in this category to General
  (state.snippets || []).forEach(s => {
    if (s.category === name) s.category = 'General';
  });
  persist(true);
}

export function loadHistoryItem(id) {
  const editor = runtime.editor;
  const h = (state.history || []).find(x => x.id === id);
  if (!h) return;
  if (h.db && h.db !== runtime.cursor.currentDbName && runtime.sandboxDb[h.db]) {
    runtime.cursor.currentDbName = h.db;
    state.sandboxDb = h.db;
    document.getElementById('dbSelect').value = h.db;
    updateDbStatus();
    renderSchema();
  }
  runtime.cursor.editorLoading = true;
  editor.setValue(h.sql);
  editor.setCursor({ line: editor.lineCount() - 1, ch: 0 });
  runtime.cursor.editorLoading = false;
  state.sandboxScript = h.sql;
  persist();
  editor.focus();
  toast('Query loaded into editor.', 'From history');
}

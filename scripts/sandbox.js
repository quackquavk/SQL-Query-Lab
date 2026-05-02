// Sandbox + MS SQL modes: scratchpad SQL execution, multi-statement support,
// snippet management, MS SQL T-SQL translation.

import * as runtime from './runtime.js';
import { state, persist, addToHistory, BUILTIN_SNIPPETS, BUILTIN_TEMPLATES } from './state.js';
import {
  cloneFromPristine, loadOrCreateSandboxDb, persistSandboxDbDebounced,
  updateDbStatus, updateHintTables
} from './db.js';
import {
  showFeedback, switchTab, toast, renderSchema, renderResultsTab,
  renderHistory, updateDirtyMark, renderResultsStreaming,
  storeResultSet, getResultSet, handleExportCsv, handleExportJson,
  clearResultSets, initObjectExplorer, updateConnectionUI
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
  // Hide object explorer in sandbox mode
  document.getElementById('objExplorer')?.classList.remove('visible');
  document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('live-tab'));

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
  initSnippetSearch();

  // Expose runSandbox to window for inlineEdit re-render trigger.
  window._runSandbox = runSandboxQuery;

  // Also expose reset for testing.
  window._resetSandboxDb = resetSandboxDb;

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
  hideLiveResultsUI();
  // Hide object explorer in mssql mode
  document.getElementById('objExplorer')?.classList.remove('visible');
  document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('live-tab'));

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

  // Show live-specific results UI and update connection indicator
  showLiveResultsUI();
  updateConnectionUI();

  // Show object explorer and select the "Object Explorer" left tab
  const panel = document.getElementById('objExplorer');
  if (panel) panel.classList.add('visible');

  // Hide leftContent and show objExplorer, select the explorer tab
  document.getElementById('leftContent').style.display = 'none';
  document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('active'));

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
  const toolbar = document.getElementById('resultsToolbar');
  if (body) body.style.display = 'none';
  if (gridWrap) gridWrap.classList.remove('hidden');
  if (exportDiv) exportDiv.classList.remove('hidden');
  if (pagination) pagination.classList.remove('hidden');
  if (status) status.classList.remove('hidden');
  if (loading) loading.classList.add('hidden');
  if (empty) empty.classList.add('hidden');
  if (chartToolbar) chartToolbar.style.display = '';
  if (chartContainer) chartContainer.style.display = '';
  if (toolbar) toolbar.style.display = '';

  window._runSandbox = runSandboxQuery;

  // Also expose reset for testing.
  window._resetSandboxDb = resetSandboxDb;

  // Wire export buttons
  const csvBtn = document.getElementById('btn-export-csv');
  const jsonBtn = document.getElementById('btn-export-json');
  if (csvBtn) csvBtn.onclick = () => handleExportCsv(0);
  if (jsonBtn) jsonBtn.onclick = () => handleExportJson(0);

  // Wire Show Execution Plan button to onclick handler
  const execPlanBtn = document.getElementById('showExecPlanBtn'); // showExecPlanBtn onclick
  if (execPlanBtn) {
    execPlanBtn.onclick = async () => {
      const sql = runtime.editor.getValue().trim();
      if (!sql) {
        showFeedback('error', 'Empty query', 'Write a query before viewing the execution plan.');
        return;
      }
      const panel = document.getElementById('execPlanPanel');
      if (panel) panel.style.display = '';
      // Show loading state
      panel.innerHTML = '<div class="exec-plan-loading">Fetching execution plan…</div>';
      switchTab('exec-plan');
      try {
        const { fetchExecutionPlan, parseShowplanXml, computeCostPercentages, initExecPlanViewer } = await import('./execPlanViewer.js');
        const xml = await fetchExecutionPlan(sql);
        const { operators, missingIndexes } = parseShowplanXml(xml);
        computeCostPercentages(operators);
        const svgEl = document.getElementById('execPlanSvg');
        if (svgEl) {
          initExecPlanViewer(svgEl, { operators, missingIndexes });
        }
      } catch (err) {
        if (panel) panel.innerHTML = `<div class="exec-plan-error"><h3>Execution plan error</h3><p>${escapeHtml(err.message)}</p></div>`;
        showFeedback('error', 'Execution plan failed', err.message);
      }
    };
  }
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
    runtime.cursor.activeStreamer = streamer;

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

    streamer.addEventListener('done', ({ executionTime, rowCount }) => {
      const rv = runtime.cursor.currentResultsView;
      if (rv) rv.complete(executionTime, rowCount ?? 0);
      runtime.cursor.queryState = 'done';
      runtime.cursor.lastExecutionTime = executionTime;
      runtime.cursor.lastRowCount = rowCount ?? 0;
      showFeedback('success', 'OK', `${rowCount ?? 0} rows, ${executionTime}ms`);
      switchTab('output');

      addToHistory(sql, true, null, renderHistory, { executionTime, rowCount });

      if (isOptimizationEnabled()) {
        fetchAndShowOptimizations(sql);
      }

      streamer.destroy();
      resolve({ executionTime, rowCount });
    });

    streamer.addEventListener('close', () => {
      // Unexpected WebSocket close — update topbar to disconnected state
      runtime.cursor.connected = false;
      updateConnectionUI();
    });

    streamer.addEventListener('error', ({ message }) => {
      const rv = runtime.cursor.currentResultsView;
      if (rv) rv.error(message);
      runtime.cursor.queryState = 'error';
      runtime.cursor.lastError = message;
      showFeedback('error', 'Query error', message);
      switchTab('message');

      addToHistory(sql, false, message, renderHistory, { executionTime: null, rowCount: null });

      streamer.destroy();
      reject(new Error(message));
    });

    streamer.connect().then(() => {
      const _timeoutTimer = streamer.setTimeout(timeout, () => {
        runtime.cursor.queryState = 'timeout';
        runtime.cursor.lastError = 'Query timeout';
        showFeedback('error', 'Timeout', `Query timed out after ${timeout / 1000}s`);
        switchTab('message');
        streamer.destroy();
        reject(new Error('Query timeout'));
      });
      streamer.addEventListener('done', () => clearTimeout(_timeoutTimer), { once: true });
      streamer.addEventListener('error', () => clearTimeout(_timeoutTimer), { once: true });
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
  if (runtime.cursor.activeStreamer) {
    runtime.cursor.activeStreamer.cancel();
    runtime.cursor.activeStreamer = null;
  }
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
    addToHistory(sql, false, e.message, renderHistory, { executionTime: null, rowCount: null });
    showFeedback('error', 'SQL error', `<pre>${escapeHtml(e.message)}</pre>`);
    switchTab('message');
    return;
  }
  const elapsed = Date.now() - startedAt;

  const allStmts = splitSqlStatements(sql);
  let tableExtracted = false;
  let totalRows = 0;
  if (results && results.length > 0) {
    totalRows = results.reduce((a, r) => a + (r.values || []).length, 0);
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

  addToHistory(sql, true, null, renderHistory, { executionTime: elapsed, rowCount: totalRows });

  if (results && results.length > 0) {
    runtime.cursor.lastUserResult = results;
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

// ─── Template CRUD ──────────────────────────────────────────────────────────

// Find a template by id — checks BUILTIN_TEMPLATES first, then userTemplates
function findTemplate(id) {
  return BUILTIN_TEMPLATES.find(t => t.id === id)
    || (state.userTemplates || []).find(t => t.id === id)
    || null;
}

// Insert a template's SQL at the current editor cursor position
// Uses CodeMirror DOM element's CodeMirror property directly to avoid
// ES module initialization order issues where runtime.editor may resolve
// to the textarea before editor.js runs setEditor().
export function insertTemplateAtCursor(id) {
  const cmEl = document.querySelector('.CodeMirror');
  if (!cmEl || !cmEl.CodeMirror) return;
  const editor = cmEl.CodeMirror;
  const tpl = findTemplate(id);
  if (!tpl) {
    toast('Template not found.', 'Error');
    return;
  }
  const from = editor.listSelections()[0];
  editor.replaceRange(tpl.sql, from.from, from.to);
  editor.focus();
  toast('Inserted "' + tpl.name + '"', 'Template');
}

// Save a new user template
export function saveUserTemplate({ name, description, sql }) {
  if (!name || !sql) return;
  state.userTemplates = state.userTemplates || [];
  state.userTemplates.push({
    id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name,
    description: description || '',
    sql,
    builtin: false,
    createdAt: Date.now()
  });
  persist(true);
}

// Update an existing user template
export function updateUserTemplate(id, patch) {
  if (!id) return;
  const idx = (state.userTemplates || []).findIndex(t => t.id === id);
  if (idx === -1) return;
  state.userTemplates[idx] = { ...state.userTemplates[idx], ...patch, updatedAt: Date.now() };
  persist(true);
}

// Delete a user template (built-ins are not deletable)
export function deleteUserTemplate(id) {
  if (!id) return;
  state.userTemplates = (state.userTemplates || []).filter(t => t.id !== id);
  persist(true);
}

// ─── Snippets ─────────────────────────────────────────

// Folder tree helpers
function getRootFolders() {
  return (state.folders || []).filter(f => !f.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getChildFolders(parentId) {
  return (state.folders || []).filter(f => f.parentId === parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getSnippetsInFolder(folderId) {
  return (state.snippets || []).filter(s => (s.folderId || null) === folderId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getAllSnippetIdsInFolder(folderId) {
  // Returns snippet IDs in this folder and all descendant folders
  const ids = [];
  const childFolders = getChildFolders(folderId);
  for (const cf of childFolders) {
    ids.push(...getAllSnippetIdsInFolder(cf.id));
  }
  ids.push(...getSnippetsInFolder(folderId).map(s => s.id));
  return ids;
}

function getFolderPath(folderId) {
  // Returns array of folder IDs from root to this folder (for search expansion)
  const path = [];
  let cur = folderId;
  while (cur) {
    path.unshift(cur);
    const f = (state.folders || []).find(f => f.id === cur);
    cur = f ? f.parentId : null;
  }
  return path;
}

// Render folder name row
function renderFolderName(folder, depth) {
  const isCollapsed = !!(state.snippetFolders && state.snippetFolders[folder.id]);
  const childFolders = getChildFolders(folder.id);
  const snippets = getSnippetsInFolder(folder.id);
  const totalCount = childFolders.length + snippets.length;
  const colorDot = `<span class="folder-dot" style="background:${escapeHtml(folder.color || '#4a4a5a')}"></span>`;
  const chevron = `<button class="folder-toggle" data-folder-id="${folder.id}">${isCollapsed ? '▶' : '▼'}</button>`;
  const name = `<span class="folder-name" data-folder-name="${folder.id}">${escapeHtml(folder.name)}</span>`;
  const count = totalCount > 0 ? `<span class="folder-count">${totalCount}</span>` : '';
  const menuBtn = `<button class="folder-menu-btn" data-folder-menu="${folder.id}" title="Folder options">⋮</button>`;
  return `<div class="folder-row" data-folder-id="${folder.id}" draggable="true" style="padding-left:${depth * 16}px">
    ${chevron}${colorDot}${name}${count}${menuBtn}
  </div>`;
}

// Render snippets under a folder
function renderFolderSnippets(folderId, depth, searchMatch) {
  const snippets = getSnippetsInFolder(folderId);
  const filtered = searchMatch
    ? snippets.filter(s => s.name.toLowerCase().includes(searchMatch.toLowerCase()) || s.sql.includes(searchMatch))
    : snippets;
  return filtered.map(s => {
    const preview = escapeHtml(s.sql.replace(/\s+/g, ' ').slice(0, 60));
    return `<div class="snippet-row" data-id="${s.id}" data-snippet-folder="${folderId}" draggable="${!s.builtin}" style="padding-left:${depth * 16}px">
      <div class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
      <div class="preview" title="${escapeHtml(s.sql.slice(0, 200))}">${preview}</div>
      ${s.builtin ? '<span class="builtin-tag">built-in</span>' : ''}
      <button class="ins-btn" data-ins="${s.id}" title="Insert at cursor">→</button>
      ${!s.builtin ? `<button class="del" data-del="${s.id}" title="Delete snippet">×</button>` : ''}
    </div>`;
  }).join('');
}

// Render folder tree recursively with cycle detection
function renderFolderTree(folderId, depth, searchQuery, visited) {
  if (visited.has(folderId)) return ''; // Cycle guard
  visited.add(folderId);

  const folders = getChildFolders(folderId);
  const chunks = [];

  for (const folder of folders) {
    const isCollapsed = !!(state.snippetFolders && state.snippetFolders[folder.id]);
    const childFolders = getChildFolders(folder.id);
    const snippets = getSnippetsInFolder(folder.id);
    const totalCount = childFolders.length + snippets.length;

    // Filter by search
    const hasMatchingSnippets = searchQuery
      ? snippets.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.sql.includes(searchQuery))
      : true;
    const hasMatchingChildFolders = searchQuery
      ? childFolders.some(cf => {
          const childSnippets = getSnippetsInFolder(cf.id);
          const descendantIds = getAllSnippetIdsInFolder(cf.id);
          const descendantSnippets = (state.snippets || []).filter(s => descendantIds.includes(s.id));
          return cf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 descendantSnippets.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.sql.includes(searchQuery));
        })
      : true;

    // Skip empty non-matching folders in search mode
    if (searchQuery && !hasMatchingSnippets && !hasMatchingChildFolders && !folder.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      continue;
    }

    const childTree = renderFolderTree(folder.id, depth + 1, searchQuery, new Set(visited));
    const hasChildren = childTree.length > 0 || snippets.length > 0;

    const colorDot = `<span class="folder-dot" style="background:${escapeHtml(folder.color || '#4a4a5a')}"></span>`;
    const chevron = `<button class="folder-toggle" data-folder-id="${folder.id}">${isCollapsed ? '▶' : '▼'}</button>`;
    const name = `<span class="folder-name" data-folder-name="${folder.id}">${escapeHtml(folder.name)}</span>`;
    const count = totalCount > 0 ? `<span class="folder-count">${totalCount}</span>` : '';
    const menuBtn = `<button class="folder-menu-btn" data-folder-menu="${folder.id}" title="Folder options">⋮</button>`;

    chunks.push(`<div class="snippet-folder" data-folder-id="${folder.id}">
      <div class="folder-row" data-folder-id="${folder.id}" draggable="true" style="padding-left:${depth * 16}px">
        ${chevron}${colorDot}${name}${count}${menuBtn}
      </div>
      <div class="folder-children${isCollapsed ? ' collapsed' : ''}" data-folder-children="${folder.id}">
        ${!isCollapsed ? (childTree + renderFolderSnippets(folder.id, depth + 1, searchQuery ? searchQuery : null)) : ''}
      </div>
    </div>`);
  }

  return chunks.join('');
}

// Build inline context menu HTML for a folder
function buildContextMenuHTML(folder) {
  const colors = [
    { hex: '#4a4a5a', name: 'Gray' },
    { hex: '#e53935', name: 'Red' },
    { hex: '#fb8c00', name: 'Orange' },
    { hex: '#fdd835', name: 'Yellow' },
    { hex: '#43a047', name: 'Green' },
    { hex: '#1e88e5', name: 'Blue' }
  ];
  const colorSwatches = colors.map(c =>
    `<button class="color-swatch" data-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></button>`
  ).join('');
  return `<div class="folder-context-menu" data-menu-folder="${folder.id}">
    <div class="ctx-rename-row">
      <input class="ctx-rename-input" type="text" value="${escapeHtml(folder.name)}" placeholder="Folder name" data-rename-folder="${folder.id}" />
    </div>
    <div class="ctx-color-row">
      ${colorSwatches}
    </div>
    <div class="ctx-delete-row">
      <button class="ctx-delete-btn" data-delete-folder="${folder.id}">Delete folder</button>
    </div>
  </div>`;
}

export function renderSnippetList() {
  const list = document.getElementById('snippetList');
  const count = document.getElementById('snippetCount');
  if (!list) return;

  // Get search query from snippet search input (if present)
  const searchInput = document.getElementById('snippetSearchInput');
  const searchQuery = searchInput ? searchInput.value.trim() : '';

  // Built-in snippets — detected by s.builtin flag, not folderId
  const builtinSnippets = (BUILTIN_SNIPPETS || []).filter(s => s.builtin);

  // User snippets at root (folderId null/undefined AND not built-in)
  const rootUserSnippets = (state.snippets || []).filter(s => !s.builtin && !s.folderId);

  // Build built-in section
  const builtinsHtml = builtinSnippets.map(s => {
    const preview = escapeHtml(s.sql.replace(/\s+/g, ' ').slice(0, 60));
    return `<div class="snippet-row" data-id="${s.id}" style="padding-left:0px">
      <div class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
      <div class="preview" title="${escapeHtml(s.sql.slice(0, 200))}">${preview}</div>
      <span class="builtin-tag">built-in</span>
      <button class="ins-btn" data-ins="${s.id}" title="Insert at cursor">→</button>
    </div>`;
  }).join('');

  // Build root user snippets (unfiled)
  const rootUserHtml = searchQuery
    ? rootUserSnippets.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sql.includes(searchQuery)
      ).map(s => {
        const preview = escapeHtml(s.sql.replace(/\s+/g, ' ').slice(0, 60));
        return `<div class="snippet-row" data-id="${s.id}" style="padding-left:0px" draggable="true">
          <div class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
          <div class="preview" title="${escapeHtml(s.sql.slice(0, 200))}">${preview}</div>
          <button class="ins-btn" data-ins="${s.id}" title="Insert at cursor">→</button>
          <button class="del" data-del="${s.id}" title="Delete snippet">×</button>
        </div>`;
      }).join('')
    : '';

  // Build folder tree
  const treeHtml = renderFolderTree(null, 0, searchQuery || null, new Set());

  // Handle search: force-expand all ancestor folders of matching snippets
  let forceExpandFolders = [];
  if (searchQuery) {
    // Find all folders that need to be expanded (ancestors of matching snippets)
    const matchingSnippets = (state.snippets || []).filter(s =>
      (s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.sql.includes(searchQuery))
    );
    matchingSnippets.forEach(s => {
      if (s.folderId) {
        forceExpandFolders.push(...getFolderPath(s.folderId));
      }
    });
    // Also include folders that match by name
    (state.folders || []).forEach(f => {
      if (f.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        forceExpandFolders.push(...getFolderPath(f.id));
      }
    });
    forceExpandFolders = [...new Set(forceExpandFolders)];
  }

  const totalSnippets = builtinSnippets.length + rootUserSnippets.length + (state.snippets || []).filter(s => s.folderId).length;
  const folders = state.folders || [];
  count.textContent = totalSnippets + ' · ' + folders.length + ' folders';

  if (totalSnippets === 0 && folders.length === 0) {
    list.innerHTML = '<div class="snippet-empty">No saved snippets yet</div>';
    return;
  }

  // Compose full HTML
  let html = '';
  if (builtinsHtml) html += `<div class="snippet-builtins">${builtinsHtml}</div>`;
  if (searchQuery && rootUserHtml) html += rootUserHtml;
  else if (!searchQuery && rootUserSnippets.length > 0) {
    html += rootUserSnippets.map(s => {
      const preview = escapeHtml(s.sql.replace(/\s+/g, ' ').slice(0, 60));
      return `<div class="snippet-row" data-id="${s.id}" style="padding-left:0px" draggable="true">
        <div class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
        <div class="preview" title="${escapeHtml(s.sql.slice(0, 200))}">${preview}</div>
        <button class="ins-btn" data-ins="${s.id}" title="Insert at cursor">→</button>
        <button class="del" data-del="${s.id}" title="Delete snippet">×</button>
      </div>`;
    }).join('');
  }
  html += treeHtml;

  list.innerHTML = html;

  // Close any existing context menus
  list.querySelectorAll('.folder-context-menu').forEach(el => el.remove());

  // Folder toggle — expand all ancestors if searching
  list.querySelectorAll('.folder-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.dataset.folderId;
      state.snippetFolders = state.snippetFolders || {};
      state.snippetFolders[fid] = !state.snippetFolders[fid];
      persist(true);
      renderSnippetList();
    });
  });

  // Folder context menu button (⋮)
  list.querySelectorAll('.folder-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.dataset.folderMenu;
      // Close any existing menus first
      list.querySelectorAll('.folder-context-menu').forEach(el => el.remove());
      const folder = (state.folders || []).find(f => f.id === fid);
      if (!folder) return;
      // Build and inject context menu
      const menu = document.createElement('div');
      menu.innerHTML = buildContextMenuHTML(folder);
      const menuEl = menu.firstElementChild;
      // Position near the button
      const btnRect = btn.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      menuEl.style.position = 'absolute';
      menuEl.style.left = (btnRect.left - listRect.left) + 'px';
      menuEl.style.top = (btnRect.bottom - listRect.top) + 'px';
      menuEl.style.zIndex = '1000';
      list.style.position = 'relative';
      list.appendChild(menuEl);
      // Focus rename input
      const renameInput = menuEl.querySelector('.ctx-rename-input');
      if (renameInput) {
        renameInput.focus();
        renameInput.select();
      }
      // Stop event propagation so click-outside doesn't immediately close it
      menuEl.addEventListener('click', e => e.stopPropagation());
    });
  });

  // Click-outside closes context menu
  const closeMenuHandler = (e) => {
    list.querySelectorAll('.folder-context-menu').forEach(menu => {
      if (!menu.contains(e.target) && !e.target.classList.contains('folder-menu-btn')) {
        menu.remove();
      }
    });
  };
  document.removeEventListener('click', closeMenuHandler);
  document.addEventListener('click', closeMenuHandler);

  // Context menu rename
  list.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('ctx-rename-input')) {
      if (e.key === 'Enter') {
        const fid = e.target.dataset.renameFolder;
        const newName = e.target.value.trim();
        if (newName) {
          renameFolder(fid, newName);
        }
        e.target.closest('.folder-context-menu')?.remove();
      } else if (e.key === 'Escape') {
        e.target.closest('.folder-context-menu')?.remove();
      }
    }
  });

  list.addEventListener('change', (e) => {
    if (e.target.classList.contains('ctx-rename-input')) {
      const fid = e.target.dataset.renameFolder;
      const newName = e.target.value.trim();
      if (newName) renameFolder(fid, newName);
      e.target.closest('.folder-context-menu')?.remove();
    }
  });

  // Context menu color swatches
  list.addEventListener('click', (e) => {
    if (e.target.classList.contains('color-swatch')) {
      const fid = e.target.closest('.folder-context-menu')?.dataset.menuFolder;
      if (fid) {
        setFolderColor(fid, e.target.dataset.color);
        e.target.closest('.folder-context-menu')?.remove();
      }
    }
    if (e.target.classList.contains('ctx-delete-btn')) {
      const fid = e.target.dataset.deleteFolder;
      const folder = (state.folders || []).find(f => f.id === fid);
      if (folder && confirm('Delete folder "' + folder.name + '"? Snippets will move to root.')) {
        deleteFolder(fid);
      }
      e.target.closest('.folder-context-menu')?.remove();
    }
  });

  // Snippet rows — click to load, prevent drag from firing
  list.querySelectorAll('.snippet-row').forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.classList.contains('del') || e.target.classList.contains('ins-btn')) return;
      loadSnippet(r.dataset.id);
    });
    // Snippet drag — set dataTransfer with snippetId
    if (r.getAttribute('draggable') === 'true') {
      r.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('snippetId', r.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        r.classList.add('dragging');
      });
      r.addEventListener('dragend', () => {
        r.classList.remove('dragging');
        list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      });
    }
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

  // Snippet drop onto folder-children or folder-row → move snippet into folder
  list.querySelectorAll('.folder-children, .folder-row').forEach(target => {
    target.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('snippetId') && !e.dataTransfer.types.includes('folderId')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('drag-over');
    });
    target.addEventListener('dragleave', (e) => {
      if (!target.contains(e.relatedTarget)) target.classList.remove('drag-over');
    });
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      target.classList.remove('drag-over');
      const snippetId = e.dataTransfer.getData('snippetId');
      if (snippetId) {
        // Determine target folder ID
        let targetFolderId = null;
        if (target.classList.contains('folder-row')) {
          targetFolderId = target.dataset.folderId;
        } else if (target.classList.contains('folder-children')) {
          targetFolderId = target.dataset.folderChildren;
        }
        // Move snippet into folder
        updateSnippet(snippetId, { folderId: targetFolderId });
        showFeedback('success', 'Moved', 'Snippet moved to folder.');
      }
    });
  });

  // Snippet drop onto root area (no folder) → move to root
  list.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('snippetId')) return;
    // Only trigger if not over a folder element
    const overFolder = e.target.closest('.folder-children, .folder-row');
    if (overFolder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  list.addEventListener('drop', (e) => {
    const overFolder = e.target.closest('.folder-children, .folder-row');
    if (overFolder) return;
    const snippetId = e.dataTransfer.getData('snippetId');
    if (snippetId) {
      updateSnippet(snippetId, { folderId: null });
      showFeedback('success', 'Moved', 'Snippet moved to root.');
    }
  });

  // Folder drag-and-drop (move folder to another folder or root)
  list.querySelectorAll('.folder-row[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('folderId', row.dataset.folderId);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  });

  // Folder drop — move folder into another folder or to root
  list.querySelectorAll('.folder-children, .folder-row').forEach(target => {
    const handleFolderDrop = (e) => {
      e.preventDefault();
      target.classList.remove('drag-over');
      const folderId = e.dataTransfer.getData('folderId');
      if (!folderId) return;
      let newParentId = null;
      if (target.classList.contains('folder-row')) {
        newParentId = target.dataset.folderId;
      } else if (target.classList.contains('folder-children')) {
        newParentId = target.dataset.folderChildren;
      }
      moveFolder(folderId, newParentId);
    };
    target.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('folderId')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('drag-over');
    });
    target.addEventListener('dragleave', (e) => {
      if (!target.contains(e.relatedTarget)) target.classList.remove('drag-over');
    });
    target.addEventListener('drop', handleFolderDrop);
  });

  // Folder drop onto root area → move folder to root
  list.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('folderId')) return;
    const overFolder = e.target.closest('.folder-children, .folder-row');
    if (overFolder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  list.addEventListener('drop', (e) => {
    const overFolder = e.target.closest('.folder-children, .folder-row');
    if (overFolder) return;
    const folderId = e.dataTransfer.getData('folderId');
    if (folderId) {
      moveFolder(folderId, null);
    }
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
export function saveSnippet({ id, name, category, sql, folderId }) {
  if (!name || !sql) return;
  if (id) {
    const idx = (state.snippets || []).findIndex(s => s.id === id);
    if (idx !== -1) {
      state.snippets[idx] = { ...state.snippets[idx], name, category, sql, folderId: folderId ?? state.snippets[idx].folderId, updatedAt: Date.now() };
    }
  } else {
    state.snippets = state.snippets || [];
    state.snippets.push({
      id: 'snip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name,
      category: category || 'General',
      sql,
      db: runtime.cursor.currentDbName,
      folderId: folderId ?? null,
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
// Uses CodeMirror DOM element's CodeMirror property directly to avoid
// ES module initialization order issues where runtime.editor may resolve
// to the textarea before editor.js runs setEditor().
export function insertSnippetAtCursor(id) {
  const cmEl = document.querySelector('.CodeMirror');
  if (!cmEl || !cmEl.CodeMirror) return;
  const editor = cmEl.CodeMirror;
  // Check built-ins first, then user snippets
  const builtin = (BUILTIN_SNIPPETS || []).find(x => x.id === id);
  const s = builtin || (state.snippets || []).find(x => x.id === id);
  if (!s) return;
  const from = editor.listSelections()[0];
  editor.replaceRange(s.sql, from.from, from.to);
  editor.focus();
  toast('Inserted "' + s.name + '"', 'Snippet');
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

// ─── Folder CRUD ───────────────────────────────────────

function getFolderDepth(folderId) {
  if (!folderId) return 0;
  const folder = (state.folders || []).find(f => f.id === folderId);
  if (!folder) return 0;
  return 1 + getFolderDepth(folder.parentId);
}

export function createFolder(name, parentId) {
  if (!name || !name.trim()) {
    toast('Folder name cannot be empty.', 'Error');
    return null;
  }
  // Enforce max depth of 3
  if (parentId) {
    const depth = getFolderDepth(parentId);
    if (depth >= 3) {
      showFeedback('error', 'Depth limit', 'Folders can only be nested up to 3 levels deep.');
      return null;
    }
  }
  const folder = {
    id: 'folder_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: name.trim().slice(0, 80),
    parentId: parentId || null,
    color: '#4a4a5a',
    createdAt: Date.now(),
    order: (state.folders || []).length
  };
  state.folders = state.folders || [];
  state.folders.push(folder);
  persist(true);
  renderSnippetList();
  toast('Folder "' + folder.name + '" created', 'Folder');
  return folder;
}

export function renameFolder(id, newName) {
  if (!id || !newName || !newName.trim()) return;
  const idx = (state.folders || []).findIndex(f => f.id === id);
  if (idx === -1) return;
  state.folders[idx].name = newName.trim().slice(0, 80);
  persist(true);
  renderSnippetList();
}

export function deleteFolder(id) {
  if (!id) return;
  // Recursively collect child folder IDs
  const toDelete = [id];
  let changed = true;
  while (changed) {
    changed = false;
    (state.folders || []).forEach(f => {
      if (f.parentId && toDelete.includes(f.parentId) && !toDelete.includes(f.id)) {
        toDelete.push(f.id);
        changed = true;
      }
    });
  }
  // Move all snippets in deleted folders to root
  (state.snippets || []).forEach(sn => {
    if (toDelete.includes(sn.folderId)) sn.folderId = null;
  });
  // Remove all folders in toDelete
  state.folders = (state.folders || []).filter(f => !toDelete.includes(f.id));
  persist(true);
  renderSnippetList();
}

export function moveFolder(id, newParentId) {
  if (!id) return;
  // Prevent dropping a folder into itself or its descendants
  if (newParentId) {
    if (id === newParentId) {
      showFeedback('error', 'Invalid move', 'A folder cannot be moved into itself.');
      return;
    }
    // Check if newParentId is a descendant of id
    const collectAncestors = (fid) => {
      const f = (state.folders || []).find(x => x.id === fid);
      if (!f || !f.parentId) return new Set();
      const ancestors = collectAncestors(f.parentId);
      ancestors.add(f.parentId);
      return ancestors;
    };
    const descendants = collectAncestors(id);
    if (descendants.has(newParentId)) {
      showFeedback('error', 'Invalid move', 'A folder cannot be moved into its own descendant.');
      return;
    }
    // Enforce depth limit
    const depth = getFolderDepth(newParentId);
    if (depth >= 3) {
      showFeedback('error', 'Depth limit', 'Folders can only be nested up to 3 levels deep.');
      return;
    }
  }
  const idx = (state.folders || []).findIndex(f => f.id === id);
  if (idx === -1) return;
  state.folders[idx].parentId = newParentId || null;
  persist(true);
  renderSnippetList();
}

export function setFolderColor(id, color) {
  if (!id) return;
  const idx = (state.folders || []).findIndex(f => f.id === id);
  if (idx === -1) return;
  state.folders[idx].color = color || '#4a4a5a';
  persist(true);
  renderSnippetList();
}

// Wire search input for snippet filtering (called from enterSandbox)
export function initSnippetSearch() {
  const input = document.getElementById('snippetSearchInput');
  if (!input) return;
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => renderSnippetList(), 150);
  });
}

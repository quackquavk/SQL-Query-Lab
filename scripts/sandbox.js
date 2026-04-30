// Sandbox + MS SQL modes: scratchpad SQL execution, multi-statement support,
// snippet management, MS SQL T-SQL translation.

import * as runtime from './runtime.js';
import { state, persist, addToHistory } from './state.js';
import {
  cloneFromPristine, loadOrCreateSandboxDb, persistSandboxDbDebounced,
  updateDbStatus, updateHintTables
} from './db.js';
import {
  showFeedback, switchTab, toast, renderSchema, renderResultsTab,
  renderHistory, updateDirtyMark
} from './ui.js';
import { escapeHtml, splitSqlStatements, previewStatement } from './utils.js';
import { enterPractice } from './practice.js';

export function setMode(mode) {
  runtime.cursor.currentMode = mode;
  state.mode = mode;
  persist(true);
  document.body.classList.toggle('sandbox-active', mode === 'sandbox');
  document.body.classList.toggle('mssql-active', mode === 'mssql');
  document.body.classList.toggle('sandbox-mode', mode === 'sandbox');
  document.body.classList.toggle('mssql-mode', mode === 'mssql');

  document.getElementById('modePractice').classList.toggle('active', mode === 'practice');
  document.getElementById('modeSandbox').classList.toggle('active', mode === 'sandbox');
  document.getElementById('modeMssql').classList.toggle('active', mode === 'mssql');

  if (mode === 'sandbox') enterSandbox();
  else if (mode === 'mssql') enterMssql();
  else enterPractice();
}

export function enterSandbox() {
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
  if (results && results.length > 0) {
    let ri = 0;
    for (const stmt of allStmts) {
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b/i.test(stmt) && ri < results.length) {
        results[ri]._stmt = previewStatement(stmt);
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

// ─── Snippets ─────────────────────────────────────────

export function renderSnippetList() {
  const list = document.getElementById('snippetList');
  const count = document.getElementById('snippetCount');
  if (!list) return;
  const snippets = state.snippets || [];
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
      <button class="del" data-del="${s.id}" title="Delete snippet">×</button>
    </div>
  `).join('');
  list.querySelectorAll('.snippet-row').forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) return;
      loadSnippet(r.dataset.id);
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

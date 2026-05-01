// Entry point: boot the SQL engine, wire UI, kick off initial mode.

import * as runtime from './runtime.js';
import * as apiClient from './apiClient.js';
import { SEEDS } from './seeds.js';
import { QUESTIONS } from './questions.js';
import {
  state, persist, clearDraft, resetAllProgress, updateProgressUI
} from './state.js';
import {
  cloneFromPristine, loadOrCreateSandboxDb, updateDbStatus, setDbHooks, resetPracticeDb
} from './db.js';
import {
  showFeedback, switchTab, toast, renderSchema, renderResources, renderHistory,
  renderResultsTab, renderFilters, renderQuestionList, updateDirtyMark,
  setUiHooks, renderResultsStreaming, handleExportCsv, handleExportJson,
  clearResultSets, storeResultSet, renderSnippets, renderTemplates, initObjectExplorer
} from './ui.js';
import { formatEditorSql } from './format.js';
import { initEditor, injectCodemirrorFontFix } from './editor.js';
import { loadQuestion, runPracticeQuery, navQuestion } from './practice.js';
import {
  setMode, enterSandbox, runSandboxQuery, resetSandboxDb, runMssqlTranslation,
  saveCurrentAsSnippet, loadHistoryItem, runLiveQuery, cancelLiveQuery,
  createTab, closeTab, switchTabById, restoreTabs, markTabDirty, reorderTabs,
  createFolder, renderSnippetList
} from './sandbox.js';
import {
  initQueryBuilder, addTableToCanvas, removeTableFromCanvas,
  generateSelectSql, clearCanvas, setQueryBuilderHooks,
  zoomIn as qbZoomIn, zoomOut as qbZoomOut, zoomReset as qbZoomReset,
  getCanvasState
} from './queryBuilder.js';
import {
  initChart, renderBarChart, renderLineChart, renderPieChart,
  destroyChart, updateChartColumnOptions, getChartConfig
} from './chartRenderer.js';
import { exportToCsv, exportToJson, exportToXlsx, downloadBlob } from './utils.js';
import { openShortcutModal, closeShortcutModal, initShortcutSearch } from './shortcuts.js';
import { compareResultsets } from './diffTool.js';

// Wire cross-module hooks before any handler can fire
setDbHooks({ showFeedback, switchTab, renderSchema });
setUiHooks({ loadQuestion, loadHistoryItem });

// Wire admin module hooks
const { setJobBrowserHooks } = await import('./jobBrowser.js');
setJobBrowserHooks({ showFeedback, switchTab });

const { setBackupRestoreHooks } = await import('./backupRestore.js');
setBackupRestoreHooks({ showFeedback, toast });

function runQuery() {
  const sql = runtime.editor.getValue().trim();
  if (!sql) {
    showFeedback('error', 'Empty', 'Write some SQL before running.');
    switchTab('message');
    return;
  }
  if (runtime.cursor.currentMode === 'live') {
    return runLiveQueryFromMain();
  }
  if (runtime.cursor.currentMode === 'sandbox') return runSandboxQuery();
  return runPracticeQuery();
}

async function runLiveQueryFromMain() {
  const sql = runtime.editor.getValue().trim();
  try {
    // Disable run button, enable cancel button
    document.getElementById('runBtn').disabled = true;
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.disabled = false;
    // Show loading state
    const loadingEl = document.getElementById('results-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');
    const statusEl = document.getElementById('results-status');
    if (statusEl) statusEl.className = 'results-status';

    const result = await runLiveQuery(sql, {
      connectionId: runtime.cursor.connectionId,
      timeout: (runtime.cursor.queryTimeout || 30) * 1000
    });
  } catch (err) {
    runtime.cursor.lastError = err.message;
  } finally {
    document.getElementById('runBtn').disabled = false;
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.disabled = true;
    const loadingEl = document.getElementById('results-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

function resetDb() {
  if (runtime.cursor.currentMode === 'sandbox') return resetSandboxDb();
  return resetPracticeDb();
}

function showPanel(which) {
  document.getElementById('leftContent').style.display = (which === 'left-content') ? '' : 'none';
  document.getElementById('erDiagramPanel').style.display = (which === 'er-diagram') ? '' : 'none';
  document.getElementById('queryBuilderPanel').style.display = (which === 'query-builder') ? '' : 'none';
}

async function initErDiagramPanel() {
  showPanel('er-diagram');
  const panel = document.getElementById('erDiagramPanel');
  const svg = panel?.querySelector('svg');
  if (!svg) return;
  if (runtime.cursor.currentMode !== 'live') return;
  const connId = runtime.cursor.connectionId;
  if (!connId) return;
  try {
    const { fetchErSchema } = await import('./erDiagram.js');
    const schema = await fetchErSchema(runtime.cursor.currentDbName);
    const { initErDiagram } = await import('./erDiagram.js');
    initErDiagram(svg, schema);
  } catch (err) {
    console.warn('ER diagram init failed:', err);
  }
}

async function initQueryBuilderPanel() {
  showPanel('query-builder');
  const panel = document.getElementById('queryBuilderPanel');
  if (!panel) return;
  const svg = panel.querySelector('svg') || createQueryBuilderSvg(panel);
  if (runtime.cursor.currentMode !== 'live') return;
  const connId = runtime.cursor.connectionId;
  if (!connId) return;
  try {
    const schema = await apiClient.fetchErSchema(runtime.cursor.currentDbName);
    initQueryBuilder(svg, schema);
    setQueryBuilderHooks({
      onQueryGenerated: (sql) => {
        runtime.editor.setValue(sql);
        runtime.editor.focus();
      },
      onCanvasClear: () => {
        runtime.cursor.queryBuilder = { isOpen: true, tables: [], selectedColumns: {}, joins: [], whereConditions: [] };
      }
    });
  } catch (err) {
    console.warn('Query builder init failed:', err);
  }
}

function createQueryBuilderSvg(panel) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'query-builder-svg');
  panel.insertBefore(svg, panel.firstChild);
  return svg;
}

function wireUI() {
  // Ctrl+/ shortcut modal — capture phase fires BEFORE CodeMirror processes the key
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key !== '/') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const modal = document.getElementById('shortcutModal');
    if (modal && modal.classList.contains('open')) {
      closeShortcutModal();
    } else {
      openShortcutModal();
    }
  }, { capture: true });

  // Shortcut modal close button
  document.getElementById('shortcutModalClose').addEventListener('click', closeShortcutModal);
  // Close on backdrop click
  document.getElementById('shortcutModal').addEventListener('click', e => {
    if (e.target.id === 'shortcutModal') closeShortcutModal();
  });

  // Initialize shortcut search input
  initShortcutSearch();

  document.getElementById('runBtn').addEventListener('click', runQuery);
  document.getElementById('translateBtn').addEventListener('click', runMssqlTranslation);
  document.getElementById('resetDbBtn').addEventListener('click', resetDb);
  document.getElementById('formatBtn').addEventListener('click', formatEditorSql);

  // Menu
  const menuBtn = document.getElementById('menuBtn');
  const menuDrop = document.getElementById('menuDropdown');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDrop.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!menuDrop.contains(e.target) && e.target !== menuBtn) {
      menuDrop.classList.remove('open');
    }
  });

  // Theme toggle buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.documentElement.setAttribute('data-theme', theme);
      state.theme = theme;
      persist();
      // Update active class
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      menuDrop?.classList.remove('open');
    });
  });

  // Apply saved theme active state on load
  const currentTheme = state.theme || 'dark';
  document.querySelectorAll('.theme-btn').forEach(b => {
    if (b.dataset.theme === currentTheme) b.classList.add('active');
  });
  document.getElementById('menuClearDraft').addEventListener('click', () => {
    menuDrop.classList.remove('open');
    if (runtime.cursor.currentMode === 'sandbox') {
      runtime.cursor.editorLoading = true;
      runtime.editor.setValue('-- Sandbox mode\n-- Run anything\n\n');
      runtime.editor.setCursor({ line: runtime.editor.lineCount(), ch: 0 });
      runtime.cursor.editorLoading = false;
      state.sandboxScript = runtime.editor.getValue();
      persist(true);
      runtime.editor.focus();
      toast('Editor cleared.', 'Cleared');
      return;
    }
    clearDraft(runtime.cursor.currentQuestionId);
    runtime.cursor.editorLoading = true;
    const q = QUESTIONS.find(x => x.id === runtime.cursor.currentQuestionId);
    runtime.editor.setValue(`-- ${q.title}\n-- Database: ${q.db}.db — Category: ${q.category}\n-- Press ⌘/Ctrl + Enter to run\n\n`);
    runtime.editor.setCursor({ line: runtime.editor.lineCount(), ch: 0 });
    runtime.cursor.editorLoading = false;
    runtime.editor.focus();
    toast('Editor reset to starter.', 'Draft cleared');
  });
  document.getElementById('menuResetProgress').addEventListener('click', () => {
    menuDrop.classList.remove('open');
    if (!confirm('Reset ALL progress? This will clear:\n\n• Your solved-questions list\n• Every saved draft\n• Your sandbox database modifications\n• All saved snippets\n\nCannot be undone.')) return;
    resetAllProgress();
    for (const name of [...Object.keys(SEEDS), 'blank']) {
      runtime.sandboxDb[name] = cloneFromPristine(name);
      runtime.sandboxDirty[name] = false;
    }
    updateProgressUI();
    renderQuestionList();
    if (runtime.cursor.currentMode === 'sandbox') {
      enterSandbox();
    } else {
      loadQuestion(QUESTIONS[0].id);
    }
    toast('Progress wiped. Fresh start.', 'Reset');
  });

  // Backup Database menu item
  document.getElementById('menuBackupDb')?.addEventListener('click', async () => {
    menuDrop.classList.remove('open');
    if (runtime.cursor.currentMode !== 'live') {
      toast('Connect to a live SQL Server first', 'Live mode required');
      return;
    }
    const { openBackupModal } = await import('./backupRestore.js');
    openBackupModal();
  });

  // Restore Database menu item
  document.getElementById('menuRestoreDb')?.addEventListener('click', async () => {
    menuDrop.classList.remove('open');
    if (runtime.cursor.currentMode !== 'live') {
      toast('Connect to a live SQL Server first', 'Live mode required');
      return;
    }
    const { openRestoreWizard } = await import('./backupRestore.js');
    openRestoreWizard();
  });

  // Global keyboard shortcuts for backup/restore (live mode only)
  document.addEventListener('keydown', (e) => {
    if (!runtime.editor) return;
    const editorInput = runtime.editor?.getInputField();
    if (!editorInput || document.activeElement !== editorInput) return;
    if (!(e.metaKey || e.ctrlKey)) return;

    if (e.shiftKey && e.key === 'B') {
      e.preventDefault();
      if (runtime.cursor.currentMode === 'live') {
        import('./backupRestore.js').then(m => m.openBackupModal());
      }
    } else if (e.shiftKey && e.key === 'R') {
      e.preventDefault();
      if (runtime.cursor.currentMode === 'live') {
        import('./backupRestore.js').then(m => m.openRestoreWizard());
      }
    }
  });

  // Mode toggle
  document.getElementById('modePractice').addEventListener('click', () => setMode('practice'));
  document.getElementById('modeSandbox').addEventListener('click', () => setMode('sandbox'));
  document.getElementById('modeMssql').addEventListener('click', () => setMode('mssql'));
  document.getElementById('modeLive').addEventListener('click', () => {
    if (!runtime.cursor.connectionId) {
      import('./ui.js').then(m => m.renderConnectionDialog());
    } else {
      setMode('live');
    }
  });

  // Connect button for live mode
  document.getElementById('connectBtn')?.addEventListener('click', () => {
    import('./ui.js').then(m => m.renderConnectionDialog());
  });

  // Save current as snippet (sandbox only)
  document.getElementById('saveSnippetBtn').addEventListener('click', saveCurrentAsSnippet);

  // Create folder button
  document.getElementById('addFolderBtn').addEventListener('click', () => {
    const name = prompt('Folder name:');
    if (name) {
      createFolder(name);
      // No renderSnippetList() call needed — createFolder calls it
    }
  });

  document.getElementById('dbSelect').addEventListener('change', e => {
    const name = e.target.value;
    runtime.cursor.currentDbName = name;
    if (runtime.cursor.currentMode === 'sandbox') {
      state.sandboxDb = name;
      persist();
      loadOrCreateSandboxDb(name);
      updateDbStatus();
      renderSchema();
      updateDirtyMark();
      showFeedback('info', 'Switched DB',
        `Now connected to ${name}.db. Your script in the editor is unchanged.`);
      switchTab('message');
    } else {
      if (name === 'blank') {
        if (confirm('blank.db is an empty database for sandbox use. Switch to Sandbox mode now?')) {
          state.sandboxDb = name;
          persist();
          setMode('sandbox');
        } else {
          document.getElementById('dbSelect').value = runtime.cursor.currentDbName;
        }
        return;
      }
      updateDbStatus();
      renderSchema();
      const first = QUESTIONS.find(q => q.db === name);
      if (first) loadQuestion(first.id);
    }
  });
  document.getElementById('browseBtn').addEventListener('click', () => {
    document.getElementById('modal').classList.add('open');
    renderQuestionList();
  });
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('modal').classList.remove('open');
  });
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') e.target.classList.remove('open');
  });

  document.getElementById('prevBtn').addEventListener('click', () => navQuestion(-1));
  document.getElementById('nextBtn').addEventListener('click', () => navQuestion(+1));

  // Left tabs
  document.querySelectorAll('.left-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const which = btn.dataset.left;
      if (which === 'schema') { showPanel('schema'); renderSchema(); }
      else if (which === 'er-diagram') { showPanel('er-diagram'); initErDiagramPanel(); }
      else if (which === 'history') { showPanel('left-content'); renderHistory(); }
      else if (which === 'snippets') { showPanel('left-content'); renderSnippets(); }
      else if (which === 'templates') { showPanel('left-content'); renderTemplates(); }
      else if (which === 'query-builder') { showPanel('query-builder'); initQueryBuilderPanel(); }
      else { showPanel('left-content'); renderResources(); }
    });
  });

  // Results tabs
  document.querySelectorAll('.results-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Profile button: toggle panel, re-render output tab only, don't switch tab
      if (btn.id === 'profileBtn') {
        runtime.cursor.profileVisible = !runtime.cursor.profileVisible;
        btn.classList.toggle('active', runtime.cursor.profileVisible);
        renderResultsTab('output');
        return;
      }
      document.querySelectorAll('.results-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderResultsTab(btn.dataset.tab);
    });
  });

  // Cancel button for live query
  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    cancelLiveQuery();
  });

  // Timeout input for live query
  const timeoutInput = document.getElementById('query-timeout');
  if (timeoutInput) {
    timeoutInput.value = runtime.cursor.queryTimeout || 30;
    timeoutInput.addEventListener('change', () => {
      const val = parseInt(timeoutInput.value);
      if (val >= 1 && val <= 300) {
        runtime.cursor.queryTimeout = val;
        if (state.setLivePreference) state.setLivePreference('timeout', val);
      }
    });
  }

  // Global keyboard shortcuts (only when editor is NOT focused)
  document.addEventListener('keydown', (e) => {
    const editorInput = runtime.editor?.getInputField();
    if (!editorInput || document.activeElement !== editorInput) return;

    // Cmd/Ctrl+S: format SQL
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      formatEditorSql();
    }
  });

  // Query builder toolbar buttons
  document.getElementById('queryBuilderGenBtn')?.addEventListener('click', () => {
    const { sql, errors } = generateSelectSql();
    if (errors.length > 0) {
      showFeedback('error', 'Query Builder', errors.join('. '));
      return;
    }
    const outputPanel = document.getElementById('queryOutputPanel');
    const sqlEl = document.getElementById('queryOutputSql');
    if (outputPanel && sqlEl) {
      sqlEl.textContent = sql;
      outputPanel.classList.add('visible');
    }
  });

  document.getElementById('queryBuilderClearBtn')?.addEventListener('click', () => {
    clearCanvas();
    document.getElementById('queryOutputPanel')?.classList.remove('visible');
  });

  document.getElementById('queryOutputClose')?.addEventListener('click', () => {
    document.getElementById('queryOutputPanel')?.classList.remove('visible');
  });

  document.getElementById('queryOutputApply')?.addEventListener('click', () => {
    const sql = document.getElementById('queryOutputSql')?.textContent;
    if (sql) {
      runtime.editor.setValue(sql);
      runtime.editor.focus();
      document.getElementById('queryOutputPanel')?.classList.remove('visible');
      showFeedback('info', 'SQL Applied', 'Query copied to editor');
    }
  });

  // Query builder zoom controls
  document.getElementById('queryBuilderZoomIn')?.addEventListener('click', () => {
    const panel = document.getElementById('queryBuilderPanel');
    const svg = panel?.querySelector('svg');
    if (svg) qbZoomIn(svg);
  });

  document.getElementById('queryBuilderZoomOut')?.addEventListener('click', () => {
    const panel = document.getElementById('queryBuilderPanel');
    const svg = panel?.querySelector('svg');
    if (svg) qbZoomOut(svg);
  });

  document.getElementById('queryBuilderZoomReset')?.addEventListener('click', () => {
    const panel = document.getElementById('queryBuilderPanel');
    const svg = panel?.querySelector('svg');
    if (svg) qbZoomReset(svg);
  });

  // Chart toolbar events
  document.getElementById('chartRenderBtn')?.addEventListener('click', () => {
    const data = runtime.cursor.lastUserResult;
    if (!data || !data.columns || data.columns.length === 0) {
      showFeedback('error', 'Chart', 'Run a query first to get data for charting');
      return;
    }

    const { type, xCol, yCol } = getChartConfig();
    if (!xCol || !yCol) {
      showFeedback('error', 'Chart', 'Select X and Y columns');
      return;
    }

    destroyChart();
    if (type === 'bar') renderBarChart(data, xCol, yCol);
    else if (type === 'line') renderLineChart(data, xCol, yCol);
    else if (type === 'pie') renderPieChart(data, xCol, yCol);
  });

  // Export buttons: CSV
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const last = runtime.cursor.lastUserResult;
    if (!last) { showFeedback('error', 'Export', 'Run a query first to export.'); return; }
    const csv = exportToCsv(last.columns, last.values);
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    downloadBlob(csv, `results_${ts}.csv`, 'text/csv');
  });

  // Export buttons: JSON
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const last = runtime.cursor.lastUserResult;
    if (!last) { showFeedback('error', 'Export', 'Run a query first to export.'); return; }
    const json = exportToJson(last.columns, last.values);
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    downloadBlob(json, `results_${ts}.json`, 'application/json');
  });

  // Export button: XLSX (SheetJS)
  document.getElementById('btn-export-xlsx')?.addEventListener('click', () => {
    if (typeof window.XLSX === 'undefined') {
      showFeedback('error', 'Export', 'SheetJS not loaded — XLSX export unavailable.');
      return;
    }
    const last = runtime.cursor.lastUserResult;
    if (!last) { showFeedback('error', 'Export', 'Run a query first to export.'); return; }
    const buf = exportToXlsx(last.columns, last.values);
    if (!buf) { showFeedback('error', 'Export', 'XLSX export failed.'); return; }
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    downloadBlob(new Blob([buf]), `results_${ts}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  // Export Wizard button
  document.getElementById('btn-export-wizard')?.addEventListener('click', async () => {
    const last = runtime.cursor.lastUserResult;
    if (!last) { showFeedback('error', 'Export', 'Run a query first to export results.'); return; }
    const { openExportWizard } = await import('./exportWizard.js');
    openExportWizard();
  });

  // Compare button: diff two result sets
  document.getElementById('btn-compare').addEventListener('click', () => {
    const ui = { _resultsets: [] };
    const rs0 = ui._resultsets[0];
    const rs1 = ui._resultsets[1];
    const last = runtime.cursor.lastUserResult;

    if (!rs0 && !rs1 && !last) {
      showFeedback('info', 'No diff', 'Run at least two queries to compare.');
      return;
    }

    // Reference = older result set (rs0 or last), Current = most recent (last or rs1)
    let reference = rs0 || last;
    let current = last;

    if (rs0 && rs1) {
      reference = rs0;
      current = rs1;
    } else if (rs0 && !rs1 && last) {
      reference = rs0;
      current = last;
    }

    const result = compareResultsets(reference, current);
    runtime.cursor.diffResult = result;
    runtime.cursor.diffReference = reference;
    switchTab('diff');
  });
}

async function boot() {
  const SQL = await initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`
  });
  runtime.setSQL(SQL);

  // Apply saved theme or default to dark (before first paint to avoid flash)
  const savedTheme = state.theme || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Listen for system preference changes when theme is 'auto'
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    if (state.theme === 'auto') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });

  for (const name of Object.keys(SEEDS)) {
    const db = new SQL.Database();
    db.exec(SEEDS[name]);
    runtime.pristineDb[name] = db.export();
    runtime.liveDb[name] = db;
  }

  // Empty pristine "blank" DB for from-scratch sandbox use
  {
    const blankDb = new SQL.Database();
    runtime.pristineDb['blank'] = blankDb.export();
    runtime.liveDb['blank'] = blankDb;
  }

  // Load live mode preferences
  const { getLivePreferences } = await import('./state.js');
  const livePrefs = getLivePreferences();
  runtime.cursor.livePageSize = livePrefs.pageSize;
  runtime.cursor.queryTimeout = livePrefs.timeout;

  initEditor({ runQuery, runMssqlTranslation, runLiveQuery: runLiveQueryFromMain });

  initChart(document.getElementById('chartContainer'));

  runtime.cursor.activeCategoryFilter = state.lastCategoryFilter || 'ALL';
  runtime.cursor.activeDifficultyFilter = state.lastDifficultyFilter || 'ALL';

  // Wire editor query executor for F5 / Cmd+Enter
  runtime.setEditorQueryExecutor(runQuery);

  wireUI();

  // Initialize timeout input
  const timeoutInput = document.getElementById('query-timeout');
  if (timeoutInput) timeoutInput.value = livePrefs.timeout;

  const startMode = state.mode === 'sandbox' ? 'sandbox' : 'practice';
  setMode(startMode);

  // Restore tabs after mode is set so UI is ready
  if (state.openTabs && state.openTabs.length > 0) {
    restoreTabs();
  } else {
    // Create default tab if no saved tabs
    const defaultId = createTab(runtime.cursor.currentDbName, runtime.cursor.connectionId);
    runtime.setActiveTabId(defaultId);
    if (typeof switchTabById === 'function') switchTabById(defaultId);
  }

  renderResources();
  renderFilters();
  updateProgressUI();
  if (typeof renderTabBar === 'function') renderTabBar();

  setTimeout(() => {
    document.getElementById('splash').classList.add('hide');
  }, 400);
}

injectCodemirrorFontFix();

boot().catch(err => {
  console.error(err);
  document.getElementById('splash').innerHTML =
    `<div class="logo">Error</div><div class="sub" style="color:var(--error)">${err.message}</div>`;
});

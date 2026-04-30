// Entry point: boot the SQL engine, wire UI, kick off initial mode.

import * as runtime from './runtime.js';
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
  setUiHooks
} from './ui.js';
import { formatEditorSql } from './format.js';
import { initEditor, injectCodemirrorFontFix } from './editor.js';
import { loadQuestion, runPracticeQuery, navQuestion } from './practice.js';
import {
  setMode, enterSandbox, runSandboxQuery, resetSandboxDb, runMssqlTranslation,
  saveCurrentAsSnippet, loadHistoryItem
} from './sandbox.js';

// Wire cross-module hooks before any handler can fire
setDbHooks({ showFeedback, switchTab, renderSchema });
setUiHooks({ loadQuestion, loadHistoryItem });

function runQuery() {
  if (runtime.cursor.currentMode === 'sandbox') return runSandboxQuery();
  return runPracticeQuery();
}

function resetDb() {
  if (runtime.cursor.currentMode === 'sandbox') return resetSandboxDb();
  return resetPracticeDb();
}

function wireUI() {
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

  // Mode toggle
  document.getElementById('modePractice').addEventListener('click', () => setMode('practice'));
  document.getElementById('modeSandbox').addEventListener('click', () => setMode('sandbox'));
  document.getElementById('modeMssql').addEventListener('click', () => setMode('mssql'));

  // Save current as snippet (sandbox only)
  document.getElementById('saveSnippetBtn').addEventListener('click', saveCurrentAsSnippet);

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
      if (which === 'schema') renderSchema();
      else if (which === 'history') renderHistory();
      else renderResources();
    });
  });

  // Results tabs
  document.querySelectorAll('.results-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.results-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderResultsTab(btn.dataset.tab);
    });
  });
}

async function boot() {
  const SQL = await initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`
  });
  runtime.setSQL(SQL);

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

  initEditor({ runQuery, runMssqlTranslation });

  runtime.cursor.activeCategoryFilter = state.lastCategoryFilter || 'ALL';
  runtime.cursor.activeDifficultyFilter = state.lastDifficultyFilter || 'ALL';

  wireUI();

  const startMode = state.mode === 'sandbox' ? 'sandbox' : 'practice';
  setMode(startMode);

  renderResources();
  renderFilters();
  updateProgressUI();

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

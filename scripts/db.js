// Database layer: sql.js init, pristine clones, active DB, hint table updates.

import * as runtime from './runtime.js';
import { state, persist, base64ToBytes, bytesToBase64 } from './state.js';

let _sandboxSaveTimer = null;

// UI hooks — set by main.js after ui.js is wired, so db.js doesn't import ui.js
// directly (avoids circular imports between db / ui / sandbox).
let _hooks = {
  showFeedback: () => {},
  switchTab: () => {},
  renderSchema: () => {},
};
export function setDbHooks(hooks) { _hooks = { ..._hooks, ...hooks }; }

export function activeDb() {
  return runtime.cursor.currentMode === 'sandbox'
    ? runtime.sandboxDb[runtime.cursor.currentDbName]
    : runtime.liveDb[runtime.cursor.currentDbName];
}

export function cloneFromPristine(name) {
  return new runtime.SQL.Database(new Uint8Array(runtime.pristineDb[name]));
}

export function loadOrCreateSandboxDb(name) {
  const saved = state.sandboxStates && state.sandboxStates[name];
  if (saved) {
    try {
      runtime.sandboxDb[name] = new runtime.SQL.Database(base64ToBytes(saved));
      runtime.sandboxDirty[name] = true;
      return;
    } catch (e) {
      console.warn(`Could not restore saved sandbox DB ${name} — starting fresh`, e);
    }
  }
  runtime.sandboxDb[name] = cloneFromPristine(name);
  runtime.sandboxDirty[name] = false;
}

// Save a sandbox DB's binary state. Debounced so heavy-mutation scripts
// don't write a 16KB blob to localStorage on every statement.
export function persistSandboxDbDebounced(name) {
  clearTimeout(_sandboxSaveTimer);
  _sandboxSaveTimer = setTimeout(() => {
    try {
      const db = runtime.sandboxDb[name];
      if (!db) return;
      const bytes = db.export();
      state.sandboxStates = state.sandboxStates || {};
      state.sandboxStates[name] = bytesToBase64(bytes);
      persist(true);
    } catch (e) {
      console.warn('sandbox persist failed', e);
      if (String(e).match(/quota/i)) {
        _hooks.showFeedback('error', 'Storage full',
          'Your sandbox database is too large to save. Reset the DB or delete some snippets to free up space.');
        _hooks.switchTab('message');
      }
    }
  }, 500);
}

// Restore the live (practice) DB to its pristine state. Sandbox reset lives in sandbox.js.
export function resetPracticeDb() {
  const name = runtime.cursor.currentDbName;
  try {
    if (runtime.liveDb[name]) runtime.liveDb[name].close();
  } catch(e) {}
  runtime.liveDb[name] = cloneFromPristine(name);
  _hooks.renderSchema();
  document.querySelectorAll('.results-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'message'));
  _hooks.showFeedback('info', 'Database reset', `${name}.db has been restored to its initial state.`);
  updateDbStatus();
}

export function updateDbStatus() {
  const dot = document.getElementById('dbDot');
  const lbl = document.getElementById('dbStatusLabel');
  const info = document.getElementById('dbInfo');
  if (!dot || !lbl || !info) return;
  dot.classList.add('on');
  lbl.textContent = runtime.cursor.currentMode === 'sandbox' ? 'sandbox' : 'connected';
  const db = activeDb();
  if (!db) return;
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tables = res[0] ? res[0].values.map(r => r[0]) : [];
  info.textContent = `${runtime.cursor.currentDbName}.db — ${tables.length} table${tables.length === 1 ? '' : 's'}`;
  updateHintTables();
}

// Build a tables map for the SQL hint addon from the current active DB
export function updateHintTables() {
  const editor = runtime.editor;
  if (!editor) return;
  const db = activeDb();
  if (!db) return;
  const tableMap = {};
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = res[0] ? res[0].values.map(r => r[0]) : [];
    for (const t of tables) {
      const info = db.exec(`PRAGMA table_info("${t}")`);
      tableMap[t] = info[0] ? info[0].values.map(r => r[1]) : [];
    }
  } catch(e) { /* silent */ }
  editor.setOption('hintOptions', {
    tables: tableMap,
    completeSingle: false,
    closeOnUnfocus: true
  });
}

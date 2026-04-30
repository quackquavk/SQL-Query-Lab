// Persistent state: localStorage layer, drafts, history, snippets, progress.
// Schema (localStorage key "querylab:v1"):
// {
//   version: 2,
//   solved: [ids], drafts: { [id]: text },
//   lastQuestionId, lastCategoryFilter, lastDifficultyFilter,
//   mode, sandboxDb, sandboxScript, sandboxStates,
//   snippets: [...], history: [...],
//   mssqlDb, mssqlScript
// }

import { QUESTIONS } from './questions.js';
import { cursor, sandboxDb } from './runtime.js';

const STORAGE_KEY = 'querylab:v1';
const LEGACY_SOLVED_KEY = 'qlab_solved';
export const MAX_HISTORY = 20;

export function defaultState() {
  return {
    version: 2,
    solved: [], drafts: {},
    lastQuestionId: null,
    lastCategoryFilter: 'ALL', lastDifficultyFilter: 'ALL',
    mode: 'practice',
    sandboxDb: 'hospital',
    sandboxScript: '',
    sandboxStates: {},
    snippets: [],
    history: [],
    mssqlDb: 'hospital',
    mssqlScript: ''
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) {
        parsed.version = 2;
        parsed.mode = 'practice';
        parsed.sandboxDb = 'hospital';
        parsed.sandboxScript = '';
        parsed.sandboxStates = {};
        parsed.snippets = [];
        parsed.history = [];
        return parsed;
      }
      if (parsed && parsed.version === 2) {
        const d = defaultState();
        return Object.assign(d, parsed);
      }
    }
    const legacy = localStorage.getItem(LEGACY_SOLVED_KEY);
    if (legacy) {
      const s = defaultState();
      s.solved = JSON.parse(legacy) || [];
      return s;
    }
  } catch (e) { console.warn('loadState failed', e); }
  return defaultState();
}

export let state = loadState();
export let solved = new Set(state.solved);

let _persistTimer = null;
export function persist(immediate) {
  clearTimeout(_persistTimer);
  const doWrite = () => {
    state.solved = [...solved];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('persist failed', e);
    }
  };
  if (immediate) doWrite();
  else _persistTimer = setTimeout(doWrite, 400);
}

export function saveDraft(id, text) {
  if (!id) return;
  const stripped = (text || '').replace(/--.*$/gm, '').trim();
  if (!stripped) {
    if (state.drafts[id]) {
      delete state.drafts[id];
      persist();
    }
    return;
  }
  state.drafts[id] = text;
  persist();
}

export function clearDraft(id) {
  if (state.drafts[id]) {
    delete state.drafts[id];
    persist(true);
  }
}

export function resetAllProgress() {
  state = defaultState();
  solved = new Set();
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_SOLVED_KEY); } catch(e) {}
}

export function markSolved(id, updateProgressUI) {
  if (!solved.has(id)) {
    solved.add(id);
    persist(true);
    if (updateProgressUI) updateProgressUI();
  }
}

export function addToHistory(sql, ok, error, onRender) {
  state.history = state.history || [];
  state.history.unshift({
    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    db: cursor.currentDbName,
    sql,
    ok: !!ok,
    error: error || null,
    ranAt: Date.now()
  });
  if (state.history.length > MAX_HISTORY) state.history = state.history.slice(0, MAX_HISTORY);
  persist();
  if (cursor.currentMode === 'sandbox' && onRender) onRender();
}

export function clearHistory(onRender) {
  state.history = [];
  persist(true);
  if (onRender) onRender();
}

export function formatHistoryTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return Math.floor(diff / 86_400_000) + 'd ago';
}

export function updateProgressUI() {
  const total = QUESTIONS.length;
  const count = solved.size;
  const c = document.getElementById('progressCount');
  const t = document.getElementById('progressTotal');
  const f = document.getElementById('progressFill');
  if (c) c.textContent = count;
  if (t) t.textContent = total;
  if (f) f.style.transform = `scaleX(${total ? count / total : 0})`;
}

// base64 helpers for serializing sql.js Uint8Array exports
export function bytesToBase64(bytes) {
  let bin = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Template categories
export const TEMPLATE_CATEGORIES = ['Pagination', 'Window Functions', 'Pivot/Unpivot', 'Gap Detection', 'Hierarchy', 'Date Ranges', 'CTEs'];

// Built-in SQL query templates (22 templates across 7 categories)
export const BUILTIN_TEMPLATES = [
  // ── Pagination ─────────────────────────────────────────────────────────────
  {
    id: 'tpl-pag-offset',
    name: 'LIMIT / OFFSET',
    category: 'Pagination',
    sql: 'SELECT * FROM table_name\nORDER BY id\nLIMIT 20 OFFSET 0;',
    description: 'Basic LIMIT/OFFSET pagination for SQLite',
    builtin: true
  },
  {
    id: 'tpl-pag-cursor',
    name: 'Cursor-Based Pagination',
    category: 'Pagination',
    sql: 'SELECT * FROM table_name\nWHERE id > :last_id\nORDER BY id\nLIMIT 20;',
    description: 'Cursor-based pagination using last seen ID — efficient for large tables',
    builtin: true
  },
  {
    id: 'tpl-pag-page',
    name: 'Page Number Pagination',
    category: 'Pagination',
    sql: 'SELECT * FROM table_name\nORDER BY id\nLIMIT :page_size\nOFFSET (:page - 1) * :page_size;',
    description: 'Traditional page-number pagination with page size parameter',
    builtin: true
  },

  // ── Window Functions ───────────────────────────────────────────────────────
  {
    id: 'tpl-win-row-number',
    name: 'ROW_NUMBER Ranking',
    category: 'Window Functions',
    sql: 'SELECT\n  ROW_NUMBER() OVER (ORDER BY column_name DESC) AS row_num,\n  column_name,\n  other_column\nFROM table_name;',
    description: 'Assign sequential row numbers ordered by a column',
    builtin: true
  },
  {
    id: 'tpl-win-running-total',
    name: 'Running Total',
    category: 'Window Functions',
    sql: 'SELECT\n  date_column,\n  amount,\n  SUM(amount) OVER (ORDER BY date_column) AS running_total\nFROM table_name;',
    description: 'Running total (cumulative sum) over an ordered window',
    builtin: true
  },
  {
    id: 'tpl-win-lead-lag',
    name: 'Lead / Lag Comparison',
    category: 'Window Functions',
    sql: 'SELECT\n  date_column,\n  value,\n  LAG(value, 1) OVER (ORDER BY date_column) AS prev_value,\n  value - LAG(value, 1) OVER (ORDER BY date_column) AS change\nFROM table_name;',
    description: 'Compare current row value with previous row (LAG) or next row (LEAD)',
    builtin: true
  },

  // ── Pivot / Unpivot ────────────────────────────────────────────────────────
  {
    id: 'tpl-pivot-basic',
    name: 'Row to Column (Pivot)',
    category: 'Pivot/Unpivot',
    sql: 'SELECT\n  category,\n  SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) AS active_count,\n  SUM(CASE WHEN status = \'inactive\' THEN 1 ELSE 0 END) AS inactive_count\nFROM table_name\nGROUP BY category;',
    description: 'Pivot rows to columns using CASE aggregation',
    builtin: true
  },
  {
    id: 'tpl-pivot-unpivot',
    name: 'Column to Row (Unpivot)',
    category: 'Pivot/Unpivot',
    sql: 'SELECT event_name, value\nFROM (\n  SELECT \'col_a\' AS event_name, col_a AS value FROM tbl\n  UNION ALL\n  SELECT \'col_b\' AS event_name, col_b AS value FROM tbl\n  UNION ALL\n  SELECT \'col_c\' AS event_name, col_c AS value FROM tbl\n);',
    description: 'Unpivot columns into rows using UNION ALL',
    builtin: true
  },
  {
    id: 'tpl-pivot-conditional',
    name: 'Conditional Aggregation',
    category: 'Pivot/Unpivot',
    sql: 'SELECT\n  department,\n  SUM(CASE WHEN year = 2023 THEN revenue END) AS rev_2023,\n  SUM(CASE WHEN year = 2024 THEN revenue END) AS rev_2024,\n  SUM(CASE WHEN year = 2023 THEN revenue END) -\n  SUM(CASE WHEN year = 2024 THEN revenue END) AS change\nFROM sales\nGROUP BY department;',
    description: 'Compare values across categories using conditional aggregation',
    builtin: true
  },

  // ── Gap Detection ──────────────────────────────────────────────────────────
  {
    id: 'tpl-gap-missing',
    name: 'Find Missing IDs',
    category: 'Gap Detection',
    sql: 'WITH RECURSIVE numbers(n) AS (\n  VALUES (1)\n  UNION ALL\n  SELECT n + 1 FROM numbers WHERE n < (SELECT MAX(id) FROM table_name)\n)\nSELECT n AS missing_id\nFROM numbers n\nWHERE NOT EXISTS (SELECT 1 FROM table_name t WHERE t.id = n.n);',
    description: 'Find missing integer IDs in a sequence using a recursive CTE',
    builtin: true
  },
  {
    id: 'tpl-gap-consecutive',
    name: 'Find Consecutive Sequences',
    category: 'Gap Detection',
    sql: 'SELECT\n  MIN(id) AS seq_start,\n  MAX(id) AS seq_end,\n  MAX(id) - MIN(id) + 1 AS seq_length\nFROM (\n  SELECT id, id - ROW_NUMBER() OVER (ORDER BY id) AS grp\n  FROM table_name\n)\nGROUP BY grp\nHAVING COUNT(*) >= 3;',
    description: 'Group consecutive IDs into ranges (minimum 3 in a row)',
    builtin: true
  },
  {
    id: 'tpl-gap-date-gaps',
    name: 'Detect Date Gaps',
    category: 'Gap Detection',
    sql: 'SELECT\n  t1.date_column AS gap_start,\n  t2.date_column AS gap_end,\n  julianday(t2.date_column) - julianday(t1.date_column) - 1 AS missing_days\nFROM table_name t1\nJOIN table_name t2 ON t2.date_column > t1.date_column\n  AND NOT EXISTS (\n    SELECT 1 FROM table_name t3\n    WHERE t3.date_column > t1.date_column AND t3.date_column < t2.date_column\n  )\nWHERE julianday(t2.date_column) - julianday(t1.date_column) > 1;',
    description: 'Find gaps between consecutive dates (more than 1 day apart)',
    builtin: true
  },

  // ── Hierarchy ─────────────────────────────────────────────────────────────
  {
    id: 'tpl-hier-org-chart',
    name: 'Org Chart (Manager Chain)',
    category: 'Hierarchy',
    sql: 'WITH RECURSIVE chain AS (\n  SELECT id, name, manager_id, 1 AS depth\n  FROM employees\n  WHERE id = :employee_id\n  UNION ALL\n  SELECT e.id, e.name, e.manager_id, c.depth + 1\n  FROM employees e\n  JOIN chain c ON e.id = c.manager_id\n)\nSELECT * FROM chain ORDER BY depth;',
    description: 'Walk up the management chain from an employee to the CEO',
    builtin: true
  },
  {
    id: 'tpl-hier-path',
    name: 'Path Enumeration',
    category: 'Hierarchy',
    sql: 'WITH RECURSIVE path_cte AS (\n  SELECT id, name, parent_id, name AS path, 1 AS depth\n  FROM categories\n  WHERE parent_id IS NULL\n  UNION ALL\n  SELECT c.id, c.name, c.parent_id, p.path || \' > \' || c.name, p.depth + 1\n  FROM categories c\n  JOIN path_cte p ON c.parent_id = p.id\n)\nSELECT * FROM path_cte ORDER BY path;',
    description: 'Build a breadcrumb-style path string from root to each node',
    builtin: true
  },
  {
    id: 'tpl-hier-tree',
    name: 'Tree Walk (All Descendants)',
    category: 'Hierarchy',
    sql: 'WITH RECURSIVE subtree AS (\n  SELECT id, name, parent_id, 1 AS depth\n  FROM categories\n  WHERE id = :parent_id\n  UNION ALL\n  SELECT c.id, c.name, c.parent_id, s.depth + 1\n  FROM categories c\n  JOIN subtree s ON c.parent_id = s.id\n)\nSELECT * FROM subtree ORDER BY depth, name;',
    description: 'Recursively fetch all descendants of a given parent node',
    builtin: true
  },

  // ── Date Ranges ───────────────────────────────────────────────────────────
  {
    id: 'tpl-date-generate-series',
    name: 'Generate Date Series',
    category: 'Date Ranges',
    sql: 'WITH RECURSIVE dates AS (\n  SELECT :start_date AS date_val\n  UNION ALL\n  SELECT date(date_val, \'+1 day\') FROM dates\n  WHERE date_val < :end_date\n)\nSELECT date_val FROM dates;',
    description: 'Generate a series of dates between start and end dates',
    builtin: true
  },
  {
    id: 'tpl-date-intervals',
    name: 'Date Arithmetic',
    category: 'Date Ranges',
    sql: 'SELECT\n  date_column,\n  date(date_column, \'+1 month\') AS plus_1_month,\n  date(date_column, \'-1 year\') AS minus_1_year,\n  date(date_column, \'+7 days\') AS plus_1_week,\n  strftime(\'%w\', date_column) AS day_of_week,\n  strftime(\'%j\', date_column) AS day_of_year\nFROM table_name;',
    description: 'Common date arithmetic: add/subtract months, years, days; extract parts',
    builtin: true
  },
  {
    id: 'tpl-date-fiscal',
    name: 'Fiscal Quarter / Week',
    category: 'Date Ranges',
    sql: 'SELECT\n  date_column,\n  strftime(\'%Y\', date_column) AS year,\n  -- Fiscal quarter starting in April (adjust start_month as needed)\n  CASE\n    WHEN CAST(strftime(\'%m\', date_column) AS INTEGER) BETWEEN 4 AND 6  THEN 1\n    WHEN CAST(strftime(\'%m\', date_column) AS INTEGER) BETWEEN 7 AND 9  THEN 2\n    WHEN CAST(strftime(\'%m\', date_column) AS INTEGER) BETWEEN 10 AND 12 THEN 3\n    ELSE 4\n  END AS fiscal_quarter,\n  strftime(\'%W\', date_column) AS iso_week\nFROM table_name;',
    description: 'Extract fiscal quarter (Apr–Jun=Q1) and ISO week number',
    builtin: true
  },

  // ── CTEs ─────────────────────────────────────────────────────────────────
  {
    id: 'tpl-cte-basic',
    name: 'Basic CTE',
    category: 'CTEs',
    sql: 'WITH active_users AS (\n  SELECT id, name, email\n  FROM users\n  WHERE active = 1\n)\nSELECT * FROM active_users WHERE name LIKE \'A%\';',
    description: 'Simple common table expression to isolate a filtered result set',
    builtin: true
  },
  {
    id: 'tpl-cte-recursive',
    name: 'Recursive CTE',
    category: 'CTEs',
    sql: 'WITH RECURSIVE counter(n) AS (\n  SELECT 1\n  UNION ALL\n  SELECT n + 1 FROM counter WHERE n < 100\n)\nSELECT n FROM counter;',
    description: 'Recursive CTE template: replace the body with any recursive logic',
    builtin: true
  },
  {
    id: 'tpl-cte-multiple',
    name: 'Multiple CTEs',
    category: 'CTEs',
    sql: 'WITH\n  monthly_sales AS (\n    SELECT strftime(\'%Y-%m\', sale_date) AS month, SUM(amount) AS total\n    FROM sales GROUP BY month\n  ),\n  rolling_avg AS (\n    SELECT month, total,\n      AVG(total) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg\n    FROM monthly_sales\n  )\nSELECT * FROM rolling_avg ORDER BY month;',
    description: 'Chain multiple CTEs together for complex analytical queries',
    builtin: true
  },
  {
    id: 'tpl-cte-conditional',
    name: 'Conditional Aggregation',
    category: 'CTEs',
    sql: 'WITH\n  buckets AS (\n    SELECT\n      CASE\n        WHEN score < 50  THEN \'low\'\n        WHEN score < 80  THEN \'medium\'\n        ELSE \'high\'\n      END AS bucket,\n      score\n    FROM results\n  )\nSELECT bucket, COUNT(*) AS count, AVG(score) AS avg_score\nFROM buckets\nGROUP BY bucket\nORDER BY FIELD(bucket, \'low\', \'medium\', \'high\');',
    description: 'Use a CTE to bucket values before aggregating across buckets',
    builtin: true
  }
];
// Schema (localStorage key "querylab:v1"):
// {
//   version: 4,
//   solved: [ids], drafts: { [id]: text },
//   lastQuestionId, lastCategoryFilter, lastDifficultyFilter,
//   mode, sandboxDb, sandboxScript, sandboxStates,
//   snippets: [...], snippetFolders: {}, folders: [...],
//   history: [...],
//   mssqlDb, mssqlScript
// }

import { QUESTIONS } from './questions.js';
import { getShortcuts } from './shortcuts.js';
import { cursor, sandboxDb } from './runtime.js';

const STORAGE_KEY = 'querylab:v1';
const LEGACY_SOLVED_KEY = 'qlab_solved';
export const MAX_HISTORY = 1000;

export function defaultState() {
  return {
    version: 4,
    solved: [], drafts: {},
    lastQuestionId: null,
    lastCategoryFilter: 'ALL', lastDifficultyFilter: 'ALL',
    mode: 'practice',
    sandboxDb: 'hospital',
    sandboxScript: '',
    sandboxStates: {},
    snippets: [],
    snippetCategories: ['General', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    folders: [],
    snippetFolders: {},
    openTabs: [],
    activeTabId: null,
    history: [],
    mssqlDb: 'hospital',
    mssqlScript: '',
    liveScript: '',
    shortcuts: [],
    userTemplates: []
  };
}

// Built-in starter snippets (SNIP-05, D-15)
export const BUILTIN_SNIPPETS = [
  {
    id: 'builtin-select-top',
    name: 'SELECT TOP 100',
    category: 'SELECT',
    sql: 'SELECT TOP 100 * FROM table_name\nWHERE condition;',
    builtin: true,
    folderId: null
  },
  {
    id: 'builtin-insert',
    name: 'INSERT Statement',
    category: 'INSERT',
    sql: 'INSERT INTO table_name (column1, column2, column3)\nVALUES (value1, value2, value3);',
    builtin: true,
    folderId: null
  },
  {
    id: 'builtin-update',
    name: 'UPDATE Statement',
    category: 'UPDATE',
    sql: 'UPDATE table_name\nSET column1 = value1, column2 = value2\nWHERE condition;',
    builtin: true,
    folderId: null
  },
  {
    id: 'builtin-delete',
    name: 'DELETE Statement',
    category: 'DELETE',
    sql: 'DELETE FROM table_name\nWHERE condition;',
    builtin: true,
    folderId: null
  }
];

function ensureBuiltinSnippets(s) {
  if (s.snippets && s.snippets.length > 0) return;
  s.snippets = BUILTIN_SNIPPETS.map(sn => ({ ...sn }));
  s.snippetCategories = ['General', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'];
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
        const s = Object.assign(d, parsed);
        ensureBuiltinSnippets(s);
        return s;
      }
      if (parsed && parsed.version === 3) {
        const s = Object.assign(defaultState(), parsed);
        ensureBuiltinSnippets(s);
        // Migration v3 → v4: add folders, snippetFolders, folderId on snippets, userTemplates
        if (!s.folders) s.folders = [];
        if (!s.snippetFolders) s.snippetFolders = {};
        if (!s.userTemplates) s.userTemplates = [];
        // Ensure all snippets have folderId
        (s.snippets || []).forEach(sn => {
          if (sn.folderId === undefined) sn.folderId = null;
        });
        return s;
      }
    }
    const legacy = localStorage.getItem(LEGACY_SOLVED_KEY);
    if (legacy) {
      const s = defaultState();
      s.solved = JSON.parse(legacy) || [];
      ensureBuiltinSnippets(s);
      return s;
    }
  } catch (e) { console.warn('loadState failed', e); }
  const s = defaultState();
  ensureBuiltinSnippets(s);
  return s;
}

export let state = loadState();
state.shortcuts = getShortcuts();
export let solved = new Set(state.solved);

// Live mode preferences
let _livePrefs = null;
const LIVE_PREFS_KEY = 'querylab:v1:livePrefs';

function loadLivePreferences() {
  try {
    const raw = localStorage.getItem(LIVE_PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('loadLivePreferences failed', e); }
  return { pageSize: 100, timeout: 30 };
}

export function getLivePreferences() {
  if (!_livePrefs) _livePrefs = loadLivePreferences();
  return _livePrefs;
}

export function setLivePreference(key, value) {
  if (!_livePrefs) _livePrefs = loadLivePreferences();
  if (key === 'pageSize') {
    if (![100, 200, 500].includes(value)) return;
    _livePrefs.pageSize = value;
  } else if (key === 'timeout') {
    if (value < 1 || value > 300) return;
    _livePrefs.timeout = value;
  }
  try {
    localStorage.setItem(LIVE_PREFS_KEY, JSON.stringify(_livePrefs));
  } catch (e) {
    console.warn('setLivePreference persist failed', e);
  }
}

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

export function addToHistory(sql, ok, error, onRender, { executionTime, rowCount } = {}) {
  state.history = state.history || [];
  state.history.unshift({
    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    db: cursor.currentDbName,
    sql,
    ok: !!ok,
    error: error || null,
    ranAt: Date.now(),
    executionTime: executionTime ?? null,
    rowCount: rowCount ?? null
  });
  if (state.history.length > MAX_HISTORY) state.history = state.history.slice(0, MAX_HISTORY);
  persist();
  if (cursor.currentMode === 'sandbox' && onRender) onRender();
}

// History panel filter state (module-level, not persisted across sessions)
export let historySearch = '';
export let historyFilterOk = null; // null = all, true = ok, false = error
export let historyFilterDb = null;  // null = all, string = db name

export function setHistorySearch(q) {
  historySearch = q;
  persist(true);
}

export function setHistoryFilter(ok, db) {
  historyFilterOk = ok;
  historyFilterDb = db;
  persist(true);
}

export function getHistoryFilters() {
  return { search: historySearch, ok: historyFilterOk, db: historyFilterDb };
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

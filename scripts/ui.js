// UI rendering: schema, resources, history, results, modal, toast, feedback, splash.

import * as runtime from './runtime.js';
import { state, solved, persist, MAX_HISTORY, formatHistoryTime, clearHistory } from './state.js';
import { QUESTIONS } from './questions.js';
import { activeDb } from './db.js';
import { escapeHtml, previewStatement } from './utils.js';

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
            ${renderTable(blk)}
          </div>
        `).join('');
      }
    } else {
      body.innerHTML = renderTable(last);
    }
  } else if (tab === 'expected') {
    if (!exp) body.innerHTML = '<div class="results-empty">No expected output yet</div>';
    else body.innerHTML = renderTable(exp);
  } else {
    body.innerHTML = runtime.cursor.lastMessage || '<div class="results-empty">No messages yet</div>';
  }
}

export function renderTable(res) {
  if (!res.columns || res.columns.length === 0) {
    return '<div class="results-empty">Query executed but returned no columns</div>';
  }
  let html = '<table class="result-table"><thead><tr>';
  res.columns.forEach(c => html += `<th>${escapeHtml(c)}</th>`);
  html += '</tr></thead><tbody>';
  if (res.values.length === 0) {
    html += `<tr><td colspan="${res.columns.length}" style="color:var(--text-dim);font-style:italic;padding:14px">(no rows)</td></tr>`;
  } else {
    res.values.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        if (cell === null) html += '<td class="null">NULL</td>';
        else html += `<td>${escapeHtml(String(cell))}</td>`;
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

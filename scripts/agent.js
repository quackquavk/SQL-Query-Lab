// SQL Agent chat UI — WebSocket client + chat state management.
// Lives in the left panel when the user clicks the Agent tab.

import * as runtime from './runtime.js';

const WS_PATH = '/api/sql-agent/chat';

// Module-level state (one chat session per tab visit)
let _ws = null;
let _panel = null;
let _messages = [];
let _statusDot = null;
let _statusLabel = null;
let _input = null;
let _sendBtn = null;
let _messagesEl = null;
let _connectionId = null;
let _executionColumns = null; // [{name, type}] from last execute_start

// ── WebSocket URL construction (mirrors apiClient.js createQueryStreamer) ────
function buildWsUrl(path) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const apiBase = window.API_BASE || '/api';
  const wsHost = apiBase.startsWith('http')
    ? apiBase.replace(/^\w+:\/\/, '').split('/')[0]
    : location.host;
  return `${protocol}//${wsHost}${path}`;
}

// ── Status helpers ────────────────────────────────────────────────────────────
function setStatus(state, label) {
  if (!_statusDot || !_statusLabel) return;
  _statusDot.className = 'agent-status-dot ' + state;
  _statusLabel.textContent = label;
}

// ── DOM construction ───────────────────────────────────────────────────────────
function buildPanelHtml() {
  return `
    <div class="agent-status">
      <span class="agent-status-dot disconnected" id="agentStatusDot"></span>
      <span class="agent-status-label" id="agentStatusLabel">Connecting…</span>
    </div>
    <div class="agent-messages" id="agentMessages">
      <div class="agent-empty">
        <div class="agent-empty-icon">🤖</div>
        <div>SQL Agent is ready</div>
        <div class="agent-empty-hint">
          Ask about SQL syntax, schema, performance, or best practices.
          Web search augments responses when live context is needed.
        </div>
      </div>
    </div>
    <div class="agent-input-wrap">
      <textarea
        class="agent-input"
        id="agentInput"
        placeholder="Ask about SQL…"
        rows="1"
        maxlength="4000"
      ></textarea>
      <button class="agent-send-btn" id="agentSendBtn" title="Send (Enter)" disabled>↑</button>
    </div>
  `;
}

// ── Message rendering ─────────────────────────────────────────────────────────
function appendMessage(role, content) {
  // Remove empty state if present
  const empty = _messagesEl.querySelector('.agent-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `agent-message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble';
  bubble.innerHTML = _formatContent(content);
  div.appendChild(bubble);
  _messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function streamToBubble(bubble, chunk) {
  bubble.innerHTML = _formatContent(chunk);
  scrollToBottom();
}

function _formatContent(text) {
  if (!text) return '';
  // Escape HTML first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Wrap code blocks
  return escaped
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  if (_messagesEl) {
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
  }
}

/**
 * Appends a batch of rows to a results table. Creates the table on the first batch.
 * @param {HTMLElement} container
 * @param {Array<{name:string,type:string}>} columns
 * @param {Array<Object>} rows
 * @param {number} offset
 * @param {number} total
 */
function renderRowsTable(container, columns, rows, offset, total) {
  if (!container || !columns.length || !rows.length) return;
  const table = container.querySelector('table') || createResultsTable(container, columns, total);
  const tbody = table.querySelector('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const col of columns) {
      const td = document.createElement('td');
      const val = row[col.name];
      td.textContent = val === null || val === undefined ? 'NULL' : String(val);
      td.title = td.textContent; // tooltip for long values
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function createResultsTable(container, columns, totalRows) {
  const table = document.createElement('table');
  table.className = 'agent-results-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col.name;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  container.appendChild(table);
  return table;
}

// ── Typing indicator ─────────────────────────────────────────────────────────
let _typingEl = null;

function showTyping() {
  if (_typingEl) return;
  _typingEl = document.createElement('div');
  _typingEl.className = 'agent-message agent';
  _typingEl.innerHTML = `<div class="agent-bubble">
    <div class="agent-typing">
      <span class="agent-typing-dot"></span>
      <span class="agent-typing-dot"></span>
      <span class="agent-typing-dot"></span>
    </div>
  </div>`;
  _messagesEl.appendChild(_typingEl);
  scrollToBottom();
}

function removeTyping() {
  if (_typingEl) {
    _typingEl.remove();
    _typingEl = null;
  }
}

// ── WebSocket lifecycle ───────────────────────────────────────────────────────
function connect() {
  if (_ws) {
    _ws.close();
    _ws = null;
  }

  _connectionId = runtime.cursor.connectionId || null;
  const url = buildWsUrl(WS_PATH);
  console.log('[agent] Connecting to', url);

  _ws = new WebSocket(url);

  _ws.onopen = () => {
    console.log('[agent] WebSocket open');
    setStatus('connected', 'Connected — ask a question');
    _sendBtn.disabled = false;
    // Send connection context if in live mode
    if (_connectionId) {
      _ws.send(JSON.stringify({ type: 'connect', connectionId: _connectionId }));
    }
  };

  _ws.onerror = (e) => {
    console.warn('[agent] WebSocket error', e);
    setStatus('auth-required', 'Connection failed');
    _sendBtn.disabled = true;
  };

  _ws.onclose = (e) => {
    console.log('[agent] WebSocket closed', e.code, e.reason);
    if (e.code === 4001) {
      setStatus('auth-required', 'Sign in to use SQL Agent');
    } else {
      setStatus('disconnected', 'Disconnected — refresh to reconnect');
    }
    _sendBtn.disabled = true;
  };

  _ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('[agent] Non-JSON message:', event.data);
      return;
    }
    handleMessage(msg);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'chunk': {
      // Stream a text chunk into the last agent bubble or create a new one
      removeTyping();
      let bubble;
      const last = _messagesEl.querySelector('.agent-message.agent:last-child .agent-bubble');
      if (last) {
        bubble = last;
        // Merge raw text into existing HTML-safe form
        const raw = bubble.getAttribute('data-raw') || '';
        bubble.setAttribute('data-raw', raw + msg.content);
        streamToBubble(bubble, raw + msg.content);
      } else {
        const div = document.createElement('div');
        div.className = 'agent-message agent';
        bubble = document.createElement('div');
        bubble.className = 'agent-bubble';
        bubble.setAttribute('data-raw', msg.content);
        bubble.innerHTML = _formatContent(msg.content);
        div.appendChild(bubble);
        _messagesEl.appendChild(div);
      }
      scrollToBottom();
      break;
    }
    case 'done': {
      // Finalize — clean up data-raw attribute
      const last = _messagesEl.querySelector('.agent-message.agent:last-child .agent-bubble');
      if (last) last.removeAttribute('data-raw');
      removeTyping();
      console.log('[agent] Response complete');
      break;
    }
    case 'error': {
      removeTyping();
      const errorMsg = msg.message || 'An error occurred.';
      const code = msg.code || 'UNKNOWN';
      console.warn('[agent] Error:', code, errorMsg);
      const div = document.createElement('div');
      div.className = 'agent-message system error';
      div.innerHTML = `<div class="agent-bubble">⚠ ${escapeHtml(errorMsg)}</div>`;
      _messagesEl.appendChild(div);
      scrollToBottom();
      break;
    }
    case 'mcp-status': {
      // Server-side MCP availability update
      if (msg.available) {
        setStatus('connected', 'Connected — MCP available');
      } else {
        setStatus('unavailable', 'MCP unavailable — using fallback');
      }
      break;
    }
    case 'execute_start': {
      _executionColumns = null;
      console.log('[agent] execute_start', msg.connectionId);
      break;
    }
    case 'columns': {
      _executionColumns = msg.columns || [];
      console.log('[agent] columns received:', _executionColumns.length);
      break;
    }
    case 'rows': {
      // Append execution results as a table below the last agent message
      if (!_executionColumns || _executionColumns.length === 0) break;
      removeTyping();
      let resultsEl = _messagesEl.querySelector('.agent-results:last-of-type');
      if (!resultsEl) {
        resultsEl = document.createElement('div');
        resultsEl.className = 'agent-results';
        const lastAgent = _messagesEl.querySelector('.agent-message.agent:last-child');
        if (lastAgent) lastAgent.after(resultsEl);
        else _messagesEl.appendChild(resultsEl);
      }
      renderRowsTable(resultsEl, _executionColumns, msg.rows, msg.offset, msg.total);
      scrollToBottom();
      break;
    }
    case 'done': {
      // Finalize — clean up data-raw attribute
      const last = _messagesEl.querySelector('.agent-message.agent:last-child .agent-bubble');
      if (last) last.removeAttribute('data-raw');
      removeTyping();
      if (msg.rowsAffected !== undefined || msg.totalRows !== undefined) {
        const rowsCount = msg.totalRows !== undefined ? msg.totalRows : (msg.rowsAffected || 0);
        const timeMs = msg.executionTime || 0;
        const div = document.createElement('div');
        div.className = 'agent-message system';
        div.innerHTML = `<div class="agent-bubble agent-results-summary">✓ ${rowsCount} row${rowsCount !== 1 ? 's' : ''}${timeMs ? ` in ${timeMs}ms` : ''}</div>`;
        _messagesEl.appendChild(div);
        scrollToBottom();
      }
      _executionColumns = null;
      console.log('[agent] Response complete');
      break;
    }

// ── Send message ──────────────────────────────────────────────────────────────
export function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || !_ws || _ws.readyState !== WebSocket.OPEN) return;

  // Append user message immediately
  appendMessage('user', trimmed);
  _messagesEl.scrollTop = _messagesEl.scrollHeight;

  // Clear input
  _input.value = '';
  _input.style.height = 'auto';

  // Show typing indicator
  showTyping();

  // Send to server
  _ws.send(JSON.stringify({ type: 'prompt', text: trimmed }));
}

// ── Input auto-grow + keyboard handling ──────────────────────────────────────
function wireInput() {
  if (!_input) return;

  _input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = _input.value;
      if (text.trim()) sendMessage(text);
    }
  });

  // Auto-grow textarea
  _input.addEventListener('input', () => {
    _input.style.height = 'auto';
    _input.style.height = Math.min(_input.scrollHeight, 120) + 'px';
    _sendBtn.disabled = !_input.value.trim();
  });

  // Send button
  _sendBtn.addEventListener('click', () => {
    const text = _input.value;
    if (text.trim()) sendMessage(text);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function initAgent() {
  const container = document.getElementById('leftContent');
  if (!container) return;

  // Guard: only in live mode
  if (runtime.cursor.currentMode !== 'live') {
    container.innerHTML = `
      <div class="agent-panel">
        <div class="agent-live-gate">
          <div style="font-size:28px">🤖</div>
          <h3>SQL Agent</h3>
          <p>Connect to a SQL Server to use the SQL Agent.</p>
          <p>Click <strong>Live</strong> in the mode bar, then sign in.</p>
        </div>
      </div>`;
    return;
  }

  // Guard: need a connection
  if (!runtime.cursor.connectionId) {
    container.innerHTML = `
      <div class="agent-panel">
        <div class="agent-live-gate">
          <div style="font-size:28px">🤖</div>
          <h3>SQL Agent</h3>
          <p>Connect to a SQL Server to use the SQL Agent.</p>
          <p>Click <strong>Connect…</strong> to choose a saved connection.</p>
        </div>
      </div>`;
    return;
  }

  // Render the panel
  container.innerHTML = buildPanelHtml();

  _panel = container.querySelector('.agent-panel');
  _statusDot = document.getElementById('agentStatusDot');
  _statusLabel = document.getElementById('agentStatusLabel');
  _input = document.getElementById('agentInput');
  _sendBtn = document.getElementById('agentSendBtn');
  _messagesEl = document.getElementById('agentMessages');

  wireInput();

  // Open WebSocket
  connect();
}

export function destroyAgent() {
  if (_ws) {
    _ws.onclose = null; // prevent setStatus from firing after destroy
    _ws.close();
    _ws = null;
  }
  _panel = null;
  _messagesEl = null;
  _input = null;
  _sendBtn = null;
  _statusDot = null;
  _statusLabel = null;
  _messages = [];
  _typingEl = null;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
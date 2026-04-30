const API_BASE = '/api';
let ws = null;
let wsCallbacks = {};
let queryIdCounter = 0;

export async function testConnection({ server, database, authType, credentials }) {
  const res = await fetch(`${API_BASE}/connections/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ server, database, authType, credentials })
  });
  return res.json();
}

export async function saveConnection({ name, server, database, authType, credentials }) {
  const res = await fetch(`${API_BASE}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ name, server, database, authType, credentials, masterPassword: 'browser-session-key' })
  });
  return res.json();
}

export async function listConnections() {
  const res = await fetch(`${API_BASE}/connections`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

export async function deleteConnection(id) {
  const res = await fetch(`${API_BASE}/connections/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

export function connectQuerySocket({ onColumns, onRows, onDone, onError }) {
  return new Promise((resolve, reject) => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/api/query`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('WebSocket connection failed'));

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const { type, queryId } = msg;

      switch (type) {
        case 'columns':
          onColumns?.(msg.columns);
          break;
        case 'rows':
          onRows?.(msg.rows, msg.total);
          break;
        case 'done':
          onDone?.(msg.rowsAffected, msg.executionTime);
          break;
        case 'error':
          onError?.(msg.message, msg.code, queryId);
          break;
      }
    };
  });
}

export function executeQuery(connectionId, sql, params = []) {
  const queryId = `q-${++queryIdCounter}`;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'execute',
      connectionId,
      sql,
      params,
      queryId
    }));
  }
  return queryId;
}

export function cancelQuery(queryId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cancel', queryId }));
  }
}

// Live query streaming via WebSocket.
// Returns an object with addEventListener/removeEventListener for:
// 'columns' → ({ columns: [{name, type}] })
// 'rows' → ({ rows: [row...], total })
// 'done' → ({ executionTime, rowCount })
// 'error' → ({ message })
export function createQueryStreamer(connectionId, sql, options = {}) {
  const { timeout = 30000 } = options;
  const queryId = `q-${++queryIdCounter}`;
  const listeners = { columns: [], rows: [], done: [], error: [] };
  let ws = null;
  let timeoutHandle = null;

  function onColumns(cols) { listeners.columns.forEach(l => l({ columns: cols })); }
  function onRows(rows, total) { listeners.rows.forEach(l => l({ rows, total })); }
  function onDone(rowsAffected, executionTime) { listeners.done.forEach(l => l({ rowsAffected, executionTime })); }
  function onError(message, code, qid) { listeners.error.forEach(l => l({ message, code })); }

  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/api/query`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'execute', connectionId, sql, queryId, timeout }));
        resolve();
      };
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const { type } = msg;
        if (type === 'columns') onColumns(msg.columns);
        else if (type === 'rows') onRows(msg.rows, msg.total);
        else if (type === 'done') onDone(msg.rowsAffected, msg.executionTime);
        else if (type === 'error') onError(msg.message, msg.code, msg.queryId);
      };
    });
  }

  return {
    queryId,
    connect,
    cancel() {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (ws) ws.send(JSON.stringify({ type: 'cancel', queryId }));
    },
    setTimeout(ms, onTimeout) {
      timeoutHandle = setTimeout(() => {
        onTimeout?.();
        this.cancel();
      }, ms);
    },
    addEventListener(event, handler) {
      if (listeners[event]) listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (listeners[event]) listeners[event] = listeners[event].filter(h => h !== handler);
    },
    destroy() {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (ws) { ws.close(); ws = null; }
    }
  };
}

export function disconnectQuerySocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

export async function decryptConnection(id, masterPassword) {
  const res = await fetch(`${API_BASE}/connections/decrypt/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ masterPassword })
  });
  return res.json();
}

/**
 * Fetch full object tree for a connection.
 * Returns { databases: [{ name, tables, views, procedures, functions }] }
 */
export async function fetchObjectTree(connectionId) {
  const res = await fetch(`${API_BASE}/schema?connectionId=${connectionId}`);
  if (!res.ok) throw new Error('Failed to fetch object tree');
  return res.json();
}

/**
 * Fetch column info for a table (lazy-loaded on table expand).
 * Returns { columns: [{ name, dataType, isNullable, isPrimaryKey }] }
 */
export async function fetchTableColumns(connectionId, database, table) {
  const res = await fetch(`${API_BASE}/schema/${database}/${table}/columns?connectionId=${connectionId}`);
  if (!res.ok) throw new Error('Failed to fetch columns');
  return res.json();
}

/**
 * Fetch stored procedure definition text.
 * Returns SQL definition string.
 */
export async function fetchProcedureDefinition(connectionId, database, procedure) {
  const res = await fetch(`${API_BASE}/schema/${database}/${procedure}/definition?connectionId=${connectionId}`);
  if (!res.ok) throw new Error('Failed to fetch procedure definition');
  return res.text();
}

/**
 * Refresh a specific node in the object tree.
 * nodeType: 'database' | 'table' | 'view' | 'procedure' | 'function'
 */
export async function refreshObjectNode(connectionId, database, nodeType, nodeName) {
  if (nodeType === 'database') {
    return fetchObjectTree(connectionId);
  } else if (nodeType === 'table' || nodeType === 'view') {
    return fetchTableColumns(connectionId, database, nodeName);
  } else if (nodeType === 'procedure' || nodeType === 'function') {
    return fetchProcedureDefinition(connectionId, database, nodeName);
  }
}

/**
 * Fetch connection groups (for favorites/grouping support).
 */
export async function fetchConnectionGroups() {
  const res = await fetch(`${API_BASE}/connections`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Create a new connection group.
 */
export async function createConnectionGroup(name) {
  const res = await fetch(`${API_BASE}/connections/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ name })
  });
  return res.json();
}

/**
 * Update a connection group (rename, reorder).
 */
export async function updateConnectionGroup(groupId, updates) {
  const res = await fetch(`${API_BASE}/connections/groups/${groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify(updates)
  });
  return res.json();
}

/**
 * Delete a connection group.
 */
export async function deleteConnectionGroup(groupId) {
  const res = await fetch(`${API_BASE}/connections/groups/${groupId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Toggle favorite status for a connection.
 */
export async function toggleConnectionFavorite(connectionId) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}/favorite`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}
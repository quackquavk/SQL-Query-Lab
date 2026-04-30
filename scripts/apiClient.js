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
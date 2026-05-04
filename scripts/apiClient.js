const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || '/api';
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
    body: JSON.stringify({ name, server, database, authType, credentials })
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

export async function getConnection(id) {
  const res = await fetch(`${API_BASE}/connections/${id}`, {
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
    // Extract host from API_BASE so WebSocket connects to the right server
    // e.g. 'https://api.example.com/api' → 'api.example.com'
    const apiBase = API_BASE || '/api';
    const wsHost = apiBase.startsWith('http')
      ? apiBase.replace(/^\w+:\/\//, '').split('/')[0]
      : location.host;
    const wsUrl = `${protocol}//${wsHost}/api/query`;

    ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('WebSocket connection failed'));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const { type, queryId } = msg;
      switch (type) {
        case 'columns': onColumns?.(msg.columns); break;
        case 'rows': onRows?.(msg.rows, msg.total); break;
        case 'done': onDone?.(msg.rowsAffected, msg.executionTime); break;
        case 'error': onError?.(msg.message, msg.code, queryId); break;
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
// 'connect'  → ()                           — WebSocket opened, execute sent
// 'columns'  → ({ columns: [{name, type}] })
// 'rows'     → ({ rows: [row...], total })
// 'done'     → ({ executionTime, rowCount })
// 'error'    → ({ message, code })
// 'timeout'  → ()                           — fired when server-side timeout fires
// 'close'    → ()                           — WebSocket closed unexpectedly
export function createQueryStreamer(connectionId, sql, options = {}) {
  const { timeout = 30000 } = options;
  const queryId = `q-${++queryIdCounter}`;
  const listeners = { connect: [], columns: [], rows: [], done: [], error: [], timeout: [], close: [] };
  let ws = null;
  let resolved = false;
  let opened = false;
  let retryCount = 0;
  const maxRetries = 3;
  let retryDelay = 1000;
  let reconnectTimeout = null;
  let connectionTimer = null;

  function emit(event, data) {
    console.log(`[streamer ${queryId}] ${event}`, data || '');
    listeners[event]?.forEach(l => l(data));
  }

  function _reconnect() {
    if (retryCount >= maxRetries) {
      emit('error', { message: 'WebSocket reconnect failed after ' + maxRetries + ' attempts', code: 'RECONNECT_FAILED' });
      if (!resolved) { resolved = true; reject(new Error('WebSocket reconnect failed after ' + maxRetries + ' attempts')); }
      return;
    }
    retryDelay = Math.min(retryDelay * 2, 30000);
    retryCount++;
    console.log(`[streamer ${queryId}] reconnect attempt ${retryCount}/${maxRetries} in ${retryDelay}ms`);
    reconnectTimeout = setTimeout(() => { connect().catch(() => {}); }, retryDelay);
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = API_BASE.startsWith('http')
        ? API_BASE.replace(/^\w+:\/\//, '').split('/')[0]
        : location.host;
      const wsUrl = `${protocol}//${wsHost}/api/query`;
      ws = new WebSocket(wsUrl);

      // Client-side connection timeout: 10 seconds
      connectionTimer = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          ws.close();
          emit('error', { message: 'Connection timed out', code: 'CONNECTION_TIMEOUT' });
          if (!resolved) { resolved = true; reject(new Error('Connection timed out')); }
        }
      }, 10000);

      ws.onopen = () => {
        opened = true;
        clearTimeout(connectionTimer);
        clearTimeout(reconnectTimeout);
        emit('connect');
        ws.send(JSON.stringify({ type: 'execute', connectionId, sql, queryId, timeout }));
        resolved = true;
        resolve();
      };
      ws.onerror = (ev) => {
        clearTimeout(connectionTimer);
        clearTimeout(reconnectTimeout);
        emit('error', { message: 'WebSocket connection failed', code: 'WS_ERROR' });
        if (!resolved) { resolved = true; reject(new Error('WebSocket connection failed')); }
      };
      ws.onclose = () => {
        clearTimeout(connectionTimer);
        clearTimeout(reconnectTimeout);
        if (!resolved) { resolved = true; reject(new Error('WebSocket closed before response')); }
        if (!opened) {
          // Connection never opened — unexpected close, retry
          _reconnect();
        } else {
          emit('close');
        }
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const { type, queryId: msgQid } = msg;
          if (type === 'columns') emit('columns', { columns: msg.columns });
          else if (type === 'rows') emit('rows', { rows: msg.rows, total: msg.total });
          else if (type === 'done') emit('done', { executionTime: msg.executionTime, rowCount: msg.rowsAffected ?? msg.totalRows ?? 0 });
          else if (type === 'error') {
            emit('error', { message: msg.message, code: msg.code });
            if (!resolved) { resolved = true; reject(new Error(msg.message)); }
          } else if (type === 'timeout') {
            emit('timeout');
            emit('error', { message: msg.message || 'Query timed out', code: 'TIMEOUT' });
            if (!resolved) { resolved = true; reject(new Error(msg.message || 'Query timed out')); }
          }
        } catch (e) {
          emit('error', { message: 'Failed to parse server message: ' + e.message, code: 'PARSE_ERROR' });
        }
      };
    });
  }

  return {
    queryId,
    connect,
    cancel() {
      if (ws) ws.send(JSON.stringify({ type: 'cancel', queryId }));
    },
    setTimeout(ms, onTimeout) {
      return setTimeout(() => {
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
      emit('destroy');
      clearTimeout(connectionTimer);
      clearTimeout(reconnectTimeout);
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
 * GET /api/schema/:database/:table → returns { columns: [...] }
 * Returns { columns: [{ name, dataType, isNullable, isPrimaryKey }] }
 */
export async function fetchTableColumns(connectionId, database, table) {
  const res = await fetch(`${API_BASE}/schema/${encodeURIComponent(database)}/${encodeURIComponent(table)}`);
  if (!res.ok) throw new Error('Failed to fetch columns');
  const data = await res.json();
  // Backend returns { columns: [...] } — extract and return that directly
  return { columns: data.columns || [] };
}

/**
 * Fetch stored procedure definition text.
 * GET /api/stored-procedure/:db/:name → returns { definition: "..." }
 * Returns the definition string.
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} database
 * @param {string} procedure
 * @param {Object} [extraHeaders] - Optional auth headers
 */
export async function fetchProcedureDefinition(connectionId, database, procedure, extraHeaders = {}) {
  const res = await fetch(`${API_BASE}/stored-procedure/${encodeURIComponent(database)}/${encodeURIComponent(procedure)}`, {
    credentials: 'include',
    headers: {
      'X-User-Id': 'browser-user',
      ...extraHeaders
    }
  });
  if (!res.ok) throw new Error('Failed to fetch procedure definition');
  const data = await res.json();
  // Backend returns { definition } — extract the string
  return data.definition || '';
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

/**
 * Fetch schema for ER diagram (tables, columns, relationships).
 * GET /api/schema/:database
 * Requires connectionId to forward auth headers for live SQL Server connections.
 */
export async function fetchErSchema(connectionId, database) {
  // Look up saved connection to forward auth headers to the backend
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/schema/${encodeURIComponent(database)}`, { headers });
  if (!res.ok) throw new Error(`Schema fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Execute DDL statement (CREATE/ALTER TABLE).
 * POST /api/execute-ddl
 */
export async function executeDdl(ddl) {
  const res = await fetch(`${API_BASE}/execute-ddl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ ddl })
  });
  return res.json();
}

/**
 * Execute DDL with full connection context (server, auth, database).
 * Passes X-Server, X-Auth-Type, X-Credentials, X-Database headers to backend
 * so the pool lookup succeeds for live SQL Server connections.
 *
 * @param {string} ddl
 * @param {{ server: string, authType: string, credentials: object, database: string }} context
 */
export async function executeDdlWithContext(ddl, { server, authType, credentials, database }) {
  const res = await fetch(`${API_BASE}/execute-ddl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'browser-user',
      'X-Server': server || '',
      'X-Auth-Type': authType || 'sql',
      'X-Credentials': JSON.stringify(credentials || {}),
      'X-Database': database || 'master'
    },
    credentials: 'include',
    body: JSON.stringify({ ddl })
  });
  return res.json();
}

/**
 * Fetch foreign key constraints for a table.
 * GET /api/schema/:database/:table/foreign-keys
 * Returns { foreignKeys: [{ constraintName, fromColumn, toTable, toColumn }] }
 */
export async function fetchTableForeignKeys(connectionId, database, tableName) {
  const res = await fetch(`${API_BASE}/schema/${encodeURIComponent(database)}/${encodeURIComponent(tableName)}/foreign-keys`);
  if (!res.ok) throw new Error('Failed to fetch foreign keys');
  const data = await res.json();
  return { foreignKeys: data.foreignKeys || [] };
}

/**
 * Fetch execution plan XML for a query.
 * POST /api/execution-plan
 */
export async function fetchExecutionPlan(query) {
  const res = await fetch(`${API_BASE}/execution-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ query })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.xml;
}

/**
 * List stored procedures in a database.
 * GET /api/stored-procedures/:db
 */
export async function fetchStoredProcedures(database) {
  const res = await fetch(`${API_BASE}/stored-procedures/${encodeURIComponent(database)}`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Fetch a stored procedure definition.
 * GET /api/stored-procedure/:db/:name
 * @param {string} database
 * @param {string} name
 * @param {Object} [extraHeaders] - Optional auth headers (X-Server, X-Auth-Type, X-Credentials)
 */
export async function fetchStoredProcedure(database, name, extraHeaders = {}) {
  const res = await fetch(`${API_BASE}/stored-procedure/${encodeURIComponent(database)}/${encodeURIComponent(name)}`, {
    credentials: 'include',
    headers: {
      'X-User-Id': 'browser-user',
      ...extraHeaders
    }
  });
  return res.json();
}

/**
 * Save a stored procedure (CREATE or ALTER).
 * POST /api/stored-procedure/:db
 * @param {string} database
 * @param {string} name
 * @param {string} definition
 * @param {Object} [extraHeaders] - Optional auth headers (X-Server, X-Auth-Type, X-Credentials)
 */
export async function saveStoredProcedure(database, name, definition, extraHeaders = {}) {
  const res = await fetch(`${API_BASE}/stored-procedure/${encodeURIComponent(database)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'browser-user',
      ...extraHeaders
    },
    credentials: 'include',
    body: JSON.stringify({ name, definition })
  });
  return res.json();
}

/**
 * Validate T-SQL syntax.
 * POST /api/validate-tsql
 */
export async function validateTsql(spText) {
  const res = await fetch(`${API_BASE}/validate-tsql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ sql: spText })
  });
  return res.json();
}

/**
 * Fetch optimization suggestions for SQL.
 * POST /api/optimize
 */
export async function fetchOptimizationSuggestions(sql, database) {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user', 'X-database': database || 'master' },
    credentials: 'include',
    body: JSON.stringify({ sql })
  });
  return res.json();
}

/**
 * Fetch missing indexes from execution plan XML.
 * Returns { missingIndexes: [], xml: string }
 */
export async function fetchMissingIndexes(query, database) {
  const res = await fetch(`${API_BASE}/execution-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user', 'X-database': database || 'master' },
    credentials: 'include',
    body: JSON.stringify({ query })
  });
  const data = await res.json();

  if (!data.xml) return { missingIndexes: [], xml: null };

  const missingIndexes = [];

  const cleanXml = data.xml.includes('<?xml') ? data.xml : `<?xml version="1.0"?>${data.xml}`;
  const missingIndexGroups = cleanXml.matchAll(/<MissingIndexGroup[^>]*Impact="([^"]*)"[^>]*>([\s\S]*?)<\/MissingIndexGroup>/gi);

  for (const match of missingIndexGroups) {
    const impact = parseFloat(match[1]) || 0;
    const groupContent = match[2];

    const tableMatch = groupContent.match(/<MissingIndex[^>]*Object="([^"]*)"[^>]*>/i) ||
                       groupContent.match(/<MissingIndex[^>]*Table="([^"]*)"[^>]*>/i);
    const table = tableMatch ? tableMatch[1] : 'unknown_table';

    const colMatches = [...groupContent.matchAll(/<Column Name="([^"]*)"[^>]*>/gi)];
    const columns = colMatches.map(m => m[1]);

    if (columns.length > 0) {
      const indexName = `IX_${table.replace(/[^a-zA-Z0-9]/g, '_')}_${columns.slice(0, 2).join('_')}`;
      const parts = table.split('.');
      const schema = parts.length > 2 ? parts[1] : 'dbo';
      const db = parts.length > 3 ? parts[0] : (database || 'master');

      missingIndexes.push({
        name: indexName,
        table,
        schema,
        database: db,
        columns,
        impact,
        createStatement: `CREATE INDEX [${indexName}] ON [${db}].[${schema}].[${parts[parts.length - 1]}] ([${columns.map(c => `[${c}]`).join(', ')}]);`
      });
    }
  }

  return { missingIndexes, xml: data.xml };
}

// ============================================================
// SQL Agent Jobs API
// ============================================================

/**
 * List all SQL Agent jobs with category hierarchy.
 * @param {string} connectionId - Connection ID for auth header lookup
 */
export async function fetchSqlAgentJobs(connectionId) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/jobs/${encodeURIComponent(conn.database || 'master')}`, {
    credentials: 'include', headers
  });
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

/**
 * Get job details (overview, steps, schedules, alerts).
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} jobName
 */
export async function fetchJobDetails(connectionId, jobName) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(conn.database || 'master')}/${encodeURIComponent(jobName)}`, {
    credentials: 'include', headers
  });
  if (!res.ok) throw new Error('Failed to fetch job details');
  return res.json();
}

/**
 * Get paginated job history.
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} jobName
 * @param {number} [page=0]
 */
export async function fetchJobHistory(connectionId, jobName, page = 0) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(conn.database || 'master')}/${encodeURIComponent(jobName)}/history?page=${page}&pageSize=50`, {
    credentials: 'include', headers
  });
  if (!res.ok) throw new Error('Failed to fetch job history');
  return res.json();
}

/**
 * Start a SQL Agent job.
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} jobName
 */
export async function startJob(connectionId, jobName) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(conn.database || 'master')}/${encodeURIComponent(jobName)}/start`, {
    method: 'POST',
    credentials: 'include', headers
  });
  return res.json();
}

/**
 * Stop a SQL Agent job.
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} jobName
 */
export async function stopJob(connectionId, jobName) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(conn.database || 'master')}/${encodeURIComponent(jobName)}/stop`, {
    method: 'POST',
    credentials: 'include', headers
  });
  return res.json();
}

/**
 * Enable a SQL Agent job.
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} jobName
 */
export async function enableJob(connectionId, jobName) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(conn.database || 'master')}/${encodeURIComponent(jobName)}/enable`, {
    method: 'POST',
    credentials: 'include', headers
  });
  return res.json();
}

/**
 * Disable a SQL Agent job.
 * @param {string} connectionId - Connection ID for auth header lookup
 * @param {string} jobName
 */
export async function disableJob(connectionId, jobName) {
  const conn = await getConnection(connectionId);
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn.server || '',
    'X-Auth-Type': conn.authType || 'default',
    'X-Credentials': JSON.stringify(conn.credentials || {})
  };
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(conn.database || 'master')}/${encodeURIComponent(jobName)}/disable`, {
    method: 'POST',
    credentials: 'include', headers
  });
  return res.json();
}

// ============================================================
// Backup/Restore API
// ============================================================

/**
 * Execute a database backup.
 */
/**
 * Execute a database backup.
 * Accepts optional connectionId to forward auth headers for live SQL Server.
 */
export async function executeBackup(options, connectionId) {
  let headers = { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' };
  if (connectionId) {
    const conn = await getConnection(connectionId);
    if (conn && conn.server) {
      headers['X-Server'] = conn.server;
      headers['X-Auth-Type'] = conn.authType || 'default';
      headers['X-Credentials'] = typeof conn.credentials === 'string'
        ? conn.credentials
        : JSON.stringify(conn.credentials || {});
    }
  }
  const res = await fetch(`${API_BASE}/backup`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(options)
  });
  return res.json();
}

/**
 * List backup history for a database.
 */
export async function fetchBackupHistory(dbName) {
  const res = await fetch(`${API_BASE}/backup/history/${encodeURIComponent(dbName)}`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  if (!res.ok) throw new Error('Failed to fetch backup history');
  return res.json();
}

/**
 * Execute a database restore.
 * Accepts optional connectionId to forward auth headers for live SQL Server.
 */
export async function executeRestore(options, connectionId) {
  let headers = { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' };
  if (connectionId) {
    const conn = await getConnection(connectionId);
    if (conn && conn.server) {
      headers['X-Server'] = conn.server;
      headers['X-Auth-Type'] = conn.authType || 'default';
      headers['X-Credentials'] = typeof conn.credentials === 'string'
        ? conn.credentials
        : JSON.stringify(conn.credentials || {});
    }
  }
  const res = await fetch(`${API_BASE}/restore`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(options)
  });
  return res.json();
}

/**
 * Verify backup file integrity.
 */
export async function verifyBackup(backupPath) {
  const res = await fetch(`${API_BASE}/restore/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
    credentials: 'include',
    body: JSON.stringify({ backupPath })
  });
  return res.json();
}
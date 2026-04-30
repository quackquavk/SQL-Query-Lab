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

/**
 * Fetch schema for ER diagram (tables, columns, relationships).
 * GET /api/schema/:database
 */
export async function fetchErSchema(database) {
  const res = await fetch(`${API_BASE}/schema/${encodeURIComponent(database)}`);
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
 */
export async function fetchStoredProcedure(database, name) {
  const res = await fetch(`${API_BASE}/stored-procedure/${encodeURIComponent(database)}/${encodeURIComponent(name)}`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Save a stored procedure (CREATE or ALTER).
 * POST /api/stored-procedure/:db
 */
export async function saveStoredProcedure(database, name, definition) {
  const res = await fetch(`${API_BASE}/stored-procedure/${encodeURIComponent(database)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
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

function currentDb() {
  return window.__runtime?.cursor?.currentDbName || 'master';
}

/**
 * List all SQL Agent jobs with category hierarchy.
 */
export async function fetchSqlAgentJobs() {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/jobs/${encodeURIComponent(db)}`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

/**
 * Get job details (overview, steps, schedules, alerts).
 */
export async function fetchJobDetails(jobName) {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(db)}/${encodeURIComponent(jobName)}`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  if (!res.ok) throw new Error('Failed to fetch job details');
  return res.json();
}

/**
 * Get paginated job history.
 */
export async function fetchJobHistory(jobName, page = 0) {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(db)}/${encodeURIComponent(jobName)}/history?page=${page}&pageSize=50`, {
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  if (!res.ok) throw new Error('Failed to fetch job history');
  return res.json();
}

/**
 * Start a SQL Agent job.
 */
export async function startJob(jobName) {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(db)}/${encodeURIComponent(jobName)}/start`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Stop a SQL Agent job.
 */
export async function stopJob(jobName) {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(db)}/${encodeURIComponent(jobName)}/stop`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Enable a SQL Agent job.
 */
export async function enableJob(jobName) {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(db)}/${encodeURIComponent(jobName)}/enable`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

/**
 * Disable a SQL Agent job.
 */
export async function disableJob(jobName) {
  const db = currentDb();
  const res = await fetch(`${API_BASE}/sql-agent/job/${encodeURIComponent(db)}/${encodeURIComponent(jobName)}/disable`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-User-Id': 'browser-user' }
  });
  return res.json();
}

// ============================================================
// Backup/Restore API
// ============================================================

/**
 * Execute a database backup.
 */
export async function executeBackup(options) {
  const res = await fetch(`${API_BASE}/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
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
 */
export async function executeRestore(options) {
  const res = await fetch(`${API_BASE}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'browser-user' },
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
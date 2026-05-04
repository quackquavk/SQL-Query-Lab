import { getPool, executeQuery } from '../services/sqlServer.js';
import { getSession } from '../services/auth.js';
import { parse as parseCookie } from 'cookie';

const activeQueries = new Map();
const BATCH_SIZE = 100;

function decodeError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || String(err);
  if (msg.includes('ECONNREFUSED')) return 'Cannot connect to server';
  if (msg.includes('ELOGIN') || msg.includes('login failed') || msg.includes('.Login failed')) return 'Login failed — check username and password';
  if (msg.includes('ETIMEOUT') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) return 'Query timeout';
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) return 'Server not found — check server address';
  if (msg.includes('invalid column')) return 'Invalid column name';
  if (msg.includes('syntax') || msg.includes('incorrect syntax')) return 'SQL syntax error';
  if (msg.includes('could not find stored procedure')) return 'Stored procedure not found';
  if (msg.includes('column not allow null')) return 'Cannot insert null — column does not allow nulls';
  if (msg.includes('duplicate key')) return 'Duplicate key value violates unique constraint';
  return msg;
}

/**
 * Extracts column metadata from a mssql recordset or column metadata array.
 * Returns an array of { name, type } objects.
 */
function extractColumns(recordset, columnsMeta) {
  // mssql attaches columns as a named property on the recordset array
  if (recordset && recordset.columns) {
    return Object.entries(recordset.columns).map(([name, col]) => ({
      name,
      type: col.type ? String(col.type) : 'unknown'
    }));
  }
  // Fallback: columns may be passed directly (for empty results)
  if (Array.isArray(columnsMeta)) {
    return columnsMeta.map(c => ({
      name: c.name || String(c),
      type: c.type || 'unknown'
    }));
  }
  return [];
}

/**
 * Converts mssql column metadata array to serializable column list.
 */
function columnsToArray(columnsMeta) {
  if (!columnsMeta) return [];
  return Object.entries(columnsMeta).map(([name, col]) => ({
    name,
    type: col.type ? String(col.type) : 'unknown'
  }));
}

async function handleQueryWebSocket(socket, data, userId) {
  const { type, connectionId, sql, params, queryId, timeout = 30000 } = data;

  if (type !== 'execute') {
    socket.send(JSON.stringify({ type: 'error', message: 'Unknown command', queryId }));
    return;
  }

  if (!connectionId || !sql) {
    socket.send(JSON.stringify({ type: 'error', message: 'connectionId and sql required', queryId }));
    return;
  }

  const queryStartTime = Date.now();
  console.log(`[query.ws] execute queryId=${queryId} connectionId=${connectionId} sql=${sql.substring(0, 100)} timeout=${timeout}ms`);

  let pool = null;
  let request = null;
  let cancelled = false;
  let timedOut = false;
  let timeoutTimer = null;

  // Map this queryId to an abort controller
  const abortInfo = { cancelled: false, timedOut: false };
  activeQueries.set(queryId, abortInfo);

  // Cancel handler listens on the socket
  const messageHandler = (msg) => {
    try {
      const cmd = JSON.parse(msg);
      if (cmd.type === 'cancel' && cmd.queryId === queryId) {
        cancelled = true;
        abortInfo.cancelled = true;
        if (request) {
          try { request.cancel(); } catch (e) { /* ignore */ }
        }
        if (timeoutTimer) clearTimeout(timeoutTimer);
        console.log(`[query.ws] queryId=${queryId} cancelled`);
      }
    } catch (e) {
      // ignore malformed cancel messages
    }
  };
  socket.on('message', messageHandler);

  try {
    // 1. Fetch decrypted connection credentials from the backend
    const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';
    const connRes = await fetch(`${apiBase}/api/connections/${connectionId}`);

    if (!connRes.ok) {
      const errText = await connRes.text();
      socket.send(JSON.stringify({ type: 'error', message: `Connection not found (${connRes.status})`, queryId }));
      console.log(`[query.ws] queryId=${queryId} connection not found: ${connRes.status}`);
      return;
    }

    const connData = await connRes.json();
    if (!connData.success || !connData.server) {
      socket.send(JSON.stringify({ type: 'error', message: connData.error || 'Failed to retrieve connection details', queryId }));
      return;
    }

    // 2. Get a pooled connection
    pool = await getPool(userId, connData.server, connData.authType, connData.credentials);

    // 3. Create request and set up timeout
    request = pool.request();
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      abortInfo.timedOut = true;
      if (request) {
        try { request.cancel(); } catch (e) { /* ignore */ }
      }
      const elapsed = Date.now() - queryStartTime;
      socket.send(JSON.stringify({
        type: 'error',
        message: `Query timed out after ${timeout}ms`,
        queryId,
        executionTime: elapsed
      }));
      console.log(`[query.ws] queryId=${queryId} timed out after ${elapsed}ms`);
    }, timeout);

    // 4. Execute the query — non-streaming, get all results at once
    // mssql's request.query() returns a Promise that resolves when all rows are loaded
    const result = await request.query(sql);

    // Query completed successfully — clear timeout
    if (timeoutTimer) clearTimeout(timeoutTimer);

    const executionTime = Date.now() - queryStartTime;
    console.log(`[query.ws] queryId=${queryId} executed in ${executionTime}ms rows=${result.recordset?.length || 0} rowsAffected=${result.rowsAffected}`);

    // Check if cancelled or timed out just before sending results
    if (cancelled || timedOut) {
      console.log(`[query.ws] queryId=${queryId} discarding results due to cancel/timeout`);
      return;
    }

    // 5. Send columns metadata
    const columns = result.recordset?.columns
      ? columnsToArray(result.recordset.columns)
      : [];
    socket.send(JSON.stringify({ type: 'columns', columns, queryId }));
    console.log(`[query.ws] queryId=${queryId} sent columns count=${columns.length}`);

    // 6. Send rows in batches of 100
    const rows = result.recordset || [];
    let totalRows = rows.length;

    if (rows.length > 50000) {
      console.log(`[query.ws] queryId=${queryId} large result set: ${rows.length} rows — batch-sending`);
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      // Re-check cancellation between batches
      if (cancelled || timedOut) {
        console.log(`[query.ws] queryId=${queryId} stopped sending rows due to cancel/timeout at row ${i}`);
        return;
      }
      const batch = rows.slice(i, i + BATCH_SIZE);
      const rowIndex = i;

      // Serialize: convert Dates to ISO strings and BigInts to strings for JSON
      const serializableBatch = batch.map((row, idx) => {
        const out = {};
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (val instanceof Date) {
            out[key] = val.toISOString();
          } else if (typeof val === 'bigint') {
            out[key] = String(val);
          } else if (Buffer.isBuffer(val)) {
            out[key] = `<binary ${val.length} bytes>`;
          } else {
            out[key] = val;
          }
        }
        return out;
      });

      socket.send(JSON.stringify({
        type: 'rows',
        rows: serializableBatch,
        offset: rowIndex,
        total: rows.length,
        queryId
      }));
    }

    // 7. Send done message
    socket.send(JSON.stringify({
      type: 'done',
      rowsAffected: result.rowsAffected || 0,
      totalRows,
      executionTime,
      queryId
    }));
    console.log(`[query.ws] queryId=${queryId} done rows=${totalRows} affected=${result.rowsAffected} time=${executionTime}ms`);

  } catch (err) {
    if (timeoutTimer) clearTimeout(timeoutTimer);

    if (cancelled || timedOut) {
      console.log(`[query.ws] queryId=${queryId} error ignored due to cancel/timeout: ${err.message}`);
      return;
    }

    const elapsed = Date.now() - queryStartTime;
    const errorMessage = decodeError(err);
    socket.send(JSON.stringify({
      type: 'error',
      message: errorMessage,
      queryId,
      executionTime: elapsed
    }));
    console.log(`[query.ws] queryId=${queryId} error after ${elapsed}ms: ${errorMessage} (${err.message})`);
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    activeQueries.delete(queryId);
    socket.off('message', messageHandler);
  }
}

/**
 * Returns stats about active queries (for observability / health check).
 */
function getActiveQueryCount() {
  return activeQueries.size;
}

export { handleQueryWebSocket, getActiveQueryCount };
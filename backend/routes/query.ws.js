import { getPool, executeQuery } from '../services/sqlServer.js';

const activeQueries = new Map();

function decodeError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || String(err);
  if (msg.includes('ECONNREFUSED')) return 'Cannot connect to server';
  if (msg.includes('ELOGIN') || msg.includes('login failed')) return 'Login failed';
  if (msg.includes('ETIMEOUT') || msg.includes('timeout')) return 'Query timeout';
  if (msg.includes('ENOTFOUND')) return 'Server not found';
  if (msg.includes('invalid column')) return 'Invalid column name';
  if (msg.includes('syntax')) return 'SQL syntax error';
  return msg;
}

async function handleQueryWebSocket(socket, data, userId) {
  const { type, connectionId, sql, params, queryId } = data;

  if (type !== 'execute') {
    socket.send(JSON.stringify({ type: 'error', message: 'Unknown command', queryId }));
    return;
  }

  if (!connectionId || !sql) {
    socket.send(JSON.stringify({ type: 'error', message: 'connectionId and sql required', queryId }));
    return;
  }

  let pool = null;
  let cancelled = false;

  const cancelHandler = (msg) => {
    const cmd = JSON.parse(msg);
    if (cmd.type === 'cancel' && cmd.queryId === queryId) {
      cancelled = true;
      if (pool) {
        pool.cancel();
      }
    }
  };

  socket.on('message', cancelHandler);

  try {
    const connRes = await fetch(`http://localhost:3000/api/connections/${connectionId}`, {
      headers: { 'X-User-Id': userId }
    });

    if (!connRes.ok) {
      socket.send(JSON.stringify({ type: 'error', message: 'Connection not found', queryId }));
      return;
    }

    socket.send(JSON.stringify({ type: 'columns', columns: [], queryId }));
    socket.send(JSON.stringify({ type: 'rows', rows: [], total: 0, queryId }));
    socket.send(JSON.stringify({ type: 'done', rowsAffected: 0, executionTime: 0, queryId }));

  } catch (err) {
    socket.send(JSON.stringify({
      type: 'error',
      message: decodeError(err),
      queryId
    }));
  } finally {
    socket.off('message', cancelHandler);
  }
}

export { handleQueryWebSocket };
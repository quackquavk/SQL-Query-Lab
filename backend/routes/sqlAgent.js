// SQL Agent WebSocket route + REST health endpoint
import { randomUUID } from 'crypto';
import { isAvailable, callTool } from '../services/minimaxMcp.js';
import { getPool } from '../services/sqlServer.js';

// Keyword list that triggers a web search via MiniMax MCP
const WEB_SEARCH_KEYWORDS = [
  'schema', 'best practice', 'performance', 'index',
  'azure', 'documentation', 'syntax', 'reference',
  'optimize', 'partition', 'replication'
];

function promptNeedsWebSearch(prompt) {
  const lower = prompt.toLowerCase();
  return WEB_SEARCH_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Handles an authenticated SQL Agent WebSocket connection.
 * @param {import('ws').WebSocket} ws
 * @param {string} userId
 */
export async function handleSqlAgentWebSocket(ws, userId) {
  if (userId === 'anonymous') {
    ws.send(JSON.stringify({ type: 'error', code: 401, message: 'Not authenticated' }));
    ws.close();
    console.log('[sql-agent-ws] Connection rejected: anonymous user');
    return;
  }

  console.log(`[sql-agent-ws] Connected userId=${userId}`);

  ws.on('message', async (rawMsg) => {
    let data;
    try {
      data = JSON.parse(rawMsg.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 400, message: 'Invalid JSON message' }));
      return;
    }

    const { type, prompt, connectionId, context } = data;

    if (type !== 'prompt') {
      ws.send(JSON.stringify({ type: 'error', code: 400, message: 'Unknown message type — expected { type: "prompt", ... }' }));
      return;
    }

    if (!prompt || typeof prompt !== 'string') {
      ws.send(JSON.stringify({ type: 'error', code: 400, message: '"prompt" field is required' }));
      return;
    }

    console.log(`[sql-agent-ws] Received prompt (${prompt.length} chars) userId=${userId}`);

    // Build context: add web search results if keywords match and MCP is available
    let enhancedContext = context || '';
    if (promptNeedsWebSearch(prompt) && isAvailable()) {
      console.log('[sql-agent-ws] Prompt contains keywords — calling web_search via MiniMax MCP');
      try {
        const searchResult = await callTool('web_search', { query: prompt });
        if (searchResult && searchResult.web_search_results) {
          const results = searchResult.web_search_results;
          const snippets = Array.isArray(results)
            ? results.map(r => r.snippet || r.title || '').filter(Boolean).join('\n')
            : JSON.stringify(results);
          enhancedContext = `[Web search results]\n${snippets}\n\n---\nOriginal context:\n${context || '(none)'}`;
          console.log(`[sql-agent-ws] Web search returned ${Array.isArray(results) ? results.length : '?'} result(s)`);
        }
      } catch (searchErr) {
        console.warn('[sql-agent-ws] Web search failed (continuing without it):', searchErr.message);
        enhancedContext = context || '';
      }
    }

    // Call MiniMax API directly to generate SQL
    const apiKey = process.env.MINIMAX_API_KEY;
    const apiHost = process.env.MINIMAX_API_HOST || 'https://api.minimax.chat';

    if (!apiKey) {
      ws.send(JSON.stringify({ type: 'error', code: 503, message: 'MiniMax API key not configured' }));
      console.error('[sql-agent-ws] MINIMAX_API_KEY not set');
      return;
    }

    // Build the messages array for MiniMax
    const systemPrompt = `You are an expert SQL Server T-SQL assistant. Generate accurate, efficient T-SQL queries. Format your response as pure SQL with optional brief comments.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    if (enhancedContext) {
      // Prepend context as a system message
      messages.splice(1, 0, { role: 'system', content: `Context:\n${enhancedContext}` });
    }

    try {
      const apiRes = await fetch(`${apiHost}/v1/text/chatcompletion_pro`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'MiniMax-Text-01',
          messages,
          stream: true
        })
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text().catch(() => 'unknown');
        console.error(`[sql-agent-ws] MiniMax API error ${apiRes.status}: ${errBody}`);
        ws.send(JSON.stringify({ type: 'error', code: 502, message: `MiniMax API error: ${apiRes.status}` }));
        return;
      }

      // Stream the response
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || line.startsWith('data: ')) {
              // SSE format: data: {...}
              const jsonStr = line.replace(/^data: /, '').trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;
              try {
                const chunk = JSON.parse(jsonStr);
                // MiniMax streaming format — adjust as needed based on actual API
                const textChunk = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
                if (textChunk) {
                  fullContent += textChunk;
                  ws.send(JSON.stringify({ type: 'chunk', content: textChunk }));
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      console.log(`[sql-agent-ws] Stream complete, ${fullContent.length} chars`);
      ws.send(JSON.stringify({ type: 'done', sql: fullContent }));

      // Execute the generated SQL against the stored Azure SQL connection, if one is set
      if (connectionId) {
        console.log(`[sql-agent-ws] Execute mode: connectionId=${connectionId} sql=${fullContent.substring(0, 80)}…`);
        await executeSqlAgainstConnection(ws, connectionId, fullContent, userId);
      } else {
        console.log(`[sql-agent-ws] Generation-only mode: no connectionId`);
      }

    } catch (apiErr) {
      console.error('[sql-agent-ws] Stream error:', apiErr.message);
      ws.send(JSON.stringify({ type: 'error', code: 500, message: `Stream error: ${apiErr.message}` }));
    }
  });
}

const BATCH_SIZE = 100;

/**
 * Fetches connection credentials and executes SQL against Azure SQL, streaming results.
 * @param {import('ws').WebSocket} ws
 * @param {string} connectionId
 * @param {string} sql
 * @param {string} userId
 */
async function executeSqlAgainstConnection(ws, connectionId, sql, userId) {
  const queryId = randomUUID();
  const queryStartTime = Date.now();

  // 1. Fetch decrypted connection credentials
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';
  let connData;
  try {
    const connRes = await fetch(`${apiBase}/api/connections/${connectionId}`);
    if (!connRes.ok) {
      const errText = await connRes.text();
      ws.send(JSON.stringify({ type: 'error', code: 404, message: `Connection not found (${connRes.status})` }));
      console.log(`[sql-agent-ws] connectionId=${connectionId} fetch failed: ${connRes.status}`);
      return;
    }
    connData = await connRes.json();
    if (!connData.success || !connData.server) {
      ws.send(JSON.stringify({ type: 'error', message: connData.error || 'Failed to retrieve connection' }));
      console.log(`[sql-agent-ws] connectionId=${connectionId} invalid response: ${connData.error}`);
      return;
    }
    console.log(`[sql-agent-ws] Credential fetch success: server=${connData.server} database=${connData.database} authType=${connData.authType}`);
  } catch (fetchErr) {
    ws.send(JSON.stringify({ type: 'error', message: `Failed to fetch connection: ${fetchErr.message}` }));
    console.error(`[sql-agent-ws] connectionId=${connectionId} fetch error: ${fetchErr.message}`);
    return;
  }

  // 2. Signal execution start
  ws.send(JSON.stringify({ type: 'execute_start', connectionId }));
  console.log(`[sql-agent-ws] Execution started: queryId=${queryId} connectionId=${connectionId}`);

  let pool = null;
  let request = null;
  let timedOut = false;
  const TIMEOUT_MS = 30000;
  let timeoutTimer = setTimeout(() => {
    timedOut = true;
    ws.send(JSON.stringify({ type: 'error', message: `Query timed out after ${TIMEOUT_MS}ms` }));
    console.log(`[sql-agent-ws] queryId=${queryId} timed out`);
  }, TIMEOUT_MS);

  try {
    // 3. Get pooled connection
    pool = await getPool(userId, connData.server, connData.authType, connData.credentials);
    request = pool.request();

    // 4. Execute the query
    const result = await request.query(sql);
    clearTimeout(timeoutTimer);
    const executionTime = Date.now() - queryStartTime;

    if (timedOut) {
      console.log(`[sql-agent-ws] queryId=${queryId} discarding results due to timeout`);
      return;
    }

    console.log(`[sql-agent-ws] Execution complete: queryId=${queryId} rows=${result.recordset?.length || 0} time=${executionTime}ms`);

    // 5. Stream columns
    const columns = result.recordset?.columns
      ? Object.entries(result.recordset.columns).map(([name, col]) => ({ name, type: col.type ? String(col.type) : 'unknown' }))
      : [];
    ws.send(JSON.stringify({ type: 'columns', columns }));

    // 6. Stream rows in batches
    const rows = result.recordset || [];
    const totalRows = rows.length;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      if (timedOut) break;
      const batch = rows.slice(i, i + BATCH_SIZE);
      const serializableBatch = batch.map((row) => {
        const out = {};
        for (const [key, val] of Object.entries(row)) {
          if (val instanceof Date) out[key] = val.toISOString();
          else if (typeof val === 'bigint') out[key] = String(val);
          else if (Buffer.isBuffer(val)) out[key] = `<binary ${val.length} bytes>`;
          else out[key] = val;
        }
        return out;
      });
      ws.send(JSON.stringify({ type: 'rows', rows: serializableBatch, offset: i, total: totalRows }));
    }

    // 7. Send done
    ws.send(JSON.stringify({
      type: 'done',
      sql,
      rowsAffected: result.rowsAffected || 0,
      totalRows,
      executionTime
    }));
    console.log(`[sql-agent-ws] All results sent: queryId=${queryId} totalRows=${totalRows} time=${executionTime}ms`);

  } catch (execErr) {
    clearTimeout(timeoutTimer);
    const errorMessage = decodeExecutionError(execErr);
    ws.send(JSON.stringify({ type: 'error', message: errorMessage }));
    console.error(`[sql-agent-ws] queryId=${queryId} execution error after ${Date.now() - queryStartTime}ms: ${errorMessage}`);
  }
}

function decodeExecutionError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || String(err);
  if (msg.includes('ECONNREFUSED')) return 'Cannot connect to server — check server address and port';
  if (msg.includes('ELOGIN') || msg.includes('login failed') || msg.includes('.Login failed')) return 'Login failed — check username and password';
  if (msg.includes('ETIMEOUT') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) return 'Query timeout';
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) return 'Server not found — check server address';
  if (msg.includes('invalid column')) return 'Invalid column name';
  if (msg.includes('syntax') || msg.includes('incorrect syntax')) return 'SQL syntax error';
  return msg;
}

// Export the status endpoint handler (used by server.js flat handler)
export async function getSqlAgentStatus(ctx) {
  return ctx.json({ mcpAvailable: isAvailable() });
}
// SQL Agent WebSocket route + REST health endpoint
import { randomUUID } from 'crypto';
import { isAvailable, callTool } from '../services/minimaxMcp.js';

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
      ws.send(JSON.stringify({ type: 'done', totalLength: fullContent.length }));

    } catch (apiErr) {
      console.error('[sql-agent-ws] Stream error:', apiErr.message);
      ws.send(JSON.stringify({ type: 'error', code: 500, message: `Stream error: ${apiErr.message}` }));
    }
  });

  ws.on('error', (err) => {
    console.error(`[sql-agent-ws] WebSocket error: ${err.message}`);
  });
}

// Export the status endpoint handler (used by server.js flat handler)
export async function getSqlAgentStatus(ctx) {
  return ctx.json({ mcpAvailable: isAvailable() });
}
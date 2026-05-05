// MiniMax MCP service manager — spawns and communicates with the
// minimax-coding-plan-mcp subprocess via JSON-RPC 2.0 over stdio/ipc.
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

let mcpProcess = null;
let available = false;

// Pending request resolvers keyed by request ID
const pendingRequests = new Map();

/**
 * Starts the MiniMax MCP server subprocess.
 * Reads MINIMAX_API_KEY and MINIMAX_API_HOST from process.env.
 * Returns { available: false } immediately if spawn fails.
 */
export function startMcpServer() {
  const apiKey = process.env.MINIMAX_API_KEY;
  const apiHost = process.env.MINIMAX_API_HOST || 'https://api.minimax.chat';

  if (!apiKey) {
    console.warn('[minimax-mcp] MINIMAX_API_KEY not set — MCP unavailable');
    return { available: false };
  }

  try {
    mcpProcess = spawn(
      'uvx',
      ['minimax-coding-plan-mcp'],
      {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          MINIMAX_API_KEY: apiKey,
          MINIMAX_API_HOST: apiHost
        }
      }
    );

    mcpProcess.on('spawn', () => {
      console.log('[minimax-mcp] Process spawned with PID', mcpProcess.pid);
    });

    mcpProcess.on('message', (message) => {
      // Handle JSON-RPC responses and notifications from MCP
      if (!message || typeof message !== 'object') return;

      // Response: must have id to correlate with a pending request
      if (message.id !== undefined) {
        const resolver = pendingRequests.get(String(message.id));
        if (resolver) {
          pendingRequests.delete(String(message.id));
          if (message.error) {
            resolver.reject(new Error(message.error.message || JSON.stringify(message.error)));
          } else {
            resolver.resolve(message.result);
          }
        }
      }

      // Notification: log but don't resolve anything
      if (message.id === undefined && message.method) {
        console.log('[minimax-mcp] Notification:', message.method, message.params);
      }
    });

    mcpProcess.stdout.on('data', (data) => {
      // Raw stdout data — the primary communication channel for JSON-RPC responses
      try {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id !== undefined) {
              const resolver = pendingRequests.get(String(msg.id));
              if (resolver) {
                pendingRequests.delete(String(msg.id));
                if (msg.error) {
                  resolver.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                } else {
                  resolver.resolve(msg.result);
                }
              }
            }
          } catch {
            // Not JSON — ignore non-JSON stdout noise
          }
        }
      } catch {
        // Non-UTF8 data — ignore
      }
    });

    mcpProcess.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        console.warn('[minimax-mcp] stderr:', text);
      }
    });

    mcpProcess.on('error', (err) => {
      console.error('[minimax-mcp] Process error:', err.message);
      available = false;
      // Reject all pending requests
      for (const [id, resolver] of pendingRequests) {
        resolver.reject(new Error('MCP process error'));
        pendingRequests.delete(id);
      }
    });

    mcpProcess.on('exit', (code, signal) => {
      console.log(`[minimax-mcp] Process exited code=${code} signal=${signal}`);
      available = false;
      mcpProcess = null;
      // Reject all pending requests
      for (const [id, resolver] of pendingRequests) {
        resolver.reject(new Error('MCP process exited'));
        pendingRequests.delete(id);
      }
    });

    available = true;
    console.log('[minimax-mcp] Started successfully');
    return { available: true };

  } catch (err) {
    console.error('[minimax-mcp] Failed to start:', err.message);
    available = false;
    return { available: false };
  }
}

/**
 * Sends a JSON-RPC 2.0 tool call request to the MCP subprocess.
 * @param {string} toolName - Name of the MCP tool to call (e.g. 'web_search')
 * @param {object} args - Tool arguments (e.g. { query: '...' })
 * @returns {Promise<any>} Tool result
 */
export async function callTool(toolName, args) {
  if (!available || !mcpProcess) {
    throw new Error('MCP subprocess not available');
  }

  const id = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`MCP tool call '${toolName}' timed out after 30s`));
      }
    }, 30000);

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    try {
      mcpProcess.send({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(new Error(`Failed to send MCP request: ${err.message}`));
    }
  });
}

/**
 * Returns whether the MCP subprocess is running and available.
 * @returns {boolean}
 */
export function isAvailable() {
  return available;
}

/**
 * Stops the MCP subprocess gracefully.
 */
export function close() {
  if (mcpProcess) {
    console.log('[minimax-mcp] Shutting down subprocess PID', mcpProcess.pid);
    mcpProcess.kill('SIGTERM');
    mcpProcess = null;
    available = false;
  }
}

// Start immediately on module load
const startup = startMcpServer();
if (!startup.available) {
  console.warn('[minimax-mcp] Module loaded but MCP is not available — web search will be skipped');
}
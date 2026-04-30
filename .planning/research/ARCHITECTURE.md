# Architecture Research: Browser-Based SQL Server Management Studio

**Research Date:** 2026-04-30
**Confidence:** MEDIUM

## Executive Summary

Professional SQL management tools have a clear split between thin client (UI + query editing) and thick service (SQL execution, connection management, secure credential storage). Azure Data Studio's architecture — built on VS Code's foundation with a Node.js backend layer — is the closest reference point for this project's target architecture.

The critical architectural shift from the existing codebase: **the browser cannot directly connect to SQL Server**. A backend proxy is mandatory. This proxy becomes the secure gateway that holds connection credentials, manages connection pools, executes queries, and returns results to the browser.

---

## How Professional SQL Management Tools Are Structured

### Reference: Azure Data Studio (Electron/VS Code)

Azure Data Studio (archived February 2026) was the closest analog to this project — cross-platform, browser-like UI, SQL Server connectivity. Its architecture:

```
┌─────────────────────────────────────────────────┐
│              Azure Data Studio                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │   React UI  │  │  Query      │  │  Object   │ │
│  │   (Electron│  │  Editor     │  │  Explorer │ │
│  │   Renderer)│  │  (Monaco)   │  │           │ │
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘ │
│         │               │               │       │
│  ┌──────┴───────────────┴───────────────┴─────┐ │
│  │       VS Code Service Layer (IPC)          │ │
│  │  - Workspace, File System, Settings       │ │
│  └──────────────────┬────────────────────────┘ │
│                     │                          │
│  ┌──────────────────┴────────────────────────┐ │
│  │       Node.js Main Process                  │ │
│  │  - mssql (Tedious) driver                  │ │
│  │  - Connection Manager                        │ │
│  │  - Query execution                          │ │
│  │  - Credential storage (keytar)              │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Key insight:** Even Azure Data Studio (Electron, desktop app) used a Node.js main process as the SQL Server gateway. The renderer process never talks directly to SQL Server. This is both a security boundary and a technical necessity — TDS protocol cannot be proxied through a browser.

### Reference: dbForge Studio (Windows Desktop)

Windows-native competitor with similar structure:
- UI layer (query editor, object explorer, result grids)
- Connection manager with encrypted credential storage
- Query execution engine using ADO.NET SqlClient
- No browser involvement — but same architectural principle: **credentials never live in the UI layer**

### Reference: MSSQL extension for VS Code

The successor to Azure Data Studio's SQL capabilities. Uses a language server protocol approach where:
- The extension (running in VS Code's Node environment) connects to SQL Server
- The editor sends queries through the extension's command handlers
- Results flow back as structured JSON

**Conclusion:** All professional SQL tools, regardless of UI form factor, share this architecture:
```
[UI Layer] → [Query Execution Layer] → [SQL Server Driver/Protocol Layer] → [SQL Server]
```

---

## Component Communication Patterns

### Pattern 1: Backend Proxy (REST API + WebSocket)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
│   │   React   │   │  Query   │   │ Connection│  │   Results    │  │
│   │   App     │   │  Editor  │   │  Dialog   │  │    Grid      │  │
│   └─────┬─────┘   └────┬─────┘   └────┬─────┘  └──────┬───────┘  │
│         └─────────────┼───────────────┼──────────────┘          │
│                    fetch / WebSocket                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                      Backend Proxy (Node.js)                     │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│   │   REST     │  │  Query     │  │ Connection │  │  Credential│ │
│   │   Routes   │  │  Executor  │  │  Pool      │  │  Store     │ │
│   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘ │
│         │              │              │               │       │
│   ┌─────┴───────────────┴──────────────┴───────────────┴─────┐  │
│   │                   Tedious / mssql                        │  │
│   │          (Tabular Data Stream protocol)                 │  │
│   └──────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   SQL Server        │
                    │   (TDS port 1433)   │
                    └─────────────────────┘
```

**Used by:** Azure Data Studio's architecture, modern web-based database tools (PlanetScale, Supabase's SQL editor, DBeaver Cloud)

### Pattern 2: Message Channel (VS Code Extension Model)

The browser extension communicates with a local service via message passing. More common when the "backend" runs on the same machine as the UI.

**Not suitable for:** This project (browser-only deployment means backend runs on a server, not the user's machine)

### Pattern 3: Direct Connection (Anti-pattern for SQL Server)

Connecting from browser JavaScript directly to SQL Server is **not possible** because:
- **CORS:** SQL Server doesn't speak HTTP CORS headers
- **TDS Protocol:** Browser WebSocket cannot establish TDS handshake
- **Credential exposure:** Connection strings would be visible in browser network tab
- **Firewall:** SQL Server typically not exposed to browser clients directly

---

## How Browser-Based Architecture with Backend Proxy Works

### The Browser Side

The browser becomes a **thin client** that:
1. Renders the UI (query editor, results grid, object explorer)
2. Manages local state (query tabs, local drafts, preferences)
3. Sends SQL queries and connection commands to the backend
4. Receives and displays query results
5. Never holds SQL Server credentials

### The Backend Proxy Side

The Node.js backend proxy:
1. **Receives** connection configuration (server, database, auth mode)
2. **Establishes** connections to SQL Server using Tedious
3. **Manages** a connection pool (reuses connections per user session)
4. **Executes** queries on behalf of the browser client
5. **Returns** structured results (JSON arrays, row counts, execution metadata)
6. **Handles** errors with detailed messaging back to the client

### The Protocol Between Them

**REST API for CRUD operations on connections:**
```
POST   /api/connections          → Create/save a connection
GET    /api/connections          → List saved connections
DELETE /api/connections/:id      → Remove saved connection
```

**WebSocket for query execution (real-time, streaming):**
```
WS /api/query
  → Send: { connectionId, sql, params, queryId }
  ← Receive: { type: 'columns', columns: [...] }
  ← Receive: { type: 'rows', rows: [...], total: N }
  ← Receive: { type: 'done', rowsAffected: N, executionTime: Ms }
  ← Receive: { type: 'error', message: '...' }
```

**Why WebSocket over REST for queries:**
- Long-running queries need real-time progress (cancel support)
- Large result sets stream row-by-row (not buffered)
- Connection state can be pushed from server (disconnect events)
- Lower latency than HTTP polling

---

## Major Architectural Decisions

### Decision 1: Backend Proxy Framework

**Recommendation: Express.js or Fastify (Node.js)**

| Option | Pros | Cons |
|--------|------|------|
| **Express.js** | Battle-tested, vast middleware ecosystem, familiar to Node devs | Verbose, slower than alternatives |
| **Fastify** | Much faster, built-in schema validation, better TypeScript support | Smaller ecosystem |
| **Hono** | Minimal, edge-deployable, very fast | Newer, less middleware |
| **Koa** | Lighter than Express, async/await native | Less common for services |

**Recommendation:** **Express.js** for broad library support, or **Fastify** if performance matters for multi-user concurrent connections.

**Not recommended:** NestJS — adds structural overhead that doesn't benefit this use case.

### Decision 2: SQL Server Driver

**Recommendation: mssql (Tedious) — NOT msnodesqlv8**

| Driver | Pros | Cons |
|--------|------|------|
| **mssql (Tedious)** | Pure JavaScript, works cross-platform, connection pool built-in, well-maintained | Requires Tabular Data Stream parsing (handled by library) |
| **msnodesqlv8** | Uses native SQL Server driver on Windows | Windows-only, not cross-platform |
| **node-sqlserver-v8** | Native driver | Abandoned, no ARM support |

**Key mssql API pattern for the proxy:**
```javascript
import mssql from 'mssql';

const pool = await mssql.connect({
  server: 'your-server.database.com',
  database: 'YourDB',
  user: 'username',
  password: 'password',
  options: {
    encrypt: true,           // Required for Azure SQL
    trustServerCertificate: false,
    port: 1433
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
});

const result = await pool.query('SELECT * FROM Customers WHERE Region = @region', {
  region: 'North America'
});

// result.recordset = row data
// result.rowsAffected = count
```

### Decision 3: Credential Storage

**Critical security requirement:** Connection strings/secrets never stored in the browser or logged anywhere.

**Recommendation:**

| Storage Location | Encryption | Access |
|------------------|-----------|--------|
| **Server-side encrypted store** (e.g., AWS Secrets Manager, HashiCorp Vault, or encrypted file) | AES-256 with per-user key derived from user's own secret | Backend only, never exposed to frontend |
| **Session-based derivation** | User provides password at connect time, backend derives encryption key | Backend derives key, never stored |

**For MVP:** Encrypt connection strings with a server-side master key, store in a JSON file or SQLite on the server. Each saved connection is encrypted as a blob. User's session unlocks the master key.

**Critical:** Never log connection strings. Never include them in API responses. Only return a safe identifier (connection name, not credentials).

### Decision 4: Frontend Architecture

**Recommendation: Stay with Vanilla JS (incrementally improved) OR migrate to React**

Given the existing codebase uses vanilla JS with 13 modules, the recommendation is:

| Approach | Rationale |
|----------|-----------|
| **Option A: Vanilla JS with module restructuring** | Keep existing CodeMirror integration, refactor modules to support both sql.js (practice/sandbox) and API-based (live) execution. Lower risk, faster to ship. |
| **Option B: React (lightweight)** | Better state management for complex UI (multiple query tabs, object explorer, result sets). VS Code uses Monaco + React. Familiar to professional devs. |

**Recommendation:** Option A for initial backend proxy launch. The UI layer fundamentally changes (from local sql.js to remote API), so major React rewriting can happen in a later phase once the proxy is stable.

### Decision 5: Module Separation — Old Architecture vs New

**Current architecture (client-only):**
```
scripts/main.js → wires all
scripts/runtime.js → SQL singleton, editor, DBs
scripts/state.js → localStorage persistence
scripts/db.js → sql.js operations
scripts/sandbox.js → sandbox/run queries
scripts/practice.js → practice mode
scripts/ui.js → DOM rendering
scripts/editor.js → CodeMirror init
```

**Target architecture:**
```
Browser (vanilla JS modules):
  main.js          → boot, wire UI
  apiClient.js     → fetch/WebSocket to backend proxy
  runtime.js       → editor instance, query state, connection session
  state.js         → local UI state (tabs, preferences) + remote state sync
  sandbox.js       → sandbox mode (still uses sql.js locally)
  practice.js      → practice mode (still uses sql.js locally)
  ui.js            → DOM rendering
  editor.js        → CodeMirror

Backend Proxy (Node.js):
  server.js        → Express/Fastify app entry
  routes/
    connections.js → CRUD for saved connections
    query.js       → Query execution endpoint
  services/
    sqlServer.js   → mssql connection pool management
    crypto.js      → Connection string encryption/decryption
  middleware/
    auth.js        → Session validation
    logging.js     → Request logging (no credentials)
```

### Decision 6: Connection Lifecycle Management

**The user flow:**
1. User enters server/credentials in connection dialog
2. Backend validates and establishes connection
3. Connection is pooled, assigned a session ID
4. All subsequent queries use this session ID (not credentials)
5. User disconnects → connection returned to pool or closed

**Critical consideration:** SQL Server connections are expensive to establish. The proxy must pool aggressively:
- **Per-user pool:** Each authenticated user gets a pool of connections to each server they use
- **Pool timeout:** Connections idle >30s returned to pool
- **Max per user:** Cap at 5 concurrent connections per server per user

### Decision 7: Query Result Handling

**Memory concern:** Large result sets can overwhelm the proxy and browser.

**Recommendation:**
1. Stream results row-by-row for large SELECTs (>1000 rows)
2. Return pagination tokens for result continuation
3. Browser renders incrementally (virtual scrolling for results grid)
4. Cap maximum result set at 10,000 rows with warning

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Browser Holds Connection String

Never send raw connection strings to the browser. Even over HTTPS, they appear in browser memory and potentially network logs. The backend must hold credentials.

### Anti-Pattern 2: Direct SQL Server Exposed to Internet

SQL Server's TDS protocol should never be directly accessible from the browser. All traffic goes through the proxy which enforces authentication and can implement rate limiting.

### Anti-Pattern 3: mssql pool per query

Creating a new mssql connection for every query is slow. Use a persistent pool:
```javascript
// Bad
async function runQuery(sql) {
  const pool = await mssql.connect(config); // new connection each time
  return pool.query(sql);
}

// Good - pool is module-level singleton
const pool = new mssql.ConnectionPool(config);
await pool.connect();
async function runQuery(sql) {
  return pool.query(sql); // reuses connection
}
```

### Anti-Pattern 4: Storing passwords in plain text

Even on the backend. Encrypt connection passwords at rest using AES-256-GCM with a server-side master key. If the database of connections is leaked, passwords remain encrypted.

### Anti-Pattern 5: Using sql.js mode architecture unchanged for live connections

The current sandbox.js `runSandboxQuery()` pattern returns sql.js results directly:
```javascript
const results = db.exec(sql); // local sql.js
```

For live connections, this must change to:
```javascript
const results = await fetch('/api/query', { body: { sql } }); // backend proxy
```

The `runtime.cursor.lastUserResult` can remain the same shape — but the source changes.

---

## Scalability Considerations

| Scale | Concern | Approach |
|-------|---------|----------|
| **10 concurrent users** | Connection pool starvation | One pool per user per server, pool.max = 10 per user |
| **100 concurrent users** | Proxy memory, connection queuing | Horizontal scaling (multiple proxy instances), load balancer |
| **Large result sets** | Proxy memory, browser rendering | Stream results, virtual scrolling, row pagination |
| **Long-running queries** | WebSocket timeout, query cancellation | Heartbeat pings, cancel endpoint, query timeout (30s default) |
| **Multiple servers** | Per-server connection pools | Pool registry keyed by server+user |

---

## Current Codebase Adaptation

The existing codebase needs restructuring to support the backend proxy while maintaining the practice/sandbox modes (which still use sql.js locally):

```
Phase 1 (Architecture foundation):
1. Add backend proxy (Express + mssql)
2. Create apiClient.js module for frontend-backend communication
3. Adapt runtime.js to hold connection session state (not just sql.js state)
4. Add connection dialog UI

Phase 2 (Query execution):
5. Replace sandbox query path with API calls when connected to live server
6. Maintain sql.js path for sandbox/practice modes unchanged
7. Add WebSocket support for query streaming

Phase 3 (Full feature parity):
8. Add object explorer (schema browsing via API)
9. Add execution plan viewer
10. Refactor UI to VS Code-inspired layout
```

The existing 13 JS modules remain largely intact for the practice/sandbox paths. Only the query execution path changes for live SQL Server connections.

---

## Key Sources

- Azure Data Studio architecture: archived GitHub repo, now directs to VS Code MSSQL extension
- mssql/Tedious: maintained npm package, Microsoft-supported
- REST vs WebSocket for SQL queries: industry standard (Supabase, PlanetScale use WebSocket for real-time query execution)
- Connection string security: standard practice (never expose to client)

**Confidence:** MEDIUM — based on Azure Data Studio archived reference, mssql npm documentation, and web-based database tool patterns. Would benefit from examining MSSQL extension for VS Code source code (microsoft/vscode-mssql on GitHub) for protocol-level details.
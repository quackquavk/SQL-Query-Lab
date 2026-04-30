# Technology Stack

**Project:** Browser-based SQL Server Management Studio
**Researched:** 2026-04-30
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Frontend)                       │
│  React + Monaco Editor + WebSocket Client                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket / HTTP
┌─────────────────────┴───────────────────────────────────────┐
│                  BACKEND PROXY                              │
│  Node.js + Express + tedious (TDS protocol)               │
│  - Connection management                                    │
│  - Query execution                                          │
│  - Result streaming                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ TDS Protocol (TCP)
┌─────────────────────┴───────────────────────────────────────┐
│                  SQL SERVER                                 │
│  SQL Server 2012+ on Windows/Linux/Azure SQL               │
└─────────────────────────────────────────────────────────────┘
```

### Core Stack

| Layer | Technology | Version | Purpose | Why |
|-------|------------|---------|---------|-----|
| **Frontend Framework** | React | 18.x | UI components | Mature ecosystem, Monaco Editor integration, Azure Data Studio uses React |
| **Code Editor** | Monaco Editor | 0.50+ | SQL editing with IntelliSense | Microsoft-authored, powers VS Code, T-SQL language support via extensibility |
| **Backend Runtime** | Node.js | 22.x LTS | Backend proxy server | Cross-platform, async I/O for concurrent connections, tedious TDS library support |
| **SQL Connectivity** | tedious | 19.x | TDS protocol implementation | Pure JavaScript, supports TDS 7.4 (SQL Server 2012-2022), actively maintained (1.6k stars) |
| **Web Framework** | Express | 4.x | HTTP API server | Minimal, fast, well-documented for REST API + WebSocket |
| **Real-time Comms** | WebSocket (ws) | 9.x | Live query results | Bidirectional, low-latency streaming of query results to browser |
| **State Management** | Zustand | 5.x | Connection/query state | Lightweight, TypeScript-first, simpler than Redux for this use case |
| **Styling** | Tailwind CSS | 3.x | UI styling | Rapid development, VS Code-style dark themes achievable |
| **Build Tool** | Vite | 6.x | Frontend bundling | Fast HMR, native ESM, excellent Monaco integration |

### Database Driver Details

| Library | Language | Purpose | Notes |
|---------|----------|---------|-------|
| **tedious** | TypeScript/Node.js | TDS protocol client | Industry standard for Node.js SQL Server connectivity; supports SQL Server 2000-2022 |
| **mssql** | Node.js | tedious wrapper | Connection pooling, promise-based API; use for higher-level operations |
| **Microsoft.Data.SqlClient** | C#/.NET | TDS protocol (reference) | Azure Data Studio / VS Code MSSQL extension uses this via SQL Tools Service |

**Why tedious over alternatives:**
- Pure JavaScript/TypeScript — no native dependencies to install
- Actively maintained by Microsoft (used in production tools)
- Supports all SQL Server authentication methods (SQL auth, Windows auth via NTLM, Azure AD)
- Implements TDS 7.4 (SQL Server 2012+) which covers essentially all modern SQL Server deployments

### Alternative Approaches Considered

| Approach | Pros | Cons | Why Not |
|----------|------|------|---------|
| **SQL Tools Service (.NET)** | Microsoft official, already used by VS Code | HTTP API not well documented, primarily stdio-based | More complex to deploy, .NET runtime required; tedious is simpler for HTTP proxy |
| **JDBC via server-side Java** | Mature driver | Additional runtime, Java ecosystem unfamiliar | Overkill for this use case |
| **Go-based TDS client** | Performance | New language to maintain | Unnecessary complexity at this stage |

### Supporting Libraries

| Library | Purpose | When to Use |
|---------|---------|-------------|
| **sql-formatter** | T-SQL formatting | Query beautification, consistent styling |
| **zod** | Schema validation | Validate connection configs, API request/response types |
| **@tanstack/react-query** | Server state | Query caching, background refetching for connection list |
| **react-aria** | Accessibility | Keyboard navigation, screen reader support for professional tool |

## Project Structure

```
sqlquerylab/
├── frontend/                    # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── QueryEditor/    # Monaco-based SQL editor
│   │   │   ├── ResultsGrid/    # Query results display
│   │   │   ├── ConnectionMgr/  # Connection dialog, object explorer
│   │   │   └── TabWorkspace/   # Multi-tab query workspace
│   │   ├── hooks/
│   │   │   └── useQuery.ts     # Query execution with WebSocket
│   │   ├── stores/
│   │   │   └── connectionStore.ts  # Zustand connection state
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── backend/                    # Node.js proxy server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── connections.ts  # Connection CRUD
│   │   │   └── queries.ts      # Query execution endpoints
│   │   ├── services/
│   │   │   ├── sqlServer.ts    # tedious wrapper
│   │   │   └── connectionPool.ts
│   │   ├── websocket/
│   │   │   └── queryStream.ts  # Real-time result streaming
│   │   └── index.ts
│   └── package.json
└── package.json               # Workspace root
```

## Key Technical Decisions

### 1. Browser Cannot Connect Directly to SQL Server
**Constraint:** Browsers cannot open raw TCP sockets to SQL Server (TDS protocol requires connection-oriented sockets).

**Solution:** Node.js backend acts as proxy. Browser communicates via HTTP/WebSocket to backend; backend maintains TDS connection to SQL Server.

### 2. Use WebSocket for Query Results
**Reason:** SQL Server returns results as streaming tabular data. WebSocket allows backend to stream rows to frontend as they arrive, showing results progressively rather than waiting for complete dataset.

### 3. Connection Pooling
**Reason:** Professional tools need multiple concurrent connections. Use `mssql` connection pool with tedious underneath.

### 4. Monaco Editor for SQL
**Reason:** VS Code's editor powers the official MSSQL extension. Monaco provides excellent T-SQL syntax highlighting, IntelliSense via language server protocol, and is designed for professional editing experiences.

## Installation

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install

# Root workspace
npm install -D tailwindcss @tailwindcss/vite
```

## Sources

- [tedious GitHub](https://github.com/tediousjs/tedious) — Node.js TDS implementation, 1.6k stars
- [vscode-mssql](https://github.com/microsoft/vscode-mssql) — Reference implementation for SQL Server VS Code extension
- [SQL Tools Service](https://github.com/microsoft/sqltoolsservice) — .NET backend used by Azure Data Studio
- [Microsoft.Data.SqlClient](https://github.com/dotnet/SqlClient) — Official .NET SQL Server driver
- [Azure Data Studio architecture](https://learn.microsoft.com/en-us/sql/azure-data-studio/what-is-azure-data-studio) — Decommissioned but architecture still relevant
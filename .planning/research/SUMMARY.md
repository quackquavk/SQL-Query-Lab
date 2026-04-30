# Project Research Summary

**Project:** SQL Query Lab — Browser-Based SQL Server Management Studio
**Domain:** Professional database management tools
**Researched:** 2026-04-30
**Confidence:** MEDIUM

## Executive Summary

SQL Query Lab targets a clear market gap: cross-platform, professional-grade SQL Server management in a browser. Azure Data Studio was retired February 2026, SSMS remains Windows-only, and existing browser-based tools are "learning toys" not production tools. This project must deliver SSMS-level functionality while running entirely in the browser—a constraint that fundamentally requires a backend proxy since browsers cannot speak the TDS protocol SQL Server uses.

Research converges on a Node.js/Express backend proxy connecting to SQL Server via tedious (pure JavaScript TDS implementation), with a React frontend using Monaco Editor for the VS Code-style editing experience professionals expect. The critical architectural shift: **credentials never touch the browser**. The proxy acts as a secure vault, managing connection pools and query execution. This isn't optional—it's the only way to safely bridge browser sandbox limitations with SQL Server's connection-oriented protocol.

Key risks are mitigable: SQL injection requires strict parameterization enforcement; credential exposure requires backend-only storage with encryption; unbounded result sets require streaming pagination with virtual scrolling. The MVP scope should focus on table-stakes features (connection dialog, object explorer, query editor, results grid) before adding differentiators (visual designers, execution plans).

## Key Findings

### Recommended Stack

**Architecture:** Browser (React + Monaco) → Node.js Backend Proxy (Express + tedious) → SQL Server (TDS 1433)

The backend proxy is architecturally mandatory—not a performance optimization but a security and protocol necessity. Browser WebSocket cannot establish TDS handshake, and SQL Server doesn't speak HTTP CORS. Every query and connection must flow through the proxy.

**Core technologies:**
- **React 18.x** — UI framework; Azure Data Studio proven React viable for SQL tools
- **Monaco Editor 0.50+** — VS Code's editor, powers official MSSQL extension; T-SQL IntelliSense via language server extensibility
- **Node.js 22.x LTS** — Backend runtime; async I/O for concurrent connections, cross-platform
- **tedious 19.x** — Pure JavaScript TDS protocol; supports SQL Server 2012-2022, all auth methods (SQL, Windows, Entra MFA)
- **mssql** — Connection pooling wrapper around tedious; module-level singleton pool pattern critical
- **Express 4.x** — HTTP API server; vast middleware ecosystem
- **WebSocket (ws) 9.x** — Real-time query streaming; row-by-row results without buffering entire set
- **Zustand 5.x** — Connection/query state; lightweight TypeScript-first alternative to Redux
- **Tailwind CSS 3.x + Vite 6.x** — Styling and bundling; VS Code-style dark themes achievable

**Key constraint:** Existing codebase uses vanilla JS with 13 modules. Architecture recommends Option A: maintain vanilla JS for initial backend proxy launch, refactor to React once proxy is stable. The query execution path changes for live connections; sandbox/practice modes remain using sql.js.

### Expected Features

**Must have (table stakes):**
- Connection dialog with multi-auth support (SQL, Windows, Entra MFA for Azure SQL)
- Object Explorer with tree navigation (databases → tables → views → SPs → functions)
- Query editor with T-SQL syntax highlighting and IntelliSense
- Results grid with CSV/JSON export
- Multiple query tabs with history persistence across sessions
- Dark/light themes (VS Code-style, not afterthought CSS swaps)

**Should have (competitive differentiators):**
- Visual table designer (CREATE/ALTER without DDL)
- Execution plan viewer (XML parsing + visual flowchart)
- Database diagram visualization (ER diagrams, foreign key relationships)
- Code snippets with categories
- Connection groups/favorites for environment organization

**Defer (v2+):**
- SQL Agent job management (complex, niche audience)
- Full security administration (permission management UI)
- Backup/restore GUI (low frequency operation)
- Multi-database transactions (explicitly out of scope)

**Market context:** Azure Data Studio retirement (Feb 2026) creates immediate gap. Microsoft directs users to VS Code SQL extensions, but VS Code is Electron desktop, not browser. No true cross-platform browser SQL tool exists—this project fills that gap.

### Architecture Approach

**Pattern:** Backend Proxy (REST API + WebSocket) — all professional SQL tools use this architecture regardless of UI form factor.

```
Browser (UI Layer) → Backend Proxy (Query Execution) → Tedious/mssql (TDS) → SQL Server
```

**Major components:**
1. **Frontend (Browser)** — Thin client: React UI, Monaco editor, local state (tabs, preferences). Never holds credentials. Sends queries via fetch/WebSocket, renders results.
2. **Backend Proxy (Node.js)** — Gateway: Express routes for connection CRUD, WebSocket for streaming query execution, mssql connection pool per user per server, encrypted credential storage.
3. **Credential Store** — Server-side only: AES-256 encrypted connection blobs, master key derived from user's session. Never returned to browser (only safe identifiers).
4. **SQL Server Driver Layer** — tedious TDS implementation: handles protocol handshake, authentication, parameterized queries, result streaming.

**Communication:**
- REST: `POST/GET/DELETE /api/connections` for connection management
- WebSocket: Send `{connectionId, sql, params}`, receive streaming `{columns, rows, done, error}`
- Session affinity: Queries from same browser session route to same SQL Server connection via sticky sessions

**Critical decisions:**
- Connection pooling: Module-level singleton, not per-query creation
- Result streaming: Row-by-row for large sets (>1000 rows), virtual scrolling in browser
- Query timeout: AbortController client-side (30s default), proxy-enforced server-side maximum
- Least privilege: Proxy connections use minimum permissions required, often read-only

### Critical Pitfalls

1. **Connection String Exposure** — Never store credentials in localStorage/IndexedDB. Browser memory exposure via XSS, DevTools, or logs. Prevention: Backend proxy as credential vault; credentials enter via dialog, used to establish session, discarded from client.

2. **SQL Injection via Query Forwarding** — Raw SQL passed through proxy becomes injection vector. Prevention: Parameterization-first API; query validation layer rejecting dangerous patterns; connection-level isolation.

3. **Unbounded Result Set Rendering** — Large result sets crash browser tab (OOM). Prevention: Server-side pagination (OFFSET/FETCH, 100-500 rows default), virtual scrolling, "Download full CSV" bypass, proxy-enforced row limits (10K max with warning).

4. **Backend Proxy as Direct SQL Access Point** — Proxy becomes attack surface if it just tunnels arbitrary SQL. Prevention: Query permission enforcement, not raw SQL tunnel; least-privilege pooling; audit logging with user attribution.

5. **Query Timeout Blindness** — No cancellation mechanism freezes UI on long queries. Prevention: AbortController with configurable timeout; cancel button aborts network AND sends cancel to proxy; partial results visibility on cancellation.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Backend Proxy Foundation
**Rationale:** Architecture is blocker for all live SQL Server functionality. Must establish secure connection management before query execution can exist. Dependencies: None (greenfield backend).

**Delivers:** Express backend proxy with mssql connection pooling, REST API for connection CRUD, WebSocket endpoint for query execution, encrypted credential storage, session management.

**Avoids:** Pitfall 1 (credential exposure), Pitfall 4 (proxy as direct SQL tunnel), Pitfall 6 (connection state errors from improper pooling)

**Uses:** Stack: Node.js 22.x, Express 4.x, tedious 19.x, mssql, WebSocket ws 9.x

---

### Phase 2: Connected Query Execution
**Rationale:** Core workflow depends on Phase 1. Query editor, execution, and results grid are table-stakes features users expect immediately. Must implement streaming, pagination, and timeout handling from the start.

**Delivers:** Query editor with Monaco (T-SQL highlighting), WebSocket query execution with row streaming, results grid with virtual scrolling, CSV/JSON export, query timeout/cancel, error handling with decoded SQL Server error codes.

**Avoids:** Pitfall 3 (unbounded rendering), Pitfall 5 (timeout blindness), Pitfall 12 (cryptic errors)

**Implements:** Architecture component: Frontend-Backend communication pattern

---

### Phase 3: Connection Management & Object Explorer
**Rationale:** Connection dialog and object explorer are table stakes; without object browsing, tool feels incomplete. Builds on Phase 1 connection infrastructure.

**Delivers:** Connection dialog (SQL/Windows/Entra MFA auth), Object Explorer tree (databases, tables, views, SPs, functions with context menus), connection favorites/groups, connection health validation.

**Uses:** Stack: React 18.x (if migrating) or vanilla JS modules, Zustand 5.x for state

---

### Phase 4: Multi-Tab Workspace
**Rationale:** Power users expect VS Code-style tab management. Tabs are the primary workspace—data loss on crash destroys trust. Builds on connected query execution (Phase 2).

**Delivers:** Multiple query tabs with independent state, debounced autosave to localStorage, session restore on reload, dirty indicators, tab history persistence across sessions.

**Avoids:** Pitfall 8 (workspace data loss)

---

### Phase 5: Professional Polish
**Rationale:** Keyboard shortcuts and theming are non-negotiable for professional audience. VS Code/SSMS power users have ingrained muscle memory. Without these, tool feels amateur.

**Delivers:** VS Code-style keyboard shortcuts (Cmd/Ctrl+S save, Cmd/Ctrl+N new tab, Cmd/Ctrl+W close, Cmd/Ctrl+Enter execute, F5 execute), first-class dark/light theming (CSS custom properties, WCAG AA contrast), shortcut customization, shortcut cheat sheet overlay.

**Avoids:** Pitfall 9 (shortcut conflicts), Pitfall 13 (dark mode as afterthought)

---

### Phase 6: Differentiators (Visual Tools)
**Rationale:** Visual table designer and execution plan viewer set the tool apart from basic query runners. These are complex features requiring XML parsing and graph rendering—appropriate for later phase once core is stable.

**Delivers:** Visual table designer (CREATE/ALTER via GUI), execution plan viewer (XML plan parsing, visual flowchart, missing index detection), database diagram visualization.

**Avoids:** Pitfall 11 (no execution plan visibility)

---

### Phase Ordering Rationale

1. **Backend before frontend** — Proxy architecture is prerequisite; no live queries without it
2. **Query execution before UI polish** — Core workflow must work before adding tabs/keyboard shortcuts
3. **Connection management parallel to or after Phase 1** — Depends on proxy, enables Object Explorer
4. **Polish after core features** — Shortcuts and theming matter but don't block basic functionality
5. **Differentiators last** — Visual tools are complex; ship core first, validate, then invest

**Grouping logic:** Phases 1-2 form foundation (proxy + query execution). Phases 3-4 add productivity (connections + tabs). Phase 5 adds professional polish. Phase 6 adds competitive differentiation.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Backend Proxy):** Credential storage encryption approach—needs security review; Azure SQL Entra MFA implementation specifics
- **Phase 6 (Differentiators):** Execution plan XML schema—complex parsing; visual diagram rendering libraries (if needed)

Phases with standard patterns (skip research-phase):
- **Phase 2 (Query Execution):** WebSocket streaming is well-documented (Supabase, PlanetScale patterns)
- **Phase 4 (Tab Workspace):** Autosave/localStorage patterns are standard webdev

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Based on official tedious/mssql documentation, Azure Data Studio architecture (retired but still reference), VS Code MSSQL extension source |
| Features | MEDIUM | Microsoft documentation for SSMS/ADS, but Azure Data Studio is retired (Feb 2026)—community sentiment from archived discussions only |
| Architecture | MEDIUM | Azure Data Studio reference (archived), mssql npm docs, web-based database tool patterns (Supabase, PlanetScale). MSSQL extension for VS Code source would increase confidence |
| Pitfalls | MEDIUM | Based on existing codebase concerns (CONCERNS.md), architecture analysis, general web security patterns. OWASP validation recommended |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Azure SQL Entra MFA flow:** Detailed authentication flow not fully validated—critical for Azure SQL users, needs implementation spike
- **Real-world connection pool behavior under load:** mssql pooling documented but not stress-tested in this context
- **Monaco Editor T-SQL language server:** Whether to build custom language server or use existing vscode-mssql language server protocol implementation
- **Existing codebase migration:** Vanilla JS to React migration path (if pursued) not detailed in current research

## Sources

### Primary (HIGH confidence)
- [tedious GitHub](https://github.com/tediousjs/tedious) — Node.js TDS implementation, 1.6k stars, Microsoft-supported
- [mssql npm](https://www.npmjs.com/package/mssql) — Connection pooling API, documented patterns
- [SSMS 22 release notes (Microsoft Learn)](https://learn.microsoft.com/en-us/sql/ssms/release-notes-22) — Current official documentation

### Secondary (MEDIUM confidence)
- [Azure Data Studio architecture (archived)](https://learn.microsoft.com/en-us/previous-versions/azure-data-studio/what-is-azure-data-studio) — Retired product but architecture still relevant reference
- [vscode-mssql extension](https://github.com/microsoft/vscode-mssql) — Reference implementation for SQL Server VS Code extension
- [SQL Tools Service](https://github.com/microsoft/sqltoolsservice) — .NET backend used by Azure Data Studio

### Tertiary (LOW confidence)
- User frustration sources — community discussions archived, not current live sentiment
- dbForge/Toad marketing materials — low confidence, primarily promotional content

---
*Research completed: 2026-04-30*
*Ready for roadmap: yes*

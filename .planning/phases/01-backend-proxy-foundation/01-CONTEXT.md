# Phase 1: Backend Proxy Foundation - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend proxy enables secure, authenticated SQL Server connections from browser. Phase 1 delivers:
- Connection dialog with auth type selection (SQL, Windows integrated, Entra ID)
- Backend proxy that holds credentials and executes queries on behalf of browser
- WebSocket-based query streaming with cancel support
- Encrypted credential storage (user-derived key)
- Connection test before save
- Save/disconnect/disconnect workflow

**Does NOT include:** Query execution UI (Phase 2), Object Explorer (Phase 3), UI redesign (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Backend Framework
- **D-01:** Backend proxy uses **Hono** framework (edge-deployable, minimal, fast)

### API Protocol
- **D-02:** Query execution via **WebSocket** (real-time streaming, row-by-row results, cancel support)
- **D-03:** Connection CRUD via **REST** (create/save/test/disconnect connections)

### Credential Storage
- **D-04:** Connection credentials encrypted with **user-derived key** (user provides master password on first use; key derived via PBKDF2/argon2; never stored)
- **D-05:** Encrypted credentials stored server-side as encrypted blobs (file or SQLite)

### Frontend Stack
- **D-06:** **Stay with vanilla JS** — no React migration in Phase 1
- **D-07:** Add `apiClient.js` module for frontend-backend communication (fetch for REST, WebSocket for queries)
- **D-08:** Existing modules (sandbox.js, practice.js) remain unchanged for sql.js practice/sandbox modes

### Connection Dialog UX
- **D-09:** **Unified dialog** — single connection dialog with auth type dropdown
- **D-10:** Auth type selector shows relevant fields: SQL auth (server, username, password), Windows (server only, uses NTLM/Kerberos), Entra ID (server, tenant, client app)

### Authentication
- **D-11:** **Full Entra ID support** — device code flow, MFA handling, token refresh (not just basic username/password)
- **D-12:** Windows integrated auth via backend NTLM/Kerberos (browser sends nothing — backend handles SPNEGO)

### Query Validation
- **D-13:** Backend proxy validates and parameterizes all queries (PROF-02) — prevents SQL injection
- **D-14:** Credentials never stored in browser, never logged, never exposed to client

### the agent's Discretion
- Connection pool sizing (can tune per deployment)
- Specific WebSocket message format (columns/rows/done/error envelope structure)
- Backend directory structure and file organization
- How Windows auth integrates with Hono middleware

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture Research
- `.planning/research/ARCHITECTURE.md` — Backend proxy patterns, Azure Data Studio reference, credential storage patterns
- `.planning/research/STACK.md` — Stack research and analysis

### Existing Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture (sql.js, CodeMirror, vanilla JS modules)
- `.planning/codebase/STACK.md` — Current technology stack (vanilla JS, sql.js, CodeMirror 5)
- `.planning/codebase/STRUCTURE.md` — Current module structure and relationships
- `.planning/codebase/CONVENTIONS.md` — Coding conventions (2-space indent, single quotes, no JSDoc)

### Project Requirements
- `.planning/ROADMAP.md` §Phase 1 — Phase 1 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §Connection Management — CONN-01 through CONN-08, PROF-01, PROF-02

### Project Context
- `.planning/PROJECT.md` — Browser-only constraint, backend proxy requirement, professional audience
- `.planning/STATE.md` — Current position, accumulated architecture notes

[No external specs — requirements fully captured in decisions above]

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/runtime.js` — `cursor` object pattern for session state; extend with `cursor.connectionId`, `cursor.connected`
- `scripts/db.js` — `activeDb()` abstraction pattern; can add `activeApi()` for proxy-backed queries
- `scripts/ui.js` — Render functions for results/feedback; connection dialog renders here
- `scripts/main.js` — Event handler wiring pattern; `wireUI()` style for dialog open/close

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setXxxHooks({ callback })` to avoid circular imports
- Debounced persistence: `debounce(fn, 400ms)` pattern for saves
- Template literals for HTML generation in render functions

### Integration Points
- `index.html` — Add connection dialog HTML; add "Connected" mode indicator in topbar
- `scripts/main.js` — Add mode: `live` alongside `practice`/`sandbox`/`mssql`; wire connection dialog open/close
- `scripts/state.js` — localStorage for local prefs only (connection list is backend-only)
- `scripts/editor.js` — CodeMirror remains; when `live` mode active, `runQuery` calls WebSocket instead of sql.js

### Backend Structure (new)
```
backend/
  server.js          — Hono app entry, WebSocket upgrade handler
  routes/
    connections.js   — REST CRUD for saved connections
    query.ws.js      — WebSocket query execution
  services/
    sqlServer.js     — mssql connection pool management
    crypto.js        — User-derived key encryption/decryption
    auth/
      windows.js     — NTLM/Kerberos SPNEGO flow
      entra.js       — Entra ID device code + token management
  middleware/
    session.js       — Session validation
    logging.js       — Request logging (no credentials)
```

</code_context>

<specifics>
## Specific Ideas

- WebSocket message envelope: `{ type: 'columns' | 'rows' | 'done' | 'error', ...payload }`
- Connection pool per user per server (max 5 concurrent connections per user per server)
- Azure SQL requires `encrypt: true` and `trustServerCertificate: false` in mssql config
- User-derived key uses PBKDF2 with high iteration count (>100k) or argon2id

</specifics>

<deferred>
## Deferred Ideas

### React Migration
- User prefers staying vanilla JS for now. React migration remains an option for Phase 2+ if UI complexity demands it.

### Azure AD MFA UI
- Full Entra ID support in D-11 includes MFA, but specific MFA challenge UI (visual vs redirect) deferred to Phase 2 if needed.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-backend-proxy-foundation*
*Context gathered: 2026-04-30*
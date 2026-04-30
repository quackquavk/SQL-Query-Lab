# Phase 2: Connected Query Execution - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

User can write, execute, and export results from live SQL Server queries. Phase 2 delivers:
- T-SQL code editor with syntax highlighting and autocomplete
- Live query execution via WebSocket (Phase 1 backend)
- Row-by-row result streaming with sortable, paginated grid
- CSV and JSON export per result set
- Execution time and row count display
- Decoded SQL Server error messages
- Query timeout with cancel support

**Does NOT include:** Object Explorer (Phase 3), UI redesign/theming (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Code Editor
- **D-01:** Stay on **CodeMirror 5** — no migration to Monaco or CodeMirror 6

### IntelliSense
- **D-02:** IntelliSense provides **static T-SQL keywords only** — no schema-aware completion (table/column names deferred to Phase 3 Object Explorer integration)

### Results Display
- **D-03:** Results displayed in **custom HTML table** with CSS — no AG Grid or third-party library
- **D-04:** **Pagination** with 100-500 rows per page (configurable)
- **D-05:** **Virtual scrolling** for 100K+ row result sets via custom implementation

### Query Execution
- **D-06:** **Row-by-row WebSocket streaming** — backend streams rows as they arrive, UI updates incrementally (not batch)
- **D-07:** Query **timeout default: 30 seconds**, configurable per-query

### Export
- **D-08:** **Per result set** CSV and JSON export buttons (not global toolbar or context menu)

### Feedback
- **D-09:** **Execution time shown at end of execution only** (no live timer during execution)
- **D-10:** Row count shown for SELECT/INSERT/UPDATE/DELETE after execution
- **D-11:** **Backend decodes SQL Server errors** to human-readable messages before sending to client

### the agent's Discretion
- Pagination size default (100 vs 200 vs 500)
- Virtual scrolling implementation approach (Intersection Observer vs custom scroll handler)
- Specific WebSocket message envelope structure for row streaming (already designed in Phase 1)
- Results grid column width behavior (fixed vs auto-fit)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture Research
- `.planning/research/ARCHITECTURE.md` — Backend proxy patterns, streaming approaches
- `.planning/research/STACK.md` — Stack research and analysis

### Existing Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture (sql.js, CodeMirror, vanilla JS modules)
- `.planning/codebase/STACK.md` — Current technology stack (vanilla JS, sql.js, CodeMirror 5)
- `.planning/codebase/STRUCTURE.md` — Current module structure and relationships
- `.planning/codebase/CONVENTIONS.md` — Coding conventions (2-space indent, single quotes, no JSDoc)

### Project Requirements
- `.planning/ROADMAP.md` §Phase 2 — Phase 2 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §Query Editor — EDIT-01 through EDIT-04
- `.planning/REQUIREMENTS.md` §Query Execution — EXEC-01 through EXEC-08
- `.planning/REQUIREMENTS.md` §Professional Features — PROF-03, PROF-04

### Phase 1 Context
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` — Backend proxy decisions, WebSocket protocol, Hono framework
- Phase 1 established: WebSocket for query streaming, REST for connection CRUD, Hono backend

### Project Context
- `.planning/PROJECT.md` — Browser-only constraint, backend proxy requirement, professional audience
- `.planning/STATE.md` — Current position, accumulated architecture notes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/editor.js` — CodeMirror initialization pattern; `initEditor()` factory accepts `runQuery` callback; existing `extraKeys` and autocomplete wiring
- `scripts/ui.js` — `renderResults()` pattern; `showFeedback()` for error/success messages; render functions use template literals
- `scripts/runtime.js` — `cursor` object for session state; `setEditor()` pattern; `runtime.cursor.lastUserResult`, `runtime.cursor.lastExpectedResult`
- `scripts/state.js` — `persist()` with debounce pattern; localStorage for preferences
- `scripts/format.js` — `formatEditorSql()` for SQL prettify; `splitSqlStatements()` for multi-statement scripts
- `scripts/utils.js` — `escapeHtml()`, `normalizeCell()` utilities

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setDbHooks({ showFeedback, switchTab, renderSchema })` to avoid circular imports
- Debounced persistence: `debounce(fn, 400ms)` for saves
- Template literals for HTML generation in render functions
- Custom events on `runtime` singleton for cross-module communication
- `activeDb()` abstraction pattern in `db.js` — can add `activeResults()` for live vs practice mode

### Integration Points
- `index.html` — Results panel area; editor area; status bar for execution time/row count
- `scripts/main.js` — `runQuery()` handler currently calls `runSandboxQuery()` or `runPracticeQuery()`; add `runLiveQuery()` path
- `scripts/main.js` — `setMode('live')` alongside existing modes; wire WebSocket reconnection on mode switch
- `styles/results.css` — Existing results panel styles; extend for pagination controls, export buttons

### Backend Structure (Phase 1 established)
```
backend/
  server.js          — Hono app entry, WebSocket upgrade handler
  routes/
    connections.js   — REST CRUD for saved connections
    query.ws.js      — WebSocket query execution
  services/
    sqlServer.js     — mssql connection pool management
    crypto.js        — User-derived key encryption/decryption
```

Phase 2 adds:
- `query.ws.js` streams rows via WebSocket envelope: `{ type: 'columns' | 'rows' | 'done' | 'error', ...payload }`

</code_context>

<specifics>
## Specific Ideas

- Results grid column headers: click to sort (asc/desc/none cycle)
- Export buttons appear below result grid header row
- Error display: same feedback panel as sandbox/practice, with red styling
- Timeout config: inline input next to Run button (reuses existing control point)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-connected-query-execution*
*Context gathered: 2026-04-30*
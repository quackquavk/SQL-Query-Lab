# Phase 3: Object Explorer & Workspace - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

User can navigate SQL Server server hierarchy and manage multiple query tabs. Phase 3 delivers:
- Object explorer tree view (databases, tables, views, procedures, functions)
- Multi-tab query workspace with independent editor state per tab
- Snippet management with categories
- Connection groups/favorites displayed in object explorer tree
- Tab autosave, session restore, dirty indicators, drag-to-reorder
- Schema-aware IntelliSense (table/column completions based on selected database)

**Does NOT include:** Visual tools (table designer, ER diagrams), execution plan viewer (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Layout & Navigation
- **D-01:** Object explorer panel lives in **left sidebar** — below existing sidebar tabs (History, Resources)
- **D-02:** Single tree for both connection groups and server objects — no separate dropdown for connections

### Schema IntelliSense
- **D-03:** Schema-aware completions trigger **after connected** — completions match selected database schema
- **D-04:** IntelliSense does NOT suggest objects from other databases on the same server
- **D-05:** Tree node expansion fetches children lazily (OBJE-02) — columns fetched on table node expand (OBJE-03)

### Tab Workspace UX
- **D-06:** Tab bar positioned at **top of editor area** (standard IDE/VS Code pattern)
- **D-07:** Results panel below tabs — each tab has its own results
- **D-08:** Tab content autosaves to localStorage (debounced, 400ms) per TAB-03
- **D-09:** Session restore on reload — open tabs restored with content and connection context per TAB-04
- **D-10:** Dirty indicator: asterisk (*) in tab title when unsaved per TAB-05
- **D-11:** Close tab shows warning if dirty (unsaved changes) per TAB-06
- **D-12:** Tab drag-to-reorder via native HTML5 drag-and-drop per TAB-07

### Snippet Management
- **D-13:** Snippets live in **right panel tab** (alongside History, Resources) — no modal
- **D-14:** Snippet categories: user-defined, expandable/collapsible
- **D-15:** Built-in starter snippets (SELECT TOP 100, INSERT, UPDATE, DELETE) included per SNIP-05

### Connection Organization
- **D-16:** Connection groups/favorites displayed in object explorer tree (CONN-06)
- **D-17:** Users can rename, reorder, delete connection groups
- **D-18:** "Favorites" star or pin for frequently used connections

### Object Explorer Behavior
- **D-19:** Right-click context menu on nodes for actions per OBJE-06
- **D-20:** Refresh button at tree root and per-node
- **D-21:** Stored procedure definition viewable (OBJE-04) — click to open in new tab

### Query History
- **D-22:** Query history persisted across sessions (PROF-05) — stored in localStorage

### Agent's Discretion
- Tree node expand animation (simple vs elaborate)
- Specific context menu actions per node type
- Tab close button placement (on tab vs hover)
- Snippet insert behavior (replace selection vs at cursor)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Browser-only constraint, VS Code-inspired UI, professional audience
- `.planning/REQUIREMENTS.md` §Object Explorer — OBJE-01 through OBJE-06
- `.planning/REQUIREMENTS.md` §Multi-Tab Workspace — TAB-01 through TAB-07
- `.planning/REQUIREMENTS.md` §Snippets — SNIP-01 through SNIP-05
- `.planning/REQUIREMENTS.md` §Professional Features — PROF-05

### Phase Context
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` — Backend decisions, Hono, WebSocket protocol
- `.planning/phases/02-connected-query-execution/02-CONTEXT.md` — CodeMirror 5, static T-SQL IntelliSense, custom HTML results grid

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture
- `.planning/codebase/STRUCTURE.md` — Current module structure and relationships
- `.planning/codebase/CONVENTIONS.md` — Coding conventions (2-space indent, single quotes, ES modules)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/ui.js` — `renderResults()` pattern; sidebar panel rendering; can add tree view renderer
- `scripts/runtime.js` — `cursor` object holds session state; extend for `cursor.openTabs`, `cursor.activeTabId`
- `scripts/sandbox.js` — `setMode()` pattern; mode-specific UI switching via body classes
- `scripts/state.js` — `persist()` with debounce; extend for tab state persistence
- `scripts/editor.js` — CodeMirror initialization; existing `sqlHint` for keywords; can extend for schema completions
- `styles/right-panel.css` — Existing left sidebar styles; extend for tree component

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setXxxHooks({ callback })` to avoid circular imports
- Debounced persistence: `debounce(fn, 400ms)` pattern
- Template literals for HTML generation in render functions
- `setMode()` toggles body classes for mode-specific styling

### Integration Points
- `index.html` — Three-column layout already has left/center/right; add object explorer to left sidebar below existing tabs
- `scripts/main.js` — Wire new tab management handlers; extend runQuery to use active tab's SQL
- `scripts/editor.js` — Extend `sqlHint` with schema-aware completions when `runtime.cursor.activeTab?.database` is set
- `scripts/apiClient.js` — Add `fetchSchema(database)` endpoint for object explorer

### Backend Structure (Phase 1 established)
- `GET /api/connections` — list saved connections (with groups)
- `GET /api/schema/:database` — fetch tables/views/procedures for a database (for object explorer)
- `GET /api/schema/:database/:table/columns` — fetch column info for table expand

</code_context>

<specifics>
## Specific Ideas

- Object explorer tree: expand database → shows Tables, Views, Stored Procedures, Functions folders
- Tab context menu: "Close", "Close Others", "Close All", "Duplicate Tab"
- Snippet insert: Ctrl+Space or click to insert at cursor position in active editor
- Schema IntelliSense trigger: after typing table name prefix or JOIN ON, suggest columns

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-object-explorer-workspace*
*Context gathered: 2026-04-30*
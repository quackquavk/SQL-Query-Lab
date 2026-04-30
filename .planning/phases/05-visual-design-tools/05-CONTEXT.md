# Phase 5: Visual Design Tools - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can visually explore database schemas, design tables, and analyze query execution plans. Phase 5 delivers:
- Interactive ER diagram showing tables, columns, data types, PK/FK/references with pan/zoom
- Visual table designer (CREATE/ALTER tables via GUI, generates DDL)
- Execution plan viewer (visual flowchart from XML Showplan, operator details, row counts, costs)
- Stored procedure editor with T-SQL syntax checking, parameter extraction, GO batch separator support

**Does NOT include:** Query Tools (Phase 6), Administration (Phase 7)

</domain>

<decisions>
## Implementation Decisions

### ER Diagram Rendering
- **D-01:** **D3.js + dagre** for ER diagram rendering — dagre handles auto-layout, D3 handles SVG rendering
- **D-02:** SVG-based rendering (not Canvas) — leverages existing CSS styling patterns in codebase

### ER Layout
- **D-03:** **Hierarchical top-down layout** — tables auto-arranged top-to-bottom, primary/foreign key relationships flow downward
- **D-04:** User can pan and zoom the diagram; diagram is not manually positionable

### ER Interactions
- **D-05:** **Click to select + double-click to edit** — click selects table and shows its columns panel, double-click opens table designer
- **D-06:** Selected table shows columns panel in right sidebar with: column name, data type, constraints (PK, FK, nullable, default)

### Execution Plan Rendering
- **D-07:** **D3.js (same stack as ER)** — parse XML Showplan into operator tree, use dagre for layout, render as SVG
- **D-08:** Display per-operator: operator name, row counts (estimated vs actual), cost breakdown (% of total)
- **D-09:** Color-coded by cost severity (green → yellow → red gradient)

### Table Designer
- **D-10:** **Live DDL preview panel** — as user defines columns/constraints/indexes, CREATE/ALTER TABLE statement generates in real-time
- **D-11:** GUI form for: column name, data type dropdown, constraints (PK, FK, UNIQUE, CHECK, DEFAULT), indexes
- **D-12:** Execute button runs the generated DDL against the live database

### Stored Procedure Editor
- **D-13:** **Separate panel in right sidebar** — SP editor lives in its own tab (like Snippets panel from Phase 3)
- **D-14:** Supports T-SQL syntax checking via **backend validation endpoint** — user types SP, backend validates using mssql parser
- **D-15:** Parameter extraction displayed above editor: list of @params with types
- **D-16:** GO batch separator supported — editor splits on GO and sends batches sequentially

### Visual Integration
- **D-17:** ER diagram panel lives in **left sidebar** (replaces or augments existing schema viewer from Phase 3)
- **D-18:** Table designer and SP editor open as **modal overlays** from the ER diagram context

### the agent's Discretion
- Exact node styling (box size, colors, fonts, connection line styles)
- Panel transition animations (fade vs slide)
- Error display format in SP editor (inline vs tooltip vs panel)
- GO separator parsing edge cases (GO inside strings/comments)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/ROADMAP.md` §Phase 5 — Phase 5 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §Visual Design — VISUAL-03, VISUAL-04, VISUAL-05
- `.planning/REQUIREMENTS.md` §Code/Stored Procedures — CODE-01

### Phase Context
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` — Backend decisions, Hono, WebSocket protocol
- `.planning/phases/02-connected-query-execution/02-CONTEXT.md` — CodeMirror 5, results grid, streaming
- `.planning/phases/03-object-explorer-workspace/03-CONTEXT.md` — Tab workspace, object explorer, snippet panel
- `.planning/phases/04-professional-polish/04-CONTEXT.md` — Theme, keyboard shortcuts, search bar

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture
- `.planning/codebase/STACK.md` — Current technology stack
- `.planning/codebase/CONVENTIONS.md` — 2-space indent, single quotes, ES modules, hook-injection pattern

### Backend Structure
- `backend/routes/query.ws.js` — WebSocket query streaming (for execution plan retrieval)
- `backend/services/sqlServer.js` — mssql connection management

[No external specs — requirements fully captured in decisions above]

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `scripts/ui.js` — `renderResults()` pattern; can extend for ER diagram panel and table designer form
- `scripts/runtime.js` — `cursor` object; extend for `cursor.selectedErNode`, `cursor.selectedSp`
- `scripts/format.js` — `formatSql()` for DDL prettify in live preview
- `styles/right-panel.css` — Existing sidebar styles; extend for ER diagram and SP editor panels
- `styles/modal.css` — Existing modal styles; table designer can use same pattern

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setXxxHooks({ callback })`
- Debounced persistence: `debounce(fn, 400ms)`
- Template literals for HTML generation
- D3.js already flagged as stack choice in STATE.md for ER diagrams and execution plan rendering

### Integration Points
- `index.html` — Add ER diagram panel to left sidebar; add modal for table designer; add SP editor tab in right panel
- `scripts/main.js` — Wire ER diagram interactions; wire table designer open/close; wire SP editor open/save
- `scripts/apiClient.js` — Add `fetchErSchema(database)` endpoint; add `validateStoredProcedure(spText)` endpoint
- `scripts/editor.js` — CodeMirror remains; SP editor uses same instance in modal context
- `backend/` — Add execution plan fetch endpoint; add T-SQL validation endpoint for SP editor

### New Dependencies (from STATE.md)
- **D3.js** — ER diagram and execution plan rendering
- **dagre** — Automatic graph layout for ER diagrams and execution plans
- **node-sql-parser** — T-SQL parsing for table designer DDL generation and SP syntax checking

</codebase_context>

<specifics>
## Specific Ideas

- ER diagram nodes styled to match VS Code's database extension aesthetic — clean, professional
- Table designer form: grid of rows (one per column) with dropdown cells for type/constraints
- SP editor has "Execute" button that runs CREATE/ALTER PROCEDURE against live database
- GO separator UI: visual divider line in editor between batches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-visual-design-tools*
*Context gathered: 2026-04-30*

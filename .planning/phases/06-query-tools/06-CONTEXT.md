# Phase 6: Query Tools - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can build queries visually, receive optimization guidance, and visualize results as charts. Phase 6 delivers:
- Visual query builder (drag-and-drop canvas, auto JOIN detection from FK relationships)
- Query result charting (bar, line, pie charts in results panel)
- Query optimization suggestions (inline highlights in editor with index/addition recommendations)
- Missing index detection (inline in execution plan view)

**Does NOT include:** Administration tools (Phase 7)

</domain>

<decisions>
## Implementation Decisions

### Visual Query Builder
- **D-01:** **Canvas-based UI** — drag tables/columns onto visual canvas with dagre auto-layout
- **D-02:** Existing ER diagram panel (Phase 5) can be repurposed/extended for query builder canvas
- **D-03:** **Automatic JOIN detection** — foreign key relationships auto-detected and rendered as connecting lines on canvas
- **D-04:** User drags tables from object explorer onto canvas; drags columns onto SELECT/JOIN/WHERE zones

### Charting
- **D-05:** **D3.js** for chart rendering — same stack as Phase 5 ER diagrams and execution plans
- **D-06:** **Chart placement: below results grid** — chart renders below/beside results table in same panel, not full takeover
- **D-07:** Supported chart types: bar, line, pie — user selects via toolbar above chart area
- **D-08:** Chart toolbar: chart type selector, X-axis column dropdown, Y-axis column dropdown, "Chart" button to render

### Query Optimization
- **D-09:** **Inline editor highlights** — suggestions appear as underlined highlights directly in the editor, similar to linting
- **D-10:** Clicking a highlight opens a tooltip/popover with the suggestion text and explanation
- **D-11:** Suggestions cover: index additions, query restructuring, operator alternatives, syntax improvements
- **D-12:** Backend endpoint provides optimization analysis from actual execution plan data

### Missing Index Detection
- **D-13:** **Inline in execution plan** — missing index info shown as clickable callouts/badges on relevant operators in the execution plan view (Phase 5)
- **D-14:** Clicking a missing index callout shows estimated impact and recommended CREATE INDEX statement
- **D-15:** Leverages execution plan XML parsing already built for Phase 5 execution plan viewer

### Integration Points
- **D-16:** Query builder canvas extends existing ER diagram module (`scripts/erDiagram.js` Phase 5)
- **D-17:** Charting extends existing results panel (`scripts/ui.js`, `styles/results.css`)
- **D-18:** Optimization inline highlights leverage same CodeMirror decoration approach as Phase 4 search bar
- **D-19:** Missing index detection builds on `scripts/execPlanViewer.js` from Phase 5

### Agent's Discretion
- Exact highlight styling (color, underline style, hover behavior)
- Chart dimensions and responsive behavior
- Popover/tooltip positioning and animation
- How to handle multi-result-set queries for charting (chart first result set vs dropdown)
- JOIN line routing and styling on query builder canvas

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/ROADMAP.md` §Phase 6 — Phase 6 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §Query & Analysis — QUERY-03, QUERY-04, QUERY-05, QUERY-06

### Phase Context
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` — Backend decisions, Hono, WebSocket protocol
- `.planning/phases/02-connected-query-execution/02-CONTEXT.md` — CodeMirror 5, custom HTML results grid
- `.planning/phases/03-object-explorer-workspace/03-CONTEXT.md` — Tab workspace, object explorer, schema-aware IntelliSense
- `.planning/phases/04-professional-polish/04-CONTEXT.md` — Theme, keyboard shortcuts, CodeMirror decoration pattern
- `.planning/phases/05-visual-design-tools/05-CONTEXT.md` — ER diagram (dagre/D3), execution plan viewer, table designer, SP editor

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture
- `.planning/codebase/STACK.md` — Current technology stack
- `.planning/codebase/CONVENTIONS.md` — 2-space indent, single quotes, ES modules, hook-injection pattern

### Existing Code (Phase 5)
- `scripts/erDiagram.js` — D3 + dagre rendering, extends for query builder canvas
- `scripts/execPlanViewer.js` — Execution plan XML parsing and rendering, missing index extraction
- `styles/er-diagram.css` — ER diagram styling, extends for query builder
- `styles/exec-plan.css` — Execution plan styling, missing index callout styling
- `backend/routes/query.ws.js` — WebSocket query streaming (for execution plan retrieval)

### Backend (Phase 1 established)
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` §Backend Structure — Hono, WebSocket, REST endpoints

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `scripts/erDiagram.js` — D3 + dagre pattern; query builder canvas extends same module with different node types (query vs schema)
- `scripts/execPlanViewer.js` — XML Showplan parsing; missing index detection builds on this
- `scripts/editor.js` — CodeMirror instance; can add inline decorations for optimization highlights
- `scripts/ui.js` — `renderResults()` pattern; can extend for chart rendering below results
- `scripts/runtime.js` — `cursor` object; extend for `cursor.queryBuilderState`, `cursor.activeChartConfig`
- `styles/results.css` — Existing results panel styles; chart container extends these

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setXxxHooks({ callback })` to avoid circular imports
- Debounced persistence: `debounce(fn, 400ms)` pattern
- Template literals for HTML generation in render functions
- D3.js + dagre already chosen for ER diagrams (Phase 5)

### Integration Points
- `index.html` — Add query builder canvas panel; chart container in results area
- `scripts/main.js` — Wire query builder open/close; wire chart type selection; wire optimization highlight clicks
- `scripts/editor.js` — Add inline decoration for optimization highlights; extend hint plugin for query builder
- `scripts/apiClient.js` — Add `fetchOptimizationSuggestions(sql)` endpoint; add `fetchMissingIndexes(planXml)` endpoint
- `backend/` — Add optimization analysis endpoint; extend execution plan endpoint for missing index extraction

### New Dependencies (from STATE.md)
- **Chart.js** — Not selected; using D3.js for all visualization (unified stack)

</codebase_context>

<specifics>
## Specific Ideas

- Query builder canvas: tables shown as boxes with column list, relationships as directed arrows
- JOIN lines on canvas styled differently than ER diagram (dashed for query vs solid for schema)
- Chart toolbar appears above chart area: [Bar▾] [X: column▾] [Y: column▾] [Render]
- Optimization highlights: wavy amber underline, click opens popover with suggestion
- Missing index callout: small badge on operator node, clicking shows CREATE INDEX in popover

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-query-tools*
*Context gathered: 2026-04-30*
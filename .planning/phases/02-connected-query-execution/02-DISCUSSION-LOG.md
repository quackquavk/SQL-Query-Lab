# Phase 2: Connected Query Execution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 02-connected-query-execution
**Areas discussed:** Code Editor, IntelliSense, Results Grid, Row Streaming, Export, Execution Time Display, Error Display

---

## Code Editor

| Option | Description | Selected |
|--------|-------------|----------|
| Monaco Editor | Better T-SQL support, industry standard for SQL editing | |
| CodeMirror 6 | Keep existing CodeMirror 5, upgrade to CodeMirror 6 | |
| Stay on CodeMirror 5 | Upgrade CodeMirror 5 to latest 5.x | ✓ |

**User's choice:** Stay on CodeMirror 5
**Notes:** No migration to Monaco or CodeMirror 6

---

## IntelliSense

| Option | Description | Selected |
|--------|-------------|----------|
| Static T-SQL keywords only | User types → static SQL keywords + basic functions appear (simple) | ✓ |
| Schema-aware via Object Explorer API | Static keywords + query Object Explorer API for table/column names | |
| Full T-SQL dialect definition | Custom T-SQL language definition + schema data | |

**User's choice:** Static T-SQL keywords only
**Notes:** No schema-aware completion; table/column names deferred to Phase 3 Object Explorer integration

---

## Results Grid

| Option | Description | Selected |
|--------|-------------|----------|
| Custom HTML table | Custom HTML table with CSS, sortable via JS, handles 100-500 rows per page | ✓ |
| AG Grid Community | Use AG Grid Community for sortable/virtual scroll grid | |
| Other grid library | LightGrid, DataTables, or similar | |

**User's choice:** Custom HTML table
**Notes:** No third-party grid library; virtual scrolling via custom implementation

---

## Row Streaming

| Option | Description | Selected |
|--------|-------------|----------|
| Yes - WebSocket row streaming | Backend streams rows as they arrive, UI updates incrementally | ✓ |
| No - batch display | Wait for full result set, then display | |

**User's choice:** Yes - WebSocket row streaming
**Notes:** Row-by-row streaming via Phase 1 WebSocket protocol

---

## Export

| Option | Description | Selected |
|--------|-------------|----------|
| Per result set buttons | Each result set has its own CSV and JSON download buttons | ✓ |
| Top toolbar buttons | Global toolbar export for the active result set | |
| Context menu | Right-click context menu on result grid | |

**User's choice:** Per result set buttons
**Notes:** Export buttons below result grid header row

---

## Execution Time Display

| Option | Description | Selected |
|--------|-------------|----------|
| End of execution only | Show duration after query completes (simple) | ✓ |
| Live timer + final | Live timer updating during execution + final duration | |

**User's choice:** End of execution only
**Notes:** No live timer during execution

---

## Error Display

| Option | Description | Selected |
|--------|-------------|----------|
| Backend decodes | Backend returns human-readable messages (not TDS codes) | ✓ |
| Structured error object | Backend returns structured { code, number, state, message } | |

**User's choice:** Backend decodes
**Notes:** Backend converts TDS codes to human-readable before sending to client

---

## the agent's Discretion

- Pagination size default (100 vs 200 vs 500)
- Virtual scrolling implementation approach (Intersection Observer vs custom scroll handler)
- Specific WebSocket message envelope structure for row streaming (already designed in Phase 1)
- Results grid column width behavior (fixed vs auto-fit)

## Deferred Ideas

None — discussion stayed within phase scope.
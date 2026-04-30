# Phase 6: Query Tools - Research

**Phase:** 06-query-tools
**Date:** 2026-04-30
**Status:** Complete

---

## Domain Analysis

### Query Builder Canvas

**Architecture:** Extends `scripts/erDiagram.js` Phase 5 pattern with D3+dagre. The ER diagram shows schema structure; query builder shows user-selected tables/columns for query composition.

**Key technical decisions:**
- Canvas node types differ from ER diagram: query builder nodes represent selected tables with checkboxes for columns
- Dagre layout reused (TB rankdir) for consistent visual language
- JOIN lines are dashed (vs solid for ER diagram FK lines) per D-06
- User drags from object explorer onto canvas; drags columns onto SELECT/JOIN/WHERE zones

**FK Auto-Detection:** The schema endpoint already returns relationships. When user adds two tables, the query builder detects existing FK relationships between them and renders connecting lines. Users can manually add/remove JOINs.

### Charting

**D3.js Stack:** Per D-05, using D3.js (same as ER diagram and execution plan) — NOT Chart.js. This is a deliberate stack decision for consistency.

**Chart Types:** Bar, line, pie per D-07. Implemented as D3 SVG renders.

**Placement:** Below results grid in same results panel per D-06 — not a separate panel or modal.

**Toolbar:** Chart type selector, X-axis dropdown, Y-axis dropdown, "Render" button per D-08.

**Data Flow:** Results grid data → chart data passed to D3 render function → SVG chart below grid.

### Query Optimization

**Inline Editor Highlights:** Leverages CodeMirror decoration API (same pattern as Phase 4 search bar highlights). Per D-09, wavy amber underline.

**Suggestion Types:** Index additions, query restructuring, operator alternatives, syntax improvements per D-11.

**Backend Requirement:** Per D-12, optimization analysis requires actual execution plan data from backend. This means the optimization suggestions endpoint must call SQL Server's optimizer.

**Implementation Approach:** 
1. Backend endpoint receives SQL text
2. Executes with `SET SHOWPLAN_XML ON` (like 05-visual-design-tools)
3. Parses XML for recommendations (missing indexes, table scans, etc.)
4. Returns structured suggestions
5. Frontend decorates editor with underlines at suggestion positions

### Missing Index Detection

**Existing Infrastructure:** Phase 5 `scripts/execPlanViewer.js` already parses XML Showplan. The missing index info is embedded in the XML under `<MissingIndexGroup>` elements.

**Integration:** Per D-13, missing index callouts appear as clickable badges on relevant operators in execution plan view. This extends the existing Phase 5 exec plan viewer.

**Information to Extract:** Index columns, estimated impact, recommended CREATE INDEX statement (SQL Server provides this in XML).

---

## Technical Approach

### Vertical Slices (Preferred)

| Plan | Feature | Complexity |
|------|---------|------------|
| 06-01 | Query Builder Canvas | High |
| 06-02 | Result Charting | Medium |
| 06-03 | Query Optimization | High |
| 06-04 | Missing Index + Backend | Medium |

### Dependencies

```
Plan 06-01 (Query Builder) — Wave 1, independent
Plan 06-02 (Charting) — Wave 1, independent  
Plan 06-03 (Optimization) — Wave 2, depends on 06-04 backend
Plan 06-04 (Backend + Missing Index) — Wave 1, independent
```

### Wave Structure

**Wave 1:** Plans 01, 02, 04 (all independent)
**Wave 2:** Plan 03 (depends on 06-04 for backend endpoints)

---

## Backend Integration Points

### Existing Backend (Phase 1, 5)

From Phase 5:
- `GET /api/schema/:database` — Full schema with tables, columns, PK/FK, relationships
- `POST /api/execution-plan` — XML Showplan retrieval

### New Endpoints Needed

**Query Optimization (Plan 03, 04):**
```
POST /api/optimize
Body: { sql: string, database: string }
Returns: {
  suggestions: [
    { type: 'index'|'restructure'|'syntax',
      message: string,
      line: number,
      column: number,
      sql: string }
  ]
}
```

**Implementation:** Execute `SET SHOWPLAN_XML ON` + user SQL, parse XML for optimizer warnings and recommendations.

**Missing Index Extraction (Plan 04):**
The `POST /api/execution-plan` already retrieves XML. Extend it to also extract missing index groups:
```
Returns: {
  xml: string,
  missingIndexes: [
    { name: string,
      columns: string[],
      impact: number,
      createStatement: string }
  ]
}
```

---

## Patterns to Reuse

| Pattern | Location | Reuse For |
|---------|----------|-----------|
| D3+dagre graph layout | erDiagram.js | Query builder canvas |
| SVG pan/zoom | erDiagram.js | Query builder canvas |
| CodeMirror decorations | (Phase 4 search) | Optimization highlights |
| XML Showplan parsing | execPlanViewer.js | Missing index extraction |
| Hook-injection pattern | all modules | Query builder hooks |

---

## Potential Pitfalls

1. **Query builder state management:** Multiple tables on canvas, selected columns per table, JOIN clauses — needs careful state design
2. **Multi-result-set charting:** If query returns multiple result sets, need to pick which to chart (default: first)
3. **Optimization performance:** Parsing large execution plans could be slow; consider debouncing
4. **CodeMirror decoration conflicts:** Phase 4 search highlights and optimization highlights could conflict — need separate decoration sets

---

## Stack Verification

- D3.js v5: ✓ Already loaded (index.html)
- dagre 0.8.5: ✓ Already loaded (index.html)
- No new CDN dependencies required
- Chart.js NOT used — D3.js per stack decision (D-05 in CONTEXT)

---

## References

- `.planning/phases/05-visual-design-tools/05-CONTEXT.md` — D3+dagre pattern
- `.planning/phases/04-professional-polish/04-CONTEXT.md` — CodeMirror decoration pattern
- `.planning/codebase/STACK.md` — Technology stack
- `scripts/erDiagram.js` — D3+dagre implementation reference
- `scripts/execPlanViewer.js` — XML Showplan parsing reference

---

*Research: 06-query-tools*
*Completed: 2026-04-30*
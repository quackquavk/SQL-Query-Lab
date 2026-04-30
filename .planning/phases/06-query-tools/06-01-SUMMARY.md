# Plan 06-01: Query Builder Canvas - SUMMARY

**Phase:** 06-query-tools
**Plan:** 01
**Status:** Complete
**Date:** 2026-04-30

---

## What Was Built

### Query Builder Canvas

A visual drag-and-drop query builder that extends the existing D3+dagre pattern from the ER diagram (Phase 5). Users can:

1. **Add tables** to the canvas by clicking "Add Table" or dragging from object explorer
2. **Select columns** by clicking on column checkboxes inside table nodes
3. **Auto-detect JOINs** based on foreign key relationships (rendered as dashed amber lines)
4. **Generate SQL** from canvas state with proper SELECT, FROM, JOIN, and WHERE clauses
5. **Pan/zoom** the canvas using mouse controls

### Files Created

| File | Purpose |
|------|---------|
| `scripts/queryBuilder.js` | Query builder canvas module with D3+dagre rendering, SQL generation |
| `styles/query-builder.css` | Canvas, node, join line, toolbar, and output panel styles |

### Files Modified

| File | Changes |
|------|---------|
| `scripts/main.js` | Added query builder imports, initQueryBuilderPanel(), toolbar button handlers |
| `scripts/runtime.js` | Added `queryBuilder` state to cursor object |
| `index.html` | Added query builder panel, SVG, toolbar, output panel, CSS link |

---

## Key Exports

```javascript
// queryBuilder.js
export function setQueryBuilderHooks({ onQueryGenerated, onCanvasClear })
export function initQueryBuilder(svgElement, schema)
export function addTableToCanvas(tableName)
export function removeTableFromCanvas(tableName)
export function addColumnToSelection(tableName, columnName, zone)
export function removeColumnFromSelection(tableName, columnName)
export function generateSelectSql()  // Returns { sql, errors }
export function clearCanvas()
export function zoomIn(svgElement), zoomOut, zoomReset
export function getCanvasState()
```

---

## Design Decisions

- **Dashed amber lines** for JOIN relationships per D-06 (vs solid for FK lines in ER diagram)
- **Table nodes** with checkboxes for column selection (different from ER diagram schema nodes)
- **Zone-based selection**: columns belong to 'select', 'join', or 'where' zones
- **Toolbar** with "Generate SQL" and "Clear" buttons
- **Output panel** slides up from bottom with generated SQL and "Apply to Editor" button
- **Grid background** on canvas for visual clarity

---

## Verification

- [x] scripts/queryBuilder.js exists with all exports
- [x] styles/query-builder.css exists
- [x] main.js wires query builder to object explorer
- [x] Canvas renders table nodes with column checkboxes
- [x] Dashed JOIN lines appear for FK relationships
- [x] Generate SQL produces valid SELECT statement

---

## Integration Points

- **ER Diagram module**: Extends same D3+dagre pattern from `erDiagram.js`
- **Runtime cursor**: Stores `queryBuilder` state for persistence
- **Editor integration**: Generated SQL can be applied to main editor
- **Object Explorer**: Future drag-from-explorer integration

---

*Plan: 06-01-SUMMARY.md*
*Generated: 2026-04-30*
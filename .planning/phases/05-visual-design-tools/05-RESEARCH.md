# Phase 5: Visual Design Tools - Research

**Gathered:** 2026-04-30
**Phase:** 05-visual-design-tools
**Goal:** Users can visually explore database schemas, design tables, and analyze query execution plans

## Domain Investigation

### What This Phase Delivers

Phase 5 adds three major visual tools to the SQL Query Lab professional studio:

1. **Interactive ER Diagram** — SVG-based schema visualization with D3.js + dagre layout, showing tables/columns/types/PK/FK/references with pan/zoom
2. **Visual Table Designer** — GUI form for creating ALTERing tables via generated DDL
3. **Execution Plan Viewer** — Visual flowchart from XML Showplan with operator costs and row counts
4. **Stored Procedure Editor** — T-SQL syntax checking, parameter extraction, GO batch separator support

### Key Technology Decisions (from CONTEXT.md)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| D-01 | D3.js + dagre | ER diagram rendering, dagre handles auto-layout |
| D-02 | SVG-based | Leverages existing CSS styling patterns |
| D-07 | D3.js (same stack) | Execution plan rendering via dagre layout |
| D-10 | Live DDL preview | Real-time CREATE/ALTER statement generation |
| D-14 | Backend validation | T-SQL syntax checking via backend endpoint |

### Known Constraints

- **Browser-only** — no Node.js server component, all rendering client-side
- **Vanilla JS** — no frontend framework, custom module architecture
- **Backend required for live DB** — ER diagram fetches schema from SQL Server, not sql.js
- **mssql connection from Phase 1** — execution plan XML comes via WebSocket query
- **D3.js + dagre from CDN** — loaded as script dependencies (not npm packages)

## Technical Approach Analysis

### D3.js + dagre Integration Pattern

**dagre-d3** is the standard combination for graph layout in the browser:
- `dagre` computes the layout (hierarchical, left-to-right, top-down, etc.)
- `d3` renders the SVG from the computed positions

For ER diagrams:
```
Database schema API → Parse table/column/FK data → Build dagre graph →
Compute layout → Render as D3 SVG with zoom/pan behavior
```

For execution plans:
```
XML Showplan → Parse into operator tree (Nested set or sibling list) →
Build dagre graph → Compute layout → Render as D3 SVG
```

### XML Showplan Parsing

SQL Server returns execution plans as XML when `SET SHOWPLAN_XML ON` is used. The XML structure:

```xml
<ShowPlanXML xmlns="...">
  <BatchSequence>...</BatchSequence>
  <Statements>
    <StmtSimple StatementText="...">
      <QueryPlan DegreeOfParallelism="...">
        <RelOp NodeId="..." PhysicalOp="..." LogicalOp="..." EstimateRows="...">
          <OutputList>...</OutputList>
          <RunTimeInformation>...</RunTimeInformation>
          <Operator...>
        </RelOp>
        <!-- Nested elements for child operators -->
      </QueryPlan>
    </StmtSimple>
  </Statements>
</ShowPlanXML>
```

Key parsing points:
- Each `<RelOp>` is a node in the operator tree
- `PhysicalOp` = what SQL Server actually did (e.g., "Clustered Index Seek")
- `LogicalOp` = the logical equivalent (e.g., "Index Seek")
- `EstimateRows` / `EstimateExecution` for estimated vs actual (in `<RunTimeInformation>`)
- `TotalSubtreeCost` available at node or batch level
- Parent-child relationships via nesting (not explicit parent IDs)

### ER Diagram Data Structure

Schema data comes from SQL Server `INFORMATION_SCHEMA` queries:
- `TABLE_catalog`, `TABLE_SCHEMA`, `TABLE_NAME` for table list
- `COLUMN_NAME`, `DATA_TYPE`, `CHARACTER_MAXIMUM_LENGTH`, `IS_NULLABLE`, `COLUMN_DEFAULT` for columns
- `CONSTRAINT_NAME`, `CONSTRAINT_TYPE` for PK/FK from `TABLE_CONSTRAINTS`
- `REFERENCED_TABLE_NAME`, `REFERENCED_COLUMN_NAME` from `FOREIGN_KEY_COLUMN_USAGE`

Frontend data model:
```javascript
{
  tables: [
    {
      name: "Orders",
      schema: "dbo",
      columns: [
        { name: "OrderId", type: "int", nullable: false, isPK: true, default: null },
        { name: "CustomerId", type: "int", nullable: false, isPK: false, isFK: true, references: { table: "Customers", column: "Id" } },
        ...
      ]
    }
  ],
  relationships: [
    { from: { table: "Orders", column: "CustomerId" }, to: { table: "Customers", column: "Id" } }
  ]
}
```

### Table Designer DDL Generation

Using `node-sql-parser` (backend-only per D-14) to:
1. Parse user-defined column/constraint config
2. Generate syntactically correct CREATE TABLE or ALTER TABLE statements
3. Validate generated SQL before execution

Frontend sends config object:
```javascript
{
  tableName: "NewTable",
  columns: [
    { name: "Id", type: "int", nullable: false, isPK: true, default: null },
    { name: "Name", type: "nvarchar", length: 100, nullable: true }
  ],
  constraints: [
    { type: "CHECK", expression: "[Price] > 0" }
  ]
}
```

Backend `node-sql-parser` generates:
```sql
CREATE TABLE [dbo].[NewTable] (
  [Id] INT NOT NULL,
  [Name] NVARCHAR(100) NULL,
  CONSTRAINT [PK_NewTable] PRIMARY KEY ([Id]),
  CONSTRAINT [CK_NewTable_Check] CHECK ([Price] > 0)
)
```

### Stored Procedure Editor - GO Separator

GO is a SQL Server batch separator, not a T-SQL keyword. Editor must:
1. Split text on `\nGO\n` (case-insensitive, with optional semicolon)
2. Send batches sequentially to backend
3. Render visual dividers between batches in the editor

T-SQL validation via backend endpoint that uses `node-sql-parser` with T-SQL dialect support.

Parameter extraction via regex or AST parse:
```javascript
CREATE PROCEDURE sp_GetOrders
  @CustomerId INT,
  @Status NVARCHAR(50) = 'Active'
AS
```

Extract `@CustomerId INT` and `@Status NVARCHAR(50) = 'Active'` → display as chips above editor.

## Implementation Risks

### Risk 1: Large Schema Performance

**Problem:** 200+ table databases produce ER diagrams that are slow to render and navigate.

**Mitigation:**
- Dagre layout is O(n log n) — handle 200 tables
- SVG virtualization (only render visible nodes)
- Initial fetch loads metadata only, not column details until expand
- Progressive loading: top-level tables first, detail on expand

### Risk 2: XML Showplan Complexity

**Problem:** Complex queries produce deeply nested XML with 50+ operators.

**Mitigation:**
- Build operator tree from XML recursively
- Use dagre's rank assignment for hierarchical layout
- Cost threshold filter to hide low-cost operators
- Collapse/expand subtrees in UI

### Risk 3: node-sql-parser T-SQL Coverage

**Problem:** `node-sql-parser` may not fully support all T-SQL constructs.

**Mitigation:**
- Test with representative stored procedures from Phase 1-4
- Backend validation catches parse failures
- Graceful degradation: if parse fails, show error rather than corrupt DDL

### Risk 4: D3/dagre CDN Version Compatibility

**Problem:** dagre-d3 combo versions may conflict or have API changes.

**Mitigation:**
- Pin to specific CDN versions tested together
- dagre 0.8.x + d3 5.x is stable combination
- Test in Phase 5 development before production deploy

## Architecture Decisions

### Frontend Module Structure (new files)

```
scripts/
  erDiagram.js      — ER diagram rendering, D3 SVG management
  tableDesigner.js  — Table designer modal and DDL generation
  execPlanViewer.js — Execution plan parsing and rendering
  spEditor.js       — Stored procedure editor with GO support
```

### Backend Endpoints (new)

```
GET  /api/schema/:database          — Full schema (tables, columns, FK relationships)
GET  /api/schema/:database/:table   — Column details for table
POST /api/execution-plan            — Run query with SET SHOWPLAN_XML ON, return XML
POST /api/validate-tsql            — Validate T-SQL syntax via node-sql-parser
POST /api/execute-ddl              — Execute CREATE/ALTER TABLE statement
GET  /api/stored-procedures/:db    — List stored procedures
GET  /api/stored-procedure/:db/:name — Get SP definition
POST /api/stored-procedure/:db     — Create/ALTER procedure
```

### State Extensions (runtime.js)

```javascript
cursor.erDiagram = {
  selectedTable: null,
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 }
}
cursor.tableDesigner = {
  isOpen: false,
  targetTable: null,  // null = new table
  dirty: false
}
cursor.execPlan = {
  xml: null,
  operators: [],
  costThreshold: 0
}
cursor.spEditor = {
  isOpen: false,
  targetSp: null,
  dirty: false
}
```

## Patterns Established in Prior Phases

| Pattern | Used In | Application in Phase 5 |
|---------|---------|----------------------|
| Hook-injection | main.js wires hooks | `setErDiagramHooks({ onTableSelect, onTableEdit })` |
| Mode-specific rendering | setMode() toggles body classes | ER panel visible when connected to live DB |
| Template literal HTML | ui.js render functions | `erDiagram.js` has `renderErNode(table)` returning SVG string |
| Debounced persistence | state.js 400ms timer | Schema cache in memory, not persisted |
| D3 CDN pattern | (new in Phase 5) | D3 v5 + dagre from CDN, initialized in module |
| Backend API pattern | apiClient.js | All schema/fetch calls go through apiClient |

## Validation Architecture

Plan-phase verification requires observable outcomes. For Phase 5:

| Feature | Observable Behavior |
|---------|-------------------|
| ER diagram loads | SVG renders within 2s of database selection |
| ER diagram interaction | Click table → columns panel slides in from right |
| ER diagram zoom/pan | Mouse wheel zooms, drag pans, controls (+/-) work |
| Table designer opens | Double-click ER node → modal appears with form |
| DDL preview updates | Change column type → DDL text updates in <100ms |
| Execution plan renders | Query with SET SHOWPLAN_XML ON → SVG flowchart appears |
| SP editor loads | Click SP in object explorer → editor populated |
| GO batches display | SP with GO → visual divider lines between batches |

---

*Research complete: 2026-04-30*
# Phase 5: Visual Design Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 5-visual-design-tools
**Areas discussed:** ER Rendering, ER Layout, ER Interactions, Exec Plan Rendering, Table DDL Preview, SP Editor, SP T-SQL Checking

---

## ER Rendering

| Option | Description | Selected |
|--------|-------------|----------|
| D3.js + dagre | Dagre for auto-layout, SVG for rendering. Good for interactive diagrams. | ✓ |
| Raw SVG/CSS | Pure SVG without auto-layout. More control but manual node positioning. | |
| HTML Canvas | Canvas-based rendering for performance. Lower-level, more work. | |

**User's choice:** D3.js + dagre (Recommended)
**Notes:** Consistent with STATE.md accumulated context which already flagged D3.js + dagre for ER diagrams and execution plan rendering.

---

## ER Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Hierarchical (top-down) | Auto-arrange using dagre hierarchical layout. Tables flow top-to-bottom. | ✓ |
| Hierarchical (left-right) | Dagre left-to-right layout. More horizontal flow. | |
| Radial/tree (dbForge style) | SQL dbForge-inspired radial layout with center table surrounded by related tables. | |
| Manual positioning | User manually positions tables. No auto-layout. | |

**User's choice:** Hierarchical (top-down)
**Notes:** Natural flow for FK relationships pointing downward.

---

## ER Interactions

| Option | Description | Selected |
|--------|-------------|----------|
| Click select + double-click edit | Click selects table, shows columns panel. Double-click opens table designer. | ✓ |
| Click tooltip + double-click edit | Click shows tooltip with columns/types. No panel. Double-click opens designer. | |
| Sidebar details panel | Sidebar panel always visible showing selected table's columns. No tooltip. | |

**User's choice:** Click select + double-click edit
**Notes:** Standard interaction pattern for database diagram tools.

---

## Exec Plan Rendering

| Option | Description | Selected |
|--------|-------------|----------|
| D3.js (same as ER) | Parse XML Showplan into operator tree. Dagre for layout. SVG for rendering. | ✓ |
| React Flow (specialized) | React Flow is designed for node-based diagrams like execution plans. Better than generic D3. | |
| Raw SVG/CSS | Pure SVG/CSS without auto-layout. More work but no new dependency. | |

**User's choice:** D3.js (same as ER)
**Notes:** Consistent stack — same rendering technology for both ER and execution plans simplifies learning curve and code sharing.

---

## Table DDL Preview

| Option | Description | Selected |
|--------|-------------|----------|
| Live preview panel | Generate DDL as user types/changes definition. Shows CREATE TABLE statement in real-time. | ✓ |
| Preview on demand | Show DDL only when user clicks Preview or Execute. More static approach. | |
| No code preview | No code preview. Table designer shows only GUI form. Execute generates DDL internally. | |

**User's choice:** Live preview panel
**Notes:** Professional users want to see and verify the exact DDL before execution.

---

## SP Editor

| Option | Description | Selected |
|--------|-------------|----------|
| Separate panel (right sidebar) | SP editor lives in a new right panel tab (like snippets). Not in main editor area. | ✓ |
| Existing tabs | SP editor uses existing tabs from Phase 3. Object explorer click opens SP in new tab. | |
| Modal dialog | SP editor is a modal dialog. Opens over current editor. | |

**User's choice:** Separate panel (right sidebar)
**Notes:** Keeps SP editor accessible without cluttering the main tab workspace.

---

## SP T-SQL Checking

| Option | Description | Selected |
|--------|-------------|----------|
| Backend validation | Backend T-SQL validation endpoint. User types SP, backend validates via mssql parser. | ✓ |
| Client-side static | Regex/static checks for common issues. No server round-trip. | |
| node-sql-parser | node-sql-parser for static analysis. Can validate T-SQL dialect. | |

**User's choice:** Backend validation
**Notes:** Backend has mssql connection; can do real T-SQL validation against the actual SQL Server syntax.

---

## the agent's Discretion

- Exact ER node styling (box size, colors, fonts, connection line styles)
- Panel transition animations (fade vs slide)
- Error display format in SP editor (inline vs tooltip vs panel)
- GO separator parsing edge cases (GO inside strings/comments)
- Execution plan XML parsing details (operator tree construction)

---

## Deferred Ideas

None — discussion stayed within phase scope.
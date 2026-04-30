# Stack Research

**Domain:** Professional SQL Server Management Studio (browser-based)
**Researched:** 2026-04-30
**Confidence:** MEDIUM

*Note: Context7 MCP not available; all findings via WebFetch of official docs and GitHub, labeled by confidence.*

## Recommended Stack

### Core Technologies for Professional Features

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **D3.js** | v7 | ER diagrams, execution plan graph rendering | Standard for directed graph visualization; pairs with dagre for automatic layout; used by TensorBoard, JointJS |
| **@dagrejs/dagre** | v2.0.0 | Graph layout algorithm | Pure JS layout engine for directed graphs; renders execution plans and database relationships; browser script available |
| **Chart.js** | v4 | Query result charting | 60k stars, 2.4M weekly downloads; canvas rendering for performance; strong docs and community |
| **node-sql-parser** | latest | SQL parsing for Query Builder | Supports T-SQL dialect; parses ALTER/CREATE for Table Designer; AST-based for Stored Procedure Editor |
| **alasql** | latest | Client-side SQL engine | JavaScript SQL engine; enables Query Builder visual SQL construction without backend |

### Backend Proxy (Required for Live SQL Server)

| Technology | Purpose | Why |
|------------|---------|-----|
| **Express.js** | HTTP server | Minimal, unopinionated; proxies SQL queries from browser to SQL Server |
| **mssql (tedious)** | SQL Server driver | Pure JS, cross-platform; official Microsoft driver; 2.3k stars, actively maintained |

*No bundled/inline SQL Server access — browser sandbox prevents direct TDS protocol.*

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **sql.js** | 1.10.3 | SQLite in browser | Existing — Practice mode, sandbox, query validation |
| **CodeMirror** | 5.65.16 | SQL editor | Existing — Editor, autocomplete, syntax highlighting |
| **dagre-d3** | deprecated | D3 renderer for dagre | Only if custom SVG rendering needed; otherwise D3 directly |
| **DOMPurify** | latest | HTML sanitization | Sanitize ER diagram tooltips, execution plan node details |
| **file-saver** | latest | CSV/Excel export | Backup file downloads, result set exports |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **ANTLR-based parsers** | Complexity, setup overhead | node-sql-parser (hand-written recursive descent, no external deps) |
| **Full diagramming libraries (JointJS, GoJS)** | Heavy weight ($), over-engineered | D3 + dagre for custom ER diagrams |
| **C3.js** | Wrapper around D3, less control | Chart.js for charting, D3 for custom |
| **Electron or NW.js** | Desktop wrapper, not browser-native | Browser-only constraint |
| **Webpack/Vite/Rollup** | Conflicts with "no build step" constraint | Static file serving, CDN imports |

## Stack Patterns by Variant

**If proxy backend is Node.js:**
- Use Express + mssql for SQL Server communication
- Proxy layer handles authentication, connection pooling
- Browser sends SQL → proxy → SQL Server → response → browser

**If proxy backend is Go/C#:**
- Use native TDS library
- Same architectural pattern: thin proxy, browser stays thin

**If working with sql.js only (no live server):**
- alasql replaces mssql for client-side joins/transforms
- node-sql-parser still valid for T-SQL translation
- No ER diagram from live FK metadata (use seed database schemas)

## Installation

*Since this is a CDN-based, no-build project, libraries are loaded from CDN:*

```html
<!-- D3 + dagre for ER diagrams and execution plans -->
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@dagrejs/dagre@2.0.0/dist/dagre.min.js"></script>

<!-- Chart.js for result charting -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<!-- node-sql-parser for SQL parsing -->
<script src="https://cdn.jsdelivr.net/npm/node-sql-parser@5.0.0/build/node-sql-parser.min.js"></script>

<!-- DOMPurify for sanitization -->
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.0/dist/purify.min.js"></script>
```

For backend proxy (Node.js):
```bash
npm install express mssql cors helmet
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| D3 + dagre | Cytoscape.js | Need out-of-box interactive graph editing with built-in UI controls |
| Chart.js | ECharts | Need 3D charts, more complex visualizations, or map support |
| node-sql-parser | Jison (build your own) | Only if node-sql-parser doesn't cover T-SQL dialect needed |
| alasql | WebSQL | WebSQL is deprecated; alasql is actively maintained |

## Sources

- **D3.js:** https://d3js.org/ — verified current v7
- **@dagrejs/dagre:** https://github.com/dagrejs/dagre — v2.0.0 released Nov 2025, browser scripts available
- **Chart.js:** https://www.chartjs.org/docs/latest/ — verified current version, 60k stars, 2.4M weekly npm downloads
- **node-mssql (tedious):** https://github.com/tediousjs/node-mssql — 2.3k stars, actively maintained, pure JS TDS driver
- **alasql:** https://github.com/AlaSQL/alasql — verified exists, 1k stars, JavaScript SQL engine
- **dagre-d3:** https://github.com/dagrejs/dagre-d3 — v0.5.0 last release Dec 2017, deprecated in favor of D3 direct rendering
- **SQL Server execution plan XML:** Microsoft documentation on Showplan XML — standard XML schema, no special library needed beyond browser XML parser

## Integration Points

### With Existing Codebase

**New modules to create:**
- `scripts/diagram.js` — ER viewer using D3 + dagre
- `scripts/execution-plan.js` — Parse Showplan XML, render with D3
- `scripts/query-builder.js` — Visual query builder using alasql + node-sql-parser
- `scripts/chart-renderer.js` — Chart.js integration for result sets
- `scripts/table-designer.js` — CREATE/ALTER table UI driven by node-sql-parser

**Integration hooks:**
- `runtime.js` — Add `diagramDb` for metadata source
- `ui.js` — Add render functions for new panels (ER viewer, chart output)
- `main.js` — Wire new feature handlers
- `index.html` — New panel containers, CDN script additions

**Backend proxy integration:**
- `scripts/live.js` — Connection manager sending queries to proxy
- Proxy endpoint: `POST /api/query` → mssql → SQL Server → JSON response

### Critical Constraint: No Build Step
All new libraries must be available via CDN or IIFE modules. No npm packages requiring build/bundle.

---

*Stack research for: SQL Query Lab v1.1 Professional Feature Suite*
*Researched: 2026-04-30*
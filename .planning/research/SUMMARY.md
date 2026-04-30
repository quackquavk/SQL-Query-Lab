# Project Research Summary

**Project:** SQL Query Lab v1.1 Professional Feature Suite
**Domain:** Browser-based SQL Server Management Studio
**Researched:** 2026-04-30
**Confidence:** MEDIUM

## Executive Summary

SQL Query Lab targets the market gap left by Azure Data Studio's retirement (Feb 2026) — a true cross-platform, browser-based, professional-grade SQL Server management tool. No current product fills this gap: SSMS is Windows-only, VS Code requires extensions, and third-party tools are expensive. The constraint is not that browser tools can't be professional — it's that no one has built one yet.

The critical architectural insight: **the browser cannot directly connect to SQL Server**. sql.js is SQLite in WebAssembly — it cannot establish TDS protocol connections. A backend proxy is mandatory for all live SQL Server features, and it must be built first. Attempting to build features against sql.js with a "we'll add the proxy later" approach guarantees a full rewrite.

The recommended approach sequences work as: (1) backend proxy with state management architecture, (2) core query UI with live connections, (3) visual design tools, (4) administration features. This avoids the top pitfalls: proxy underestimation, state management collapse, and visual component proliferation. Key technologies include D3.js + dagre for diagram/execution-plan rendering, Chart.js for result charting, and node-sql-parser + alasql for the visual query builder — all available via CDN with no build step.

## Key Findings

### Recommended Stack

The professional feature suite requires new libraries beyond the current sql.js + CodeMirror foundation. D3.js v7 and @dagrejs/dagre v2 handle ER diagrams and execution plan graph rendering via directed graph layout. Chart.js v4 provides query result charting with canvas rendering. node-sql-parser (latest) parses T-SQL for the visual query builder and table designer. alasql enables client-side SQL construction without backend. The backend proxy uses Express.js + mssql (Tedious) for SQL Server communication via TDS protocol. DOMPurify sanitizes dynamic content; file-saver handles exports.

**Critical constraint:** No build step. All libraries must load via CDN or IIFE modules. Avoid webpack/vite/rollup (conflicts with constraint), ANTLR-based parsers (complexity), and full diagramming libraries like JointJS/GoJS (over-engineered).

**Core technologies:**
- **D3.js v7:** ER diagrams, execution plan rendering — standard for directed graph visualization
- **@dagrejs/dagre v2:** Graph layout algorithm — renders execution plans and database relationships
- **Chart.js v4:** Query result charting — 60k stars, 2.4M weekly downloads, canvas-based performance
- **node-sql-parser:** T-SQL parsing — supports ALTER/CREATE for table designer, AST-based for stored procedures
- **alasql:** Client-side SQL engine — visual query builder construction without backend
- **Express.js + mssql:** Backend proxy — pure JS, cross-platform, connection pooling built-in

### Expected Features

**Must have (table stakes):** Connection dialog with Entra MFA support (critical for Azure SQL), Object Explorer with tree navigation, Query editor with T-SQL syntax highlighting and IntelliSense, Results grid with CSV/JSON export, Multiple query tabs with history persistence, Dark/light themes. Missing these = product feels incomplete.

**Should have (differentiators):** Visual table designer (CREATE/ALTER without DDL), Execution plan viewer (diagnose query performance), Database diagram visualization (ER diagrams, foreign key visualization), Code snippets with categories, Connection groups/favorites. Azure Data Studio never had visual diagrams and is now retired — this creates differentiation opportunity.

**Defer (v2+):** SQL Agent job management (complex, niche), Full security administration (permission management), Backup/restore GUI (low frequency), Multi-database transactions (explicitly out of scope). These are deep DBA features beyond MVP scope.

### Architecture Approach

Professional SQL management tools split UI layer (query editing, results display) from execution layer (connection management, credential storage). Azure Data Studio's Electron architecture used Node.js main process as SQL Server gateway — renderer never spoke directly to SQL Server. This project follows the same pattern: thin browser client sends queries through backend proxy which holds credentials, manages connection pools, and executes via TDS protocol.

The architecture splits into browser modules (main.js, apiClient.js, runtime.js, state.js, sandbox.js, practice.js, ui.js, editor.js) and backend proxy modules (Express server, connection/routes, query executor, credential store). Existing 13 JS modules remain largely intact for practice/sandbox modes (which still use sql.js); only the query execution path changes for live SQL Server connections.

**Major components:**
1. **Backend Proxy (Express + mssql):** Connection pooling, query execution, credential encryption, REST API for connections, WebSocket for streaming query results
2. **API Client (apiClient.js):** fetch/WebSocket communication between browser and proxy, connection session management
3. **State Architecture:** Formal state container replacing current runtime.cursor + state.js + localStorage spread, feature-specific state slices with clear ownership
4. **Visual Rendering (D3/dagre, Chart.js):** ER diagrams, execution plan trees, query result charts — isolated modules to avoid DOM manipulation conflicts

### Critical Pitfalls

1. **Backend Proxy Architecture Underestimation** — sql.js cannot connect to external SQL Server. The proxy must handle connection pooling, authentication, query cancellation, and multiple simultaneous connections. Make this Phase 1 — not parallel with feature work. Warning: "Features working in sql.js sandbox but not with real SQL Server."

2. **State Management Collapse** — Current state spread across runtime.cursor, state.js, and localStorage with no clear boundaries. Adding 10 features multiplies state variables exponentially. Introduce formal state container before feature work. Define clear state ownership boundaries per feature.

3. **Visual Component Proliferation Without Architecture** — Visual Table Designer, ER Viewer, Visual Query Builder, Chart Viewer all need complex DOM/canvas/SVG rendering. Building these ad-hoc creates memory leaks, z-index conflicts, and editor breakage. Establish rendering strategy before building visual features. Plan for disposal/cleanup of visual component state.

4. **Execution Plan XML Complexity** — SQL Server execution plans are complex XML with nested operators, runtime statistics, missing index recommendations. Naive implementation shows the plan but misses critical details DBAs need. Parse both estimated and actual plans; handle operator-specific rendering rules.

5. **Credential and Connection Security Gaps** — Storing connection strings in localStorage exposes credentials. Never store passwords in localStorage — use sessionStorage with memory encryption at rest. Implement proper connection string encryption; plan for Azure AD token timeout.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — Backend Proxy + State Architecture
**Rationale:** All professional features require live SQL Server connections. The proxy is a prerequisite, not an add-on. State management collapse is the second-biggest risk. Both must be addressed before UI feature work begins.
**Delivers:** Express.js proxy with mssql connection pooling, WebSocket query streaming, credential encryption at rest, formal state container with feature-specific slices, connection dialog UI with Entra MFA support.
**Addresses:** Connection dialog (FEATURES.md table stakes), Object Explorer data model
**Avoids:** Pitfall 1 (Backend Proxy Architecture), Pitfall 2 (State Management Collapse), Pitfall 5 (Credential Security)
**Uses:** Stack technologies: Express.js, mssql (Tedious), node-sql-parser (for connection string parsing)
**Research Flags:** None — standard patterns, well-documented Microsoft driver

### Phase 2: Core Query Execution — Live Query UI
**Rationale:** The query editor is the primary workflow. Must work against real SQL Server before visual features can be validated. Maintains sql.js path for sandbox/practice unchanged during this phase.
**Delivers:** Query editor connected to backend proxy, results grid with streaming, CSV/JSON/Excel export, multiple query tabs with history persistence, T-SQL syntax highlighting, basic IntelliSense.
**Addresses:** Query editor (FEATURES.md table stakes), Results grid, Export, Tabs, History
**Uses:** Stack technologies: Chart.js (for future charting integration), existing CodeMirror integration
**Implements:** Pattern 1 from Architecture (REST API + WebSocket for query execution)
**Research Flags:** None — established patterns from Azure Data Studio reference

### Phase 3: Visual Design Tools — Table Designer, ER Viewer, Execution Plan
**Rationale:** These are the key differentiators. Azure Data Studio never had database diagrams and is now retired. Visual table designer and ER viewer establish competitive positioning. Execution plan viewer enables DBA-grade query optimization.
**Delivers:** Visual Table Designer (CREATE/ALTER via node-sql-parser), ER diagram visualization (D3 + dagre, lazy-loaded FK relationships), Execution plan viewer (parse Showplan XML, render operator tree with statistics), Connection groups/favorites, Code snippets with categories.
**Addresses:** Visual Table Designer, ER diagrams, Execution Plan Viewer (FEATURES.md differentiators)
**Uses:** Stack technologies: D3.js, dagre, node-sql-parser, DOMPurify
**Implements:** Component architecture for visual rendering, operator-specific rendering rules for execution plans
**Research Flags:** **Phase 3 needs deeper research** — Execution Plan XML schema complexity (Pitfall 4), ER diagram rendering strategy for large schemas (virtualization)

### Phase 4: Visual Query Builder + Query Optimization
**Rationale:** Visual query builder extends the visual design tools story. Query optimization advisor adds AI-assisted tuning. Chart viewer connects results to visualization.
**Delivers:** Visual Query Builder (alasql + node-sql-parser, scoped to simple SELECT), Query optimization suggestions (missing index detection with overlap detection), Query result charting (Chart.js with query history integration).
**Addresses:** Visual Query Builder, Query Optimization (FEATURES.md differentiators), Chart Viewer (FEATURES.md)
**Uses:** Stack technologies: alasql, node-sql-parser, Chart.js
**Research Flags:** **Phase 4 needs deeper research** — Query optimization guidance UX (user research on what suggestions are helpful), Visual query builder scope validation

### Phase 5: Administration Features — SQL Agent + Backup/Restore
**Rationale:** Administration features are lower frequency but high value for DBAs. SQL Agent and Backup/Restore require careful UX for safety.
**Delivers:** SQL Agent Job Viewer (schedules, step outcomes, history), Backup/Restore GUI (confirmation dialogs with target validation, operation logging).
**Addresses:** SQL Agent, Backup/Restore (FEATURES.md advanced administration)
**Avoids:** Pitfall 7 (SQL Agent complexity), Pitfall 8 (Backup/Restore safety)
**Research Flags:** **Phase 5 needs deeper research** — SQL Agent MSDB schema (complexity of job state across multiple system tables)

### Phase Ordering Rationale

- **Backend proxy first:** All 10 features require live SQL Server connections. Building features against sql.js guarantees full rewrite.
- **State architecture before visual features:** Visual components multiply state complexity. Formal state prevents collapse.
- **Query execution before visual tools:** Core workflow must work on real servers before adding visual flourishes.
- **Visual tools before administration:** Higher frequency, broader audience — Table Designer and ER Viewer benefit more users than SQL Agent Job Viewer.
- **Grouping by dependency:** Connection management → Query execution → Visual tools → Administration follows natural dependencies from FEATURES.md feature dependencies.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Execution Plan Viewer):** Complex XML schema with nested operators, operator-specific rendering rules, runtime statistics parsing
- **Phase 3 (ER Viewer):** Large schema virtualization strategy, lazy loading optimization for 100+ tables
- **Phase 4 (Query Optimization):** User research needed on what guidance is actionable vs overwhelming
- **Phase 4 (Visual Query Builder):** Scope boundaries for complex queries (CTEs, window functions)
- **Phase 5 (SQL Agent):** MSDB schema complexity, job state across multiple system tables

Phases with standard patterns (skip research-phase):
- **Phase 1 (Backend Proxy):** Express + mssql is well-documented, Microsoft-supported driver
- **Phase 2 (Query Execution):** REST + WebSocket for query streaming is industry standard (Supabase, PlanetScale use this pattern)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | CDN library versions verified via web fetch; backend proxy pattern confirmed via Azure Data Studio reference; sql.js constraint correctly identified |
| Features | MEDIUM | Table stakes and differentiators well-documented via Microsoft docs; user frustrations from archived community discussions (not current); market gap (ADS retirement) verified |
| Architecture | MEDIUM | Azure Data Studio archived reference provides architectural pattern; mssql API confirmed via npm docs; REST vs WebSocket pattern from industry standards (Supabase, PlanetScale) |
| Pitfalls | MEDIUM | Pitfalls derived from CONCERNS.md and architectural analysis; execution plan complexity and SQL Agent complexity are well-documented in Microsoft docs; security patterns are standard |

**Overall confidence:** MEDIUM

### Gaps to Address

- **T-SQL dialect coverage for node-sql-parser:** Not verified against all T-SQL syntax needed (CTEs, window functions, stored procedure parameters). Needs validation against actual SQL Server workloads during Phase 1.
- **Connection string encryption implementation:** MVP approach (encrypted file on server) needs hardening for production. AWS Secrets Manager / HashiCorp Vault integration deferred to later.
- **Performance at scale:** ER diagram with 100+ tables, execution plans >10MB, result sets >100K rows — virtualization strategies not verified. Needs testing during implementation.
- **MFA/Entra authentication flow:** Entra MFA is complex (device code flow, token refresh). Partial implementation may work for MVP but full support needs validation.

## Sources

### Primary (HIGH confidence)
- [Microsoft SSMS documentation](https://learn.microsoft.com/en-us/sql/ssms/sql-server-management-studio-ssms) — official docs
- [SSMS 22 release notes](https://learn.microsoft.com/en-us/sql/ssms/release-notes-22) — current official release
- [mssql/Tedious npm](https://github.com/tediousjs/node-mssql) — actively maintained, Microsoft-supported
- [D3.js v7](https://d3js.org/) — verified current version
- [Chart.js](https://www.chartjs.org/docs/latest/) — 60k stars, 2.4M weekly npm downloads

### Secondary (MEDIUM confidence)
- [Azure Data Studio (archived)](https://learn.microsoft.com/en-us/previous-versions/azure-data-studio/what-is-azure-data-studio) — architectural reference for browser-based SQL tooling
- [vscode-mssql extension](https://github.com/microsoft/vscode-mssql) — successor to Azure Data Studio SQL capabilities
- [Azure Data Studio feature comparison](https://learn.microsoft.com/en-us/previous-versions/azure-data-studio/what-is-azure-data-studio) — shows what's implemented vs preview
- [dagre GitHub](https://github.com/dagrejs/dagre) — v2.0.0 released Nov 2025
- [node-sql-parser](https://github.com/一片博客/node-sql-parser) — T-SQL dialect support

### Tertiary (LOW confidence)
- [dbForge Studio](https://www.devart.com/dbforge-sql/studio/) — 404 from docs, marketing content only
- [Toad for SQL Server](https://www.quest.com/products/toad-for-sql-server/) — marketing content
- Community frustrations with existing tools — archived discussions, not current

---
*Research completed: 2026-04-30*
*Ready for roadmap: yes*
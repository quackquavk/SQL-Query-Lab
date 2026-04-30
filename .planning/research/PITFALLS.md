# Pitfalls Research

**Domain:** Browser-based SQL Server Management Studio (Professional Feature Suite)
**Researched:** 2026-04-30
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Backend Proxy Architecture Underestimation

**What goes wrong:**
All 10 features require real SQL Server connections (not sql.js). The current browser-only architecture has no backend proxy. Features like Execution Plan Viewer, Stored Procedure Editor, SQL Agent Job Viewer, and Backup/Restore GUI fundamentally cannot work without a backend proxy that bridges browser JavaScript to SQL Server (via TDS protocol).

**Why it happens:**
sql.js is SQLite compiled to WebAssembly — it cannot connect to external SQL Server instances. The CONCERNS.md correctly identifies "Backend proxy for SQL Server" as pending, but the complexity is underestimated. A proxy isn't just a passthrough — it must handle connection pooling, authentication, query cancellation, and potentially multiple simultaneous connections.

**How to avoid:**
- Make backend proxy architecture the *first* phase, not parallel with feature development
- Treat the proxy as a first-class architectural component with its own module/interface
- Define clear API contracts between browser and proxy before building features
- Consider using sqltoolsservice (Microsoft's open-source SQL Tools Service) vs building custom proxy

**Warning signs:**
- Building features that assume live connection before proxy exists
- "We'll add the proxy later" planning attitude
- Features working in sql.js sandbox but not with real SQL Server

**Phase to address:**
Phase 1 (Foundation): Backend proxy for SQL Server connectivity — must precede all feature work

---

### Pitfall 2: State Management Collapse

**What goes wrong:**
Current state is spread across `runtime.cursor`, `state.js`, and localStorage with no clear boundaries. Adding 10 professional features multiplies state variables exponentially (connection configs, diagram layouts, query builder states, chart configurations, job schedules, etc.). The system becomes undebuggable as state mutations happen across modules without coordination.

**Why it happens:**
The CONCERNS.md flags "State spread across multiple modules" and "No formal state container." The current hook-injection pattern (`setDbHooks`, `setUiHooks`) works for simple features but breaks down when 10 features all need to share and persist state.

**How to avoid:**
- Introduce a formal state container or event-based state management *before* adding features
- Define clear state ownership boundaries per feature
- Create feature-specific state slices that don't pollute global state
- Document state invariants that must hold true

**Warning signs:**
- Adding new state variables to runtime.cursor repeatedly
- Features passing state through multiple hops (A→B→C→D)
- "Where did this state live again?" questions increasing
- State merge conflicts in localStorage

**Phase to address:**
Phase 1 (Foundation): State management architecture — should precede UI feature work

---

### Pitfall 3: Visual Component Proliferation Without Architecture

**What goes wrong:**
Visual Table Designer, ER Viewer, Visual Query Builder, and Chart Viewer all require complex DOM components with drag-drop, canvas rendering, and interactive states. Building these ad-hoc alongside existing UI code creates spaghetti DOM manipulation, memory leaks from event handlers, and impossible-to-debug rendering issues.

**Why it happens:**
Current codebase is DOM-based (document.getElementById, template literals). Complex visual tools typically need canvas/SVG rendering, virtualization for large diagrams, and sophisticated event handling that doesn't mix well with vanilla DOM manipulation.

**How to avoid:**
- Establish a rendering strategy for complex visual components before building them
- Consider separating visual components into their own modules with clear interfaces
- Plan for canvas/SVG rendering needs in ER Viewer and Query Builder
- Design for disposal/cleanup of visual component state to prevent memory leaks

**Warning signs:**
- CodeMirror wrapper div nested inside feature-specific containers causing z-index/scrolling conflicts
- "This feature works but breaks the editor" reports
- Event listeners not being cleaned up on mode switch
- Memory usage growing unbounded when switching between features

**Phase to address:**
Phase 2 (UI Architecture): Visual component architecture — before building visual features

---

### Pitfall 4: Execution Plan XML Complexity Underestimation

**What goes wrong:**
SQL Server execution plans are complex XML documents with nested operators (SELECT, FILTER, JOIN, SCAN, etc.), runtime statistics, and missing index recommendations. Attempting to parse and render these correctly in a browser results in incomplete visualization, missing operator details, or incorrect layout.

**Why it happens:**
Execution plan XML has deep nesting, multiple serialization formats (estimated vs actual), and operator-specific rendering requirements. SSMS and Azure Data Studio have years of iteration on plan visualization. A naive implementation shows the plan but misses critical details DBAs need.

**How to avoid:**
- Research actual SQL Server plan XML schema before implementation
- Start with basic tree visualization, add sophistication incrementally
- Handle both estimated and actual plan modes
- Parse missing index recommendations from XML properly

**Warning signs:**
- "Plan displays but looks wrong" — operators in wrong order or missing connections
- Missing index suggestions not appearing
- Runtime statistics (actual rows, time) missing from actual plans
- MemoryEstimate, IOStats missing from operators

**Phase to address:**
Phase 3 (Query Features): Execution Plan Viewer — needs dedicated research phase

---

### Pitfall 5: Credential and Connection Security Gaps

**What goes wrong:**
Real SQL Server connections require storing connection strings with passwords. Storing these insecurely in localStorage or browser memory exposes credentials. The current codebase stores sandbox DB states as base64 in localStorage — acceptable for sandbox, catastrophic for production connection credentials.

**Why it happens:**
The CONCERNS.md flags "localStorage Data Exposure" but the current localStorage use is for non-sensitive sandbox state. When adding connection management for real SQL Server, credential storage becomes critical and requires encryption at rest, secure memory handling, and proper credential lifecycle (clear on logout).

**How to avoid:**
- Design credential storage from day one — treat as security-critical component
- Never store passwords in localStorage — use sessionStorage with memory encryption at rest
- Implement proper connection string encryption
- Plan for credential timeout and refresh (Azure AD tokens expire)

**Warning signs:**
- Connection password appearing in localStorage
- Credentials visible in browser developer tools
- "Remember me" feature storing password in plain text
- No logout/clear credential functionality

**Phase to address:**
Phase 1 (Foundation): Connection security architecture — before any live connection features

---

### Pitfall 6: Missing Index Detection False Positives

**What goes wrong:**
Missing index suggestions from execution plans are not authoritative — SQL Server suggests indexes that may not improve performance, may not be used, or may hurt write performance. Presenting these naive to users results in users adding unnecessary indexes, bloating their databases, and potentially degrading performance.

**Why it happens:**
Missing index DMVs (`sys.dm_db_missing_index_details`, `sys.dm_db_missing_index_groups`) return suggestions without user impact scoring, index overlap detection, or consideration of existing indexes. Azure Data Studio and SSMS both struggle with presenting these appropriately.

**How to avoid:**
- Implement index overlap detection (multiple suggestions for same column)
- Show user impact estimate when available
- Indicate when suggested index already exists or overlaps significantly
- Provide context on write cost vs read benefit

**Warning signs:**
- "SQL Server suggests 50 missing indexes" — overwhelming users
- Suggestions ignoring existing index partially covering the query
- No differentiation between highly impactful and low-impact suggestions
- Users reporting "I added the index but query is still slow"

**Phase to address:**
Phase 3 (Query Features): Query Optimization Advisor — needs user research on what guidance is helpful

---

### Pitfall 7: SQL Agent Job Viewer Incomplete State

**What goes wrong:**
SQL Agent jobs have complex state: schedules, steps, outcomes, history logs, alerts, operators. A partial implementation shows job names but not schedules, or shows history but not current status, leaving users unable to understand job health without SSMS.

**Why it happens:**
SQL Agent information lives across multiple system tables and MSDB databases. Job state involves real-time monitoring (is job currently running?), historical data (last 100 runs?), and configuration (schedule cron). A simple query returns job list; complete view requires multiple queries with proper joins.

**How to avoid:**
- Design comprehensive data model for job state before implementation
- Plan for real-time monitoring (polling or notifications)
- Implement job step visualization with step outcomes
- Handle job schedule display with next run time

**Warning signs:**
- Job status showing "Unknown" or stale information
- Schedule times not matching SQL Agent schedule definitions
- Job history showing only last run when user needs 30-day history
- "I can see jobs but can't tell if they're enabled or what schedule they use"

**Phase to address:**
Phase 4 (Administration Features): SQL Agent Job Viewer — requires comprehensive data gathering

---

### Pitfall 8: Backup/Restore GUI Dangerous Operations

**What goes wrong:**
Backup and restore are destructive operations. A flawed GUI could allow restoring to wrong database, selecting wrong backup file, or executing restore instead of backup. Unlike query errors which are reversible, restore operations are permanent data loss risks.

**Why it happens:**
Current sandbox mode is safe — sql.js in-memory DB has no real consequences. Real backup/restore operations require OS-level file access, proper backup set handling, and transaction log considerations. A "restore point-in-time" misclick could destroy production data.

**How to avoid:**
- Implement confirmation dialogs with explicit target database name
- Never auto-execute — always require explicit user action with summary
- Provide backup preview (what will be overwritten)
- Log all backup/restore operations for audit

**Warning signs:**
- No confirmation before destructive operation
- Target database selectable without warning about data loss
- "Restore" button accessible when in read-only connection
- No operation logging or rollback path

**Phase to address:**
Phase 4 (Administration Features): Backup/Restore GUI — requires safety-first UX design

---

### Pitfall 9: Visual Query Builder Credibility Gap

**What goes wrong:**
Visual query builders (drag-and-drop SELECT/WHERE construction) produce SQL that looks different from hand-written SQL, confusing users, producing non-optimal queries, and failing on complex queries (CTEs, window functions, subqueries). Users abandon the tool for hand-written SQL anyway.

**Why it happens:**
Visual query builders work well for simple SELECT statements but struggle with query complexity. The generated SQL is often verbose, doesn't use optimal JOIN order, and can't express complex patterns. SSMS's query designer has the same problems.

**How to avoid:**
- Scope visual builder to simple SELECT queries (single table, basic WHERE)
- Provide SQL preview always — user sees generated SQL
- Support common patterns incrementally (JOINs, GROUP BY, ORDER BY)
- Make it easy to switch between visual and text editing
- Never claim visual builder can replace hand-written SQL for complex queries

**Warning signs:**
- "The query looks right but doesn't run" — generated SQL syntax errors
- Visual builder output rejected by SQL Server as invalid
- Users reporting "I can't build the query I need visually"
- Generated SQL visibly different from what user intended

**Phase to address:**
Phase 3 (Query Features): Visual Query Builder — limit scope from start

---

### Pitfall 10: Chart Viewer Disconnected from Results

**What goes wrong:**
Query result charting is useful in isolation but becomes powerful when integrated with query history, comparison against baselines, and export. A standalone chart view that doesn't connect to the rest of the workflow feels like a toy feature rather than a professional tool.

**Why it happens:**
Charting result sets is straightforward. Making it useful for professional work requires connecting it to execution history (compare current vs last week), schema awareness (chart knows what columns mean), and export/sharing capabilities. Without integration, charts are gimmicks.

**How to avoid:**
- Design chart integration with query history from start
- Enable chart saving with query context (not just screenshot)
- Support common chart types with sensible defaults per data type
- Provide export that preserves data context (CSV with column names, not just image)

**Warning signs:**
- Chart data not persistable — screenshots only
- "I charted this but can't save the chart with the query that produced it"
- No way to compare charts across different query runs
- Numeric data treated as categorical or vice versa

**Phase to address:**
Phase 3 (Query Features): Query Result Charting — design for integration early

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Build features against sql.js, migrate later | Fast initial progress | Full rewrite for real connections | Never — backend is prerequisite |
| Add state to runtime.cursor without structure | No coordination needed | State becomes unmanageable | Never — needs formal architecture |
| Use DOM for visual components | Familiar code pattern | Memory leaks, z-index wars | Only for MVP, plan rewrite |
| Skeleton UI that echoes to console | Features appear started | User-facing "not implemented" | Never — hurts credibility |
| Hardcode connection strings | No encryption complexity | Credential exposure | Never |
| Skip index overlap detection | Simpler missing index UI | Database bloat from bad suggestions | Only if clearly labeled "experimental" |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SQL Server connection | sql.js fallback when live connection fails | Clear error, never silent fallback |
| Execution plan XML | Treating all operators same | Operator-specific rendering rules |
| Stored procedure editor | No parameter validation before execute | Pre-parse and validate parameters |
| ER Viewer | Loading all FK relationships at once | Lazy load per-table, filter deeply |
| Backup operation | No pre-flight validation | Validate backup file, target, space before start |
| Chart data | Assuming column types | Infer from actual data, allow override |
| Query optimization | Presenting suggestions as commands | Clear guidance on evaluation criteria |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| ER diagram full schema load | Browser freeze on large database | Virtualization, viewport culling | 100+ tables |
| Execution plan large XML | Memory exhaustion | Streaming parse, progressive rendering | Plans > 10MB |
| Stored procedure large body | Editor lag on typing | Virtualized editing, syntax-only highlighting | SP > 100KB |
| Result set charting | "Chart this 10M row result" | Row limit warning, sampling option | > 100K rows |
| Backup file browser | Listing network shares | Async loading, caching | Large backup directories |
| Job history loading | 30-day history query timeout | Pagination, date range filter | High-frequency job schedules |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Connection string in localStorage | Credential theft | Session storage + encryption |
| Plaintext password in memory | JS access to credentials | Minimize credential exposure surface |
| Connection pooling reuse without cleanup | Cross-user data leak | Explicit connection close on logout |
| Backup file path injection | OS command injection | Validate paths, no shell expansion |
| SQL injection via query builder | Database compromise | Parameterized generation, not string concat |
| Missing Azure AD token refresh | Token expiry during operation | Proactive refresh, clear error on expiry |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Works locally but not on real SQL Server" | Frustration, abandoned feature | Backend-first development |
| Complex visual components breaking editor layout | Editor unusable when feature open | Panel-based layout with clear boundaries |
| Confirmation fatigue on backup/restore | Users ignoring warnings | Contextual confirmations, not blanket |
| Missing index suggestions overwhelming | Users ignore all suggestions | Prioritized, limited, contextual |
| Visual query builder producing wrong SQL | Query errors, loss of trust | Always show generated SQL, validate early |
| Job viewer showing stale status | "Why isn't job running?" confusion | Refresh indicator, last-seen timestamp |

---

## "Looks Done But Isn't" Checklist

- [ ] **Visual Table Designer:** Often missing column reordering, constraint naming, index editor — verify all DDL generatable
- [ ] **ER Viewer:** Often missing self-referential FKs, many-to-many junctions, schema filtering — verify comprehensive
- [ ] **Execution Plan Viewer:** Often missing runtime statistics, missing index details, operator tooltips — verify completeness
- [ ] **Stored Procedure Editor:** Often missing parameter parsing, syntax validation, IntelliSense — verify live checking
- [ ] **Query Optimization Advisor:** Often missing impact scoring, index overlap detection — verify actionable guidance
- [ ] **SQL Agent Job Viewer:** Often missing step outcomes, schedule details, 30-day history — verify comprehensive state
- [ ] **Backup/Restore GUI:** Often missingVerifyPoint recovery, backup verification, progress tracking — verify safety features
- [ ] **Visual Query Builder:** Often missing complex JOINs, subqueries, CTEs — verify scope boundaries
- [ ] **Query Result Charting:** Often missing chart saving, export, comparison — verify integration
- [ ] **Missing Index Detection:** Often missing overlap detection, existing index awareness — verify suggestions are unique

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Build features against sql.js | HIGH | Full feature rewrite when backend proxy arrives |
| State management collapse | HIGH | Introduce state architecture, migrate all state |
| Visual component memory leaks | MEDIUM | Audit event handlers, add disposal pattern |
| Execution plan parsing incomplete | MEDIUM | Research schema, add missing operators progressively |
| Credential exposure | CRITICAL | Rotate credentials, audit access, implement secure storage |
| Backup to wrong target | CRITICAL | Pre-flight checks, confirm dialogs, operation logging |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Backend Proxy Architecture | Phase 1 (Foundation) | Features execute real SQL against test server |
| State Management Collapse | Phase 1 (Foundation) | State changes tracked, no global pollution |
| Visual Component Architecture | Phase 2 (UI Architecture) | Visual features isolated, no editor breakage |
| Execution Plan XML Complexity | Phase 3 (Query Features) | Plan renders all operators, statistics complete |
| Credential Security | Phase 1 (Foundation) | No credentials in localStorage, memory cleared |
| Missing Index False Positives | Phase 3 (Query Features) | Overlap detection working, suggestions deduplicated |
| SQL Agent Job State | Phase 4 (Administration) | All job metadata accessible, history queryable |
| Backup/Restore Safety | Phase 4 (Administration) | Confirmations work, targets validated |
| Visual Query Builder Scope | Phase 3 (Query Features) | Generated SQL matches hand-written, simple cases work |
| Chart Integration | Phase 3 (Query Features) | Charts savable, connected to query history |

---

## Sources

- Azure Data Studio feature comparison with SSMS (Microsoft Learn) — shows what's actually implemented vs "preview"
- vscode-mssql extension architecture (GitHub) — shows how Microsoft built SQL tooling in VS Code
- sqltoolsservice (GitHub) — official Microsoft SQL Tools Service for connection management
- CONCERNS.md — existing codebase concerns informing pitfalls
- PROJECT.md — 10 target features and current architecture constraints

---
*Pitfalls research for: Browser-based SQL Server Management Studio v1.1 Professional Feature Suite*
*Researched: 2026-04-30*

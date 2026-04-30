# Roadmap: SQL Query Lab

**Phases:** 4
**Granularity:** coarse
**Coverage:** 43/43 v1 requirements mapped

## Phases

- [x] **Phase 1: Backend Proxy Foundation** - Secure connection management infrastructure
- [ ] **Phase 2: Connected Query Execution** - Query editor and live SQL Server execution
- [ ] **Phase 3: Object Explorer & Workspace** - Navigation tree and multi-tab workspace
- [ ] **Phase 4: Professional Polish** - Theming, shortcuts, formatting, visual tools

---

## Phase Details

### Phase 1: Backend Proxy Foundation

**Goal:** Backend proxy enables secure, authenticated SQL Server connections from browser

**Depends on:** Nothing (greenfield)

**Requirements:** CONN-01, CONN-02, CONN-03, CONN-04, CONN-05, CONN-07, CONN-08, PROF-01, PROF-02

**Success Criteria** (what must be TRUE):
1. User can open connection dialog and enter server name, authentication type, credentials
2. User can connect using SQL Server authentication (username/password)
3. User can connect using Windows integrated authentication (via backend NTLM/Kerberos)
4. User can connect using Azure Active Directory / Entra ID (for Azure SQL)
5. User can test connection before saving and see success/failure with clear error message
6. User can save connection (encrypted, backend-only storage, never in browser localStorage)
7. User can disconnect from active connection
8. Connection strings never stored in browser; credentials never logged or exposed to client
9. All queries validated and parameterized by proxy (no SQL injection vectors)

**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Backend proxy server (Hono, WebSocket, REST, mssql pool, encryption, auth)
- [x] 01-02-PLAN.md — Frontend integration (apiClient, connection dialog, live mode)

---

### Phase 2: Connected Query Execution

**Goal:** User can write, execute, and export results from live SQL Server queries

**Depends on:** Phase 1 (proxy must exist before queries can execute)

**Requirements:** EDIT-01, EDIT-02, EDIT-03, EDIT-04, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, PROF-03, PROF-04

**Success Criteria** (what must be TRUE):
1. User can write SQL in Monaco editor with T-SQL syntax highlighting
2. User gets T-SQL IntelliSense autocomplete for keywords, tables, and columns
3. User can execute query (F5 or Cmd+Enter) and see results stream row-by-row
4. User can cancel a running query with timeout (default 30s, configurable)
5. Query results display in sortable grid with column headers
6. User can export results to CSV format
7. User can export results to JSON format
8. Errors display with decoded SQL Server messages (not raw TDS codes)
9. Execution time shown for each query; row count shown for SELECT/INSERT/UPDATE/DELETE
10. Large result sets paginated (100-500 rows per page) with virtual scrolling for 100K+ rows

**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Frontend query editor, live WebSocket execution, streaming results, virtual scroll, CSV/JSON export

---

### Phase 3: Object Explorer & Workspace

**Goal:** User can navigate server objects and manage multiple query tabs with persistence

**Depends on:** Phase 2 (query engine must exist for tabs to have meaning)

**Requirements:** OBJE-01, OBJE-02, OBJE-03, OBJE-04, OBJE-05, OBJE-06, CONN-06, TAB-01, TAB-02, TAB-03, TAB-04, TAB-05, TAB-06, TAB-07, SNIP-01, SNIP-02, SNIP-03, SNIP-04, SNIP-05, PROF-05

**Success Criteria** (what must be TRUE):
1. User can view server hierarchy in tree: databases → tables → views → stored procedures → functions
2. User can expand tree nodes with lazy loading to reveal children
3. User can view table schema (columns, data types, constraints)
4. User can view stored procedure definition
5. User can refresh object tree and access context menus via right-click
6. User can organize saved connections into groups/favorites
7. User can open multiple query tabs, each with independent editor state and results
8. Tab content autosaves to localStorage (debounced) and restores on reload
9. Unsaved tabs show dirty indicator; close warns if dirty
10. User can reorder tabs via drag-and-drop
11. User can save, insert, edit, delete SQL snippets organized by categories
12. Built-in starter snippets available (SELECT TOP 100, INSERT, UPDATE, DELETE patterns)
13. Query history persists across sessions

**Plans:** TBD

**UI hint:** yes

---

### Phase 4: Professional Polish

**Goal:** Tool feels like a professional-grade IDE with VS Code conventions

**Depends on:** Phase 3 (core workspace must exist before polish)

**Requirements:** THEM-01, THEM-02, THEM-03, THEM-04, THEM-05, EDIT-05, EDIT-06, EDIT-07, VISU-01, VISU-02, VISU-03

**Success Criteria** (what must be TRUE):
1. Dark theme (VS Code-style) available as default
2. Light theme available as alternative
3. Theme respects system preference (auto dark/light)
4. Keyboard shortcuts follow VS Code conventions (Cmd/Ctrl+S save, Cmd/Ctrl+N new tab, etc.)
5. Focus indicators visible for accessibility (WCAG AA)
6. User can format SQL (prettify/beautify)
7. User can comment/uncomment selected lines
8. User can find and replace within editor
9. User can visually design tables (CREATE/ALTER via GUI) — v2 feature
10. User can view database diagrams (ER visualization) — v2 feature
11. User can view execution plans (XML plan parsing, visual flowchart) — v2 feature

**Plans:** TBD

**UI hint:** yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Backend Proxy Foundation | 2/2 | Complete | 2026-04-30 |
| 2. Connected Query Execution | 1/1 | Planned | - |
| 3. Object Explorer & Workspace | 0/1 | Not started | - |
| 4. Professional Polish | 0/1 | Not started | - |

---

*Last updated: 2026-04-30*
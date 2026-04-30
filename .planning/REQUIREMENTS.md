# Requirements: SQL Query Lab

**Defined:** 2026-04-30
**Core Value:** Professionals can manage SQL Server infrastructure from any browser, with zero setup and full feature parity with desktop SSMS.

## v1 Requirements

### Connection Management

- [ ] **CONN-01**: User can create connection to SQL Server via dialog (server name, authentication type)
- [ ] **CONN-02**: User can authenticate using SQL Server authentication (username/password)
- [ ] **CONN-03**: User can authenticate using Windows integrated authentication (via backend proxy)
- [ ] **CONN-04**: User can authenticate using Azure Active Directory / Entra ID (for Azure SQL)
- [ ] **CONN-05**: User can save connections to backend (encrypted, never stored in browser)
- [ ] **CONN-06**: User can organize connections into groups/favorites
- [ ] **CONN-07**: User can test connection before saving
- [ ] **CONN-08**: User can disconnect from active connection

### Object Explorer

- [ ] **OBJE-01**: User can view server hierarchy (databases, tables, views, stored procedures, functions)
- [ ] **OBJE-02**: User can expand tree nodes to reveal children (lazy loading)
- [ ] **OBJE-03**: User can view table schema (columns, types, constraints)
- [ ] **OBJE-04**: User can view stored procedure definition
- [ ] **OBJE-05**: User can refresh object tree
- [ ] **OBJE-06**: User can right-click objects for context menu actions

### Query Editor

- [ ] **EDIT-01**: User can write SQL in Monaco-based editor with syntax highlighting
- [ ] **EDIT-02**: User gets T-SQL IntelliSense autocomplete for keywords, tables, columns
- [ ] **EDIT-03**: User can execute query (F5 or Cmd+Enter)
- [ ] **EDIT-04**: User can cancel running query
- [ ] **EDIT-05**: User can format SQL (prettify/beautify)
- [ ] **EDIT-06**: User can comment/uncomment selected lines
- [ ] **EDIT-07**: User can find and replace within editor

### Query Execution

- [ ] **EXEC-01**: Query results stream row-by-row (no waiting for full result set)
- [ ] **EXEC-02**: Results display in grid with sortable columns
- [ ] **EXEC-03**: User can export results to CSV
- [ ] **EXEC-04**: User can export results to JSON
- [ ] **EXEC-05**: Errors display with decoded SQL Server error messages (not raw TDS codes)
- [ ] **EXEC-06**: Execution time shown for each query
- [ ] **EXEC-07**: Row count displayed for SELECT/INSERT/UPDATE/DELETE
- [ ] **EXEC-08**: Query timeout configurable (default 30 seconds)

### Multi-Tab Workspace

- [ ] **TAB-01**: User can open multiple query tabs
- [ ] **TAB-02**: Each tab maintains independent editor state and results
- [ ] **TAB-03**: Tab content autosaves to localStorage (debounced)
- [ ] **TAB-04**: User can restore previous session tabs on reload
- [ ] **TAB-05**: Unsaved tabs show dirty indicator
- [ ] **TAB-06**: User can close tabs (with unsaved warning if dirty)
- [ ] **TAB-07**: User can reorder tabs via drag-and-drop

### Snippets

- [ ] **SNIP-01**: User can save SQL snippets with name and category
- [ ] **SNIP-02**: User can insert snippet into current editor position
- [ ] **SNIP-03**: User can edit and delete saved snippets
- [ ] **SNIP-04**: User can organize snippets into categories
- [ ] **SNIP-05**: Built-in starter snippets (SELECT TOP 100, INSERT, UPDATE, DELETE patterns)

### Theming & UI

- [ ] **THEM-01**: Dark theme (VS Code-style) as default
- [ ] **THEM-02**: Light theme available
- [ ] **THEM-03**: Theme respects system preference (auto)
- [ ] **THEM-04**: Keyboard shortcuts follow VS Code conventions
- [ ] **THEM-05**: Focus indicators visible for accessibility

### Professional Features

- [ ] **PROF-01**: Connection string never stored in browser localStorage
- [ ] **PROF-02**: Backend proxy validates and parameterizes queries (prevents SQL injection)
- [ ] **PROF-03**: Large result sets paginated (100-500 rows per page)
- [ ] **PROF-04**: Virtual scrolling for results grid (handles 100K+ rows)
- [ ] **PROF-05**: Query history persisted across sessions

## v2 Requirements

### Visual Tools

- [ ] **VISU-01**: Visual table designer (CREATE/ALTER tables via GUI)
- [ ] **VISU-02**: Database diagram visualization (ER diagrams)
- [ ] **VISU-03**: Execution plan viewer (XML plan parsing, visual flowchart)

### Advanced

- [ ] **ADV-01**: Query optimization suggestions
- [ ] **ADV-02**: Missing index detection from execution plan
- [ ] **ADV-03**: Stored procedure debugger
- [ ] **ADV-04**: SQL Agent job viewer
- [ ] **ADV-05**: Backup/restore GUI

### Collaboration

- [ ] **COLL-01**: Share query tabs with team (read-only link)
- [ ] **COLL-02**: Query result sharing

## Out of Scope

| Feature | Reason |
|---------|--------|
| Database creation/deletion | Connection management tool only |
| Multi-server transactions | Single connection at a time |
| Mobile-first UI | Desktop professional tool |
| Native mobile apps | Browser-only |
| Full security admin | Permission management UI deferred to v2 |

## Traceability

### Phase 1: Backend Proxy Foundation

| Requirement | Description | Status |
|-------------|-------------|--------|
| CONN-01 | Connection dialog (server, auth type) | Pending |
| CONN-02 | SQL Server authentication | Pending |
| CONN-03 | Windows integrated authentication | Pending |
| CONN-04 | Azure Active Directory / Entra ID | Pending |
| CONN-05 | Save connections (encrypted, backend) | Pending |
| CONN-07 | Test connection before saving | Pending |
| CONN-08 | Disconnect from active connection | Pending |
| PROF-01 | Credentials never in browser storage | Pending |
| PROF-02 | Proxy validates/parameterizes queries | Pending |

### Phase 2: Connected Query Execution

| Requirement | Description | Status |
|-------------|-------------|--------|
| EDIT-01 | Monaco editor with T-SQL highlighting | Pending |
| EDIT-02 | T-SQL IntelliSense autocomplete | Pending |
| EDIT-03 | Execute query (F5 or Cmd+Enter) | Pending |
| EDIT-04 | Cancel running query | Pending |
| EXEC-01 | Row-by-row result streaming | Pending |
| EXEC-02 | Sortable results grid | Pending |
| EXEC-03 | Export results to CSV | Pending |
| EXEC-04 | Export results to JSON | Pending |
| EXEC-05 | Decoded SQL Server error messages | Pending |
| EXEC-06 | Execution time per query | Pending |
| EXEC-07 | Row count for DML operations | Pending |
| EXEC-08 | Configurable query timeout (default 30s) | Pending |
| PROF-03 | Large result set pagination (100-500 rows) | Pending |
| PROF-04 | Virtual scrolling (100K+ rows) | Pending |

### Phase 3: Object Explorer & Workspace

| Requirement | Description | Status |
|-------------|-------------|--------|
| OBJE-01 | Server hierarchy tree view | Pending |
| OBJE-02 | Lazy loading tree nodes | Pending |
| OBJE-03 | Table schema view | Pending |
| OBJE-04 | Stored procedure definition view | Pending |
| OBJE-05 | Refresh object tree | Pending |
| OBJE-06 | Context menu actions | Pending |
| CONN-06 | Connection groups/favorites | Pending |
| TAB-01 | Multiple query tabs | Pending |
| TAB-02 | Independent tab state | Pending |
| TAB-03 | Autosave to localStorage | Pending |
| TAB-04 | Restore previous session tabs | Pending |
| TAB-05 | Dirty indicator on unsaved tabs | Pending |
| TAB-06 | Close with unsaved warning | Pending |
| TAB-07 | Drag-and-drop tab reordering | Pending |
| SNIP-01 | Save SQL snippets | Pending |
| SNIP-02 | Insert snippet at cursor | Pending |
| SNIP-03 | Edit/delete saved snippets | Pending |
| SNIP-04 | Snippet categories | Pending |
| SNIP-05 | Built-in starter snippets | Pending |
| PROF-05 | Query history across sessions | Pending |

### Phase 4: Professional Polish

| Requirement | Description | Status |
|-------------|-------------|--------|
| THEM-01 | Dark theme (VS Code-style) | Pending |
| THEM-02 | Light theme | Pending |
| THEM-03 | System preference (auto) | Pending |
| THEM-04 | VS Code keyboard shortcuts | Pending |
| THEM-05 | Focus indicators (accessibility) | Pending |
| EDIT-05 | Format SQL (prettify/beautify) | Pending |
| EDIT-06 | Comment/uncomment lines | Pending |
| EDIT-07 | Find and replace | Pending |

### v2 Requirements (Future)

| Requirement | Description |
|-------------|-------------|
| VISU-01 | Visual table designer |
| VISU-02 | Database diagram visualization |
| VISU-03 | Execution plan viewer |
| ADV-01 | Query optimization suggestions |
| ADV-02 | Missing index detection |
| ADV-03 | Stored procedure debugger |
| ADV-04 | SQL Agent job viewer |
| ADV-05 | Backup/restore GUI |
| COLL-01 | Share query tabs (read-only) |
| COLL-02 | Share query results |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---

*Requirements defined: 2026-04-30*
*Last updated: 2026-04-30 after roadmap creation*

---
*Requirements defined: 2026-04-30*
*Last updated: 2026-04-30 after research synthesis*
# Requirements: SQL Query Lab

**Defined:** 2026-04-30
**Milestone:** v1.1 Professional Feature Suite
**Core Value:** Professionals can manage SQL Server infrastructure from any browser, with zero setup and full feature parity with desktop SSMS.

## v1 Requirements

Requirements for milestone v1.1. Each maps to roadmap phases.

### Query & Analysis

- [ ] **QUERY-03**: User can build SELECT queries visually by dragging tables and columns onto a canvas, with automatic JOIN detection based on foreign key relationships
- [ ] **QUERY-04**: User can chart query results as bar, line, or pie charts directly in the results panel without exporting
- [ ] **QUERY-05**: User can receive query optimization suggestions that analyze their SQL and recommend index additions or query restructuring
- [ ] **QUERY-06**: User can view detected missing indexes from execution plans with estimated impact and recommended CREATE INDEX statements

### Visual Design

- [ ] **VISUAL-03**: User can browse database schema as an interactive ER diagram showing tables, columns, data types, primary keys, foreign keys, and relationships with pan/zoom
- [ ] **VISUAL-04**: User can create and alter tables visually by defining columns, data types, constraints (PK, FK, UNIQUE, CHECK, DEFAULT), and indexes via a GUI form — generating equivalent DDL
- [ ] **VISUAL-05**: User can view execution plans as a visual flowchart parsed from XML Showplan output, with operator details, row counts, and cost breakdown

### Code / Stored Procedures

- [ ] **CODE-01**: User can view, edit, and create stored procedures with T-SQL syntax checking, parameter extraction, and GO batch separator support

### Administration

- [ ] **ADMIN-01**: User can view SQL Agent jobs, job steps, schedules, run history, and alerts in a browsable GUI with status indicators
- [ ] **ADMIN-02**: User can perform backup and restore operations via GUI with options for full/differential backups, point-in-time recovery, and backup verification

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced

- **ADV-06**: User can debug stored procedures with step-through execution, variable inspection, and call stack
- **ADV-07**: User can compare two database schemas and generate migration scripts
- **ADV-08**: User can generate test data sets based on table schemas and cardinality requirements

### Collaboration

- **COLL-03**: User can comment and annotate queries with shared annotations visible to team
- **COLL-04**: User can version control queries with basic version history and rollback

### Extended Administration

- **ADMIN-03**: User can manage database users, roles, and permissions via GUI
- **ADMIN-04**: User can view and analyze SQL Server error logs with filtering and search

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile-first UI | Desktop professional tool — mobile is secondary concern |
| Multi-server transactions | Single SQL Server connection at a time |
| Native mobile apps | Browser-only constraint maintained |
| Real-time query monitoring | Would require persistent WebSocket connections; defer to v2 |
| Full database creation/deletion | Connection management only — not schema design tool |
| Query result pivot tables | Complex to implement well; defer to v2 |
| Database deployment/DACPAC | Separate devops workflow — not core query tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| QUERY-03 | Phase 6 | Pending |
| QUERY-04 | Phase 6 | Pending |
| QUERY-05 | Phase 6 | Pending |
| QUERY-06 | Phase 6 | Pending |
| VISUAL-03 | Phase 5 | Pending |
| VISUAL-04 | Phase 5 | Pending |
| VISUAL-05 | Phase 5 | Pending |
| CODE-01 | Phase 5 | Pending |
| ADMIN-01 | Phase 7 | Pending |
| ADMIN-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---

*Requirements defined: 2026-04-30*
*Last updated: 2026-04-30 after v1.1 milestone scope*

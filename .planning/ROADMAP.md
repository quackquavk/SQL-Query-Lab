# Roadmap: SQL Query Lab v1.1

**Milestone:** v1.1 Professional Feature Suite
**Goal:** Transform the browser-based SQL tool into a full-featured professional SQL Server management studio
**Granularity:** Coarse
**Total Phases:** 3

---

## Phases

- [ ] **Phase 5: Visual Design Tools** — Interactive ER diagrams, visual table designer, and execution plan viewer
- [ ] **Phase 6: Query Tools** — Visual query builder, optimization advisor, and result charting
- [ ] **Phase 7: Administration** — SQL Agent job viewer and backup/restore GUI

---

## Phase Details

### Phase 5: Visual Design Tools
**Goal:** Users can visually explore database schemas, design tables, and analyze query execution plans

**Depends on:** Phase 4 (prior milestone)

**Requirements:** VISUAL-03, VISUAL-04, VISUAL-05, CODE-01

**Success Criteria** (what must be TRUE):
1. User can browse database schema as an interactive ER diagram showing tables, columns, data types, primary keys, foreign keys, and relationships with pan/zoom controls
2. User can create and alter tables visually by defining columns, data types, constraints (PK, FK, UNIQUE, CHECK, DEFAULT), and indexes via a GUI form — generating equivalent DDL that can be executed
3. User can view execution plans as a visual flowchart parsed from XML Showplan output, with operator details, row counts, and cost breakdown per operator
4. User can view, edit, and create stored procedures with T-SQL syntax checking, parameter extraction, and GO batch separator support

**Plans:** 4 plans
- [ ] 05-01-PLAN.md — ER diagram + table designer (frontend)
- [ ] 05-02-PLAN.md — Execution plan viewer (frontend)
- [ ] 05-03-PLAN.md — Stored procedure editor (frontend)
- [ ] 05-04-PLAN.md — Backend endpoints for visual tools

---

### Phase 6: Query Tools
**Goal:** Users can build queries visually, receive optimization guidance, and visualize results as charts

**Depends on:** Phase 5

**Requirements:** QUERY-03, QUERY-04, QUERY-05, QUERY-06

**Success Criteria** (what must be TRUE):
1. User can build SELECT queries visually by dragging tables and columns onto a canvas, with automatic JOIN detection based on foreign key relationships
2. User can chart query results as bar, line, or pie charts directly in the results panel without exporting to external tools
3. User can receive query optimization suggestions that analyze their SQL and recommend index additions or query restructuring with explanations
4. User can view detected missing indexes from execution plans with estimated impact and recommended CREATE INDEX statements

**Plans:** TBD

---

### Phase 7: Administration
**Goal:** Users can manage SQL Agent jobs and perform backup/restore operations through professional GUIs

**Depends on:** Phase 6

**Requirements:** ADMIN-01, ADMIN-02

**Success Criteria** (what must be TRUE):
1. User can view SQL Agent jobs, job steps, schedules, run history, and alerts in a browsable GUI with status indicators (enabled/disabled, success/failure)
2. User can perform backup and restore operations via GUI with options for full/differential backups, point-in-time recovery, and backup verification with confirmation dialogs

**Plans:** 2 plans
- [ ] 07-01-PLAN.md — SQL Agent Jobs + Backup/Restore modules (frontend + backend)
- [ ] 07-02-PLAN.md — Integration and wiring (object explorer, API client, route registration)

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Visual Design Tools | 0/4 | Not started | - |
| 6. Query Tools | 0/4 | Not started | - |
| 7. Administration | 0/2 | Not started | - |

---

*Created: 2026-04-30*
*Milestone: v1.1 Professional Feature Suite*

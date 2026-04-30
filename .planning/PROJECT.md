# SQL Query Lab Evolution

## What This Is

A professional-grade SQL Server management studio running entirely in the browser — direct competitor to SSMS, Azure Data Studio, and dbForge. Formerly a SQL learning tool, now rearchitected for real database professionals managing real SQL Server infrastructure.

## Core Value

Professionals can manage SQL Server infrastructure from any browser, with zero setup and full feature parity with desktop SSMS.

## Requirements

### Validated

- ✓ SQL learning/practice environment — existing
- ✓ Client-side SQL execution via sql.js — existing
- ✓ Multiple database support (hospital, company, school seeds) — existing
- ✓ Query history and draft persistence — existing
- ✓ SQL formatting and syntax highlighting — existing
- ✓ MS SQL (T-SQL) translation mode — existing

### Active

- [ ] Full SQL Server connection management (connection dialog, server explorer)
- [ ] Real SQL Server execution against live databases
- [ ] Query result export (CSV, JSON, Excel)
- [ ] Table designer (CREATE/ALTER tables visually)
- [ ] Database diagram visualization
- [ ] Stored procedure editor with syntax checking
- [ ] Execution plan viewer
- [ ] Query optimization suggestions
- [ ] Tab-based query workspace
- [ ] Snippet management with categories
- [ ] Connection grouping and favorites
- [ ] Dark/light professional themes
- [ ] Keyboard-driven workflow (full shortcuts)

### Out of Scope

- Mobile-first UI — desktop professional tool
- Native mobile apps — browser-only
- Database creation/deletion — connection management only
- Multi-database transactions across servers — single connection at a time

## Context

**Existing codebase:** SQL Query Lab built as a learning tool. Stack: vanilla JS, sql.js (SQLite in browser), CodeMirror, 13 JS modules, 8 CSS files. Client-only architecture.

**Vision shift:** Transform from learning environment to professional management studio. This requires:
- New connection architecture (real SQL Server, not sql.js)
- Backend proxy for SQL Server communication (Node.js or similar)
- Professional UI redesign (VS Code-inspired, not current minimal aesthetic)
- Feature parity with SSMS core functionality

**User research theme:** DBAs and developers frustrated with SSMS being Windows-only, Azure Data Studio being Electron-heavy, and wanting browser-based work.

## Constraints

- **Browser-based**: Must work entirely in browser — no desktop app
- **Cross-platform**: Must work on macOS, Windows, Linux equally
- **Backend required**: Real SQL Server needs a proxy (cannot use sql.js for live connections)
- **Professional audience**: DBAs, developers — not learners

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser-only | Accessibility, no install, cross-platform | — Pending |
| Backend proxy for SQL Server | sql.js can't connect to real servers | — Pending |
| VS Code-inspired UI | Professional standard, familiar to target users | — Pending |
| Connection string storage | Encrypted at rest, never logged | — Pending |

---

*Last updated: 2026-04-30 after vision reorientation*
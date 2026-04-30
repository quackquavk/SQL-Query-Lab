# Phase 7: Administration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 7-administration
**Areas discussed:** Job Browser Layout, Job Interactions, Backup UI Structure, Backup/Restore Feedback

---

## SQL Agent Jobs — Layout & Data

| Option | Description | Selected |
|--------|-------------|----------|
| Tree + List (SSMS-style) | Familiar to DBA users, natural hierarchy | ✓ |
| Flat searchable list (ADS-style) | Faster scanning, simpler UI | |
| Cards with status badges | Visual, quick status scan | |

**User's choice:** Tree + List hybrid — balances familiar SSMS pattern with modern usability. Existing object explorer (Phase 3) already uses tree structure, this extends it naturally.
**Notes:** Agent applied best judgment. Status indicators: green/yellow/red/gray with icon badges. Job details in right panel with tabs (Overview, Steps, Schedules, History, Alerts).

---

## SQL Agent Jobs — Interactions

| Option | Description | Selected |
|--------|-------------|----------|
| All job controls (Start, Stop, Enable, Disable, View, Properties) | Standard job control | ✓ |
| View only | Just view history and properties | |
| Start/Stop + view history | Limited controls | |

**User's choice:** All job controls (Recommended)
**Notes:** Agent applied best judgment. Right-click context menu, immediate feedback with state refresh, history pagination (50 runs default).

---

## Backup/Restore — Operations UI

| Option | Description | Selected |
|--------|-------------|----------|
| Modal dialog with tabbed sections | Non-blocking, guided with tabs | ✓ |
| Multi-step wizard | Guided UX, progressive disclosure | |
| Full-page panel | Maximum space for options | |

**User's choice:** Agent applied best judgment — modal dialog with tabbed sections (General, Options, Destination). Restore uses separate multi-step wizard. Confirmation requires typing database name to confirm.

---

## Backup/Restore — State & Feedback

| Approach | Description | Selected |
|----------|-------------|----------|
| WebSocket progress + VERIFYONLY | Real-time progress, auto-verify after | ✓ |
| Polling with manual verify | Simpler, less real-time | |
| Background with notification | Fire and forget | |

**User's choice:** Agent applied best judgment — WebSocket streaming for progress, post-operation verification via `RESTORE VERIFYONLY`, toast on completion.

---

## Agent's Discretion

- Exact tree node styling (icon sizes, indentation, expand/collapse animations)
- Progress bar visual design (thin bar vs block progress, animation)
- Confirmation dialog exact wording and layout
- Error message formatting and detail expansion

## Deferred Ideas

- ADMIN-03 (User/Role Management) — belongs in future phase
- ADMIN-04 (Error Log Viewer) — deferred to future phase
- Backup to URL (Azure Blob) — not in v1.1 scope
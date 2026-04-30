# Phase 7: Administration - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can manage SQL Agent jobs and perform backup/restore operations through professional GUIs. Phase 7 delivers:
- SQL Agent job browser with tree/list navigation, status indicators, job steps, schedules, run history, and alerts
- Backup/Restore GUI with full/differential backups, point-in-time recovery, backup verification, and confirmation dialogs

**Does NOT include:** User/role management (ADMIN-03, deferred to future), SQL Server error log viewer (ADMIN-04, deferred to future)

</domain>

<decisions>
## Implementation Decisions

### SQL Agent Jobs — Layout & Data
- **D-01:** **Tree + List hybrid layout** — left panel shows job folders/categories in tree hierarchy, clicking a job shows details in right panel with list tabs (Steps, Schedules, History, Alerts)
- **D-02:** **All job controls** — users can start, stop, enable, disable jobs, view run history, and view properties
- **D-03:** **Status indicators** — color-coded: green (success), yellow (in progress), red (failed), gray (disabled) with icon badges
- **D-04:** **Job details in right panel** — tabs for: Overview (enabled/disabled, last run, next run), Steps (list with type and outcome), Schedules (frequency, next run time), History (date, duration, outcome, error message), Alerts (linked alert names)

### SQL Agent Jobs — Interactions
- **D-05:** **Right-click context menu** on job tree nodes: Start, Stop, Enable, Disable, View History, Properties
- **D-06:** **Start/Stop actions** via backend endpoint (`POST /api/sql-agent/jobs/:name/start` and `/stop`) — immediate feedback, job state refreshes after action
- **D-07:** **History pagination** — load last 50 runs by default, "Load more" for older runs (backend paginated endpoint)
- **D-08:** **Alert notifications** — alerts show as badge counts on job tree, clicking opens alert detail in same right panel

### Backup/Restore — Operations UI
- **D-09:** **Modal dialog with tabbed sections** — single modal with tabs: General (backup type, database selection, backup set name), Options (compression, checksum, encryption), Destination (file path, URL, backup set expiration)
- **D-10:** **Restore wizard multi-step** — separate modal with steps: Select backups to restore → Select point-in-time (optional) → Select target database → Review and confirm
- **D-11:** **Backup type options** — Full, Differential, Transaction Log — radio group in General tab with different options per type (log backups show point-in-time picker)
- **D-12:** **Confirmation dialog** — shows backup/restore command that will be executed with "Copy command" option, "Execute" button requires user to type database name to confirm (prevents accidental restores)

### Backup/Restore — State & Feedback
- **D-13:** **Progress tracking via WebSocket** — backend streams progress events (percentage, current file, elapsed time), progress bar in modal with real-time updates
- **D-14:** **Post-operation verification** — after backup completes, automatically runs `RESTORE VERIFYONLY` and shows result in modal (checkmark or error with details)
- **D-15:** **Success/error feedback** — toast notification on completion, modal stays open with result summary. Errors show full error message and suggested actions (e.g., "Disk full — free space or use compression")

### Agent's Discretion
- Exact tree node styling (icon sizes, indentation, expand/collapse animations)
- Progress bar visual design (thin bar vs block progress, animation)
- Confirmation dialog exact wording and layout
- Error message formatting and detail expansion

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/ROADMAP.md` §Phase 7 — Phase 7 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §Administration — ADMIN-01, ADMIN-02

### Phase Context
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` — Backend decisions, Hono, WebSocket protocol
- `.planning/phases/02-connected-query-execution/02-CONTEXT.md` — CodeMirror 5, results grid, streaming
- `.planning/phases/03-object-explorer-workspace/03-CONTEXT.md` — Tab workspace, object explorer, tree structure
- `.planning/phases/04-professional-polish/04-CONTEXT.md` — Theme, keyboard shortcuts, search bar
- `.planning/phases/05-visual-design-tools/05-CONTEXT.md` — D3.js + dagre for visual rendering, modal pattern
- `.planning/phases/06-query-tools/06-CONTEXT.md` — Chart placement pattern, inline highlights

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture
- `.planning/codebase/STACK.md` — Current technology stack
- `.planning/codebase/CONVENTIONS.md` — 2-space indent, single quotes, ES modules, hook-injection pattern

### Backend (established patterns)
- `backend/routes/storedProcedures.js` — REST pattern for CRUD operations with headers for auth
- `backend/routes/executionPlan.js` — WebSocket streaming pattern, progress events
- `backend/services/sqlServer.js` — mssql connection management, pool per user/server

[No external specs — requirements fully captured in decisions above]

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `scripts/ui.js` — `renderResults()`, toast notifications, panel rendering; extend for job browser details panel
- `scripts/runtime.js` — `cursor` object; extend for `cursor.selectedJob`, `cursor.jobHistory`
- `styles/right-panel.css` — Existing sidebar styles; job details panel extends these with tabbed layout
- `styles/modal.css` — Existing modal styles; backup/restore dialogs use same pattern with tabs
- `scripts/editor.js` — CodeMirror remains; confirmation dialogs for destructive actions use same pattern

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setXxxHooks({ callback })`
- Debounced persistence: `debounce(fn, 400ms)`
- Template literals for HTML generation in render functions
- D3.js already chosen for visual rendering (Phase 5)
- WebSocket streaming already used for query results (Phase 2)

### Integration Points
- `index.html` — Add SQL Agent Jobs item to object explorer tree; add backup/restore modal
- `scripts/main.js` — Wire job browser interactions; wire backup/restore dialog open/close
- `scripts/apiClient.js` — Add `fetchSqlAgentJobs()`, `startJob()`, `stopJob()`, `fetchJobHistory()`, `fetchBackupHistory()` endpoints; add `executeBackup()` and `executeRestore()` endpoints
- `backend/` — Add SQL Agent routes (jobs list, job details, start/stop/enable/disable); add backup/restore endpoints with progress WebSocket streaming

### Backend Endpoints Needed
- `GET /api/sql-agent/jobs/:db` — list jobs with folder hierarchy
- `GET /api/sql-agent/job/:db/:name` — job details (steps, schedules, alerts)
- `GET /api/sql-agent/job/:db/:name/history` — paginated run history
- `POST /api/sql-agent/job/:db/:name/start` — start job
- `POST /api/sql-agent/job/:db/:name/stop` — stop job
- `POST /api/sql-agent/job/:db/:name/enable` — enable job
- `POST /api/sql-agent/job/:db/:name/disable` — disable job
- `POST /api/backup` — execute backup with options, stream progress via WebSocket
- `GET /api/backup/history/:db` — list existing backups
- `POST /api/restore` — execute restore with steps, stream progress
- `POST /api/restore/verify` — verify backup file integrity

</codebase_context>

<specifics>
## Specific Ideas

- Job tree nodes: folder icon for categories, cylinder/badge icon for jobs with status color overlay
- Job history shows: Run Date, Duration, Status, Message (error if failed), Run by (agent account)
- Backup dialog has "Test" button to validate destination path accessibility before execution
- Restore wizard shows database compatibility check before proceeding

</specifics>

<deferred>
## Deferred Ideas

### ADMIN-03 (User/Role Management)
- User can manage database users, roles, and permissions via GUI
- Belongs in future phase after Administration baseline is complete

### ADMIN-04 (Error Log Viewer)
- User can view and analyze SQL Server error logs with filtering and search
- Requires log parsing infrastructure, deferred to future phase

### Backup to URL (Cloud storage)
- Azure Blob Storage destination for backups
- Would add cloud auth flow, not in scope for v1.1

</deferred>

---

*Phase: 07-administration*
*Context gathered: 2026-04-30*
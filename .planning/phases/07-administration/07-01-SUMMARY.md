# Phase 07 Plan 01 Summary: SQL Agent Jobs + Backup/Restore Modules

**Plan:** 07-01
**Wave:** 1
**Phase:** Administration
**Commit:** 83388bf

## One-liner
SQL Agent Jobs browser with tree/list layout and status indicators, Backup/Restore modal dialogs with WebSocket progress streaming.

## Objective
Build SQL Agent Jobs browser and Backup/Restore frontend modules and backend routes to satisfy ADMIN-01 and ADMIN-02 requirements.

## Tasks Completed

| Task | Name | Status | Files |
|------|------|--------|-------|
| 1 | Create job browser frontend module | ✅ | scripts/jobBrowser.js, styles/job-browser.css |
| 2 | Add backend SQL Agent routes | ✅ | backend/routes/sqlAgentJobs.js |
| 3 | Create backup/restore frontend module | ✅ | scripts/backupRestore.js, styles/backup-restore.css |
| 4 | Add backend backup/restore routes | ✅ | backend/routes/backupRestore.js |

## Key Decisions

- SQL Agent Jobs uses msdb.dbo.sysjobs/syscategories/sysjobsteps/sysjobhistory for data
- Tree hierarchy: Category → Job (with status icons)
- Status icons: green (success), yellow (running), red (failed), gray (disabled)
- Backup modal: 3 tabs (General/Options/Destination), RESTORE VERIFYONLY after backup
- Restore wizard: 4 steps (Select Backup, Point-in-Time, Target Database, Confirm)
- Confirm requires typing database name exactly to enable Restore button
- WebSocket progress streaming at /api/backup-progress endpoint

## Files Created/Modified

### Created
- `scripts/jobBrowser.js` — Job tree rendering, tabbed details (Overview/Steps/Schedules/History/Alerts), context menu with Start/Stop/Enable/Disable
- `scripts/backupRestore.js` — Backup modal, restore wizard, WebSocket progress handling
- `styles/job-browser.css` — Tree styles, status icons, tab panels, context menu
- `styles/backup-restore.css` — Tab styles, wizard step indicators, progress bar
- `backend/routes/sqlAgentJobs.js` — REST endpoints for job CRUD and actions
- `backend/routes/backupRestore.js` — Backup/restore endpoints with RESTORE VERIFYONLY

### Modified
- `index.html` — Added job-browser.css and backup-restore.css imports

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sql-agent/jobs/:db` | GET | List all jobs with category hierarchy |
| `/api/sql-agent/job/:db/:name` | GET | Job details (overview, steps, schedules, alerts) |
| `/api/sql-agent/job/:db/:name/history` | GET | Paginated run history |
| `/api/sql-agent/job/:db/:name/start` | POST | Start a job |
| `/api/sql-agent/job/:db/:name/stop` | POST | Stop a job |
| `/api/sql-agent/job/:db/:name/enable` | POST | Enable a job |
| `/api/sql-agent/job/:db/:name/disable` | POST | Disable a job |
| `/api/backup` | POST | Execute backup with WebSocket progress |
| `/api/backup/history/:db` | GET | List backup history |
| `/api/restore` | POST | Execute restore |
| `/api/restore/verify` | POST | Verify backup file integrity |

## Deviations
- Fixed duplicate `executeRestore` function name conflict in backupRestore.js (renamed local wizard function to `executeRestoreWizard`)

## Self-Check
- ✅ scripts/jobBrowser.js exports `initJobBrowser`
- ✅ backend/routes/sqlAgentJobs.js contains `/api/sql-agent` routes and `sp_start_job`
- ✅ scripts/backupRestore.js exports `openBackupModal`
- ✅ backend/routes/backupRestore.js contains `/api/backup` routes and WebSocket handler
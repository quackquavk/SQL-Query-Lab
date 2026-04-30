# Phase 07 Plan 02 Summary: Integration and Wiring

**Plan:** 07-02
**Wave:** 2
**Phase:** Administration
**Commit:** b76f7f1
**Depends on:** 07-01

## One-liner
Wired SQL Agent Jobs and Backup/Restore into the application object explorer, menu, and API client layer.

## Objective
Integrate SQL Agent Jobs and Backup/Restore components into the main application: add to object explorer tree, register backend routes, add API client functions, and wire up menu actions.

## Tasks Completed

| Task | Name | Status | Files |
|------|------|--------|-------|
| 1 | Add SQL Agent Jobs to object explorer and menu | ✅ | index.html, scripts/main.js, scripts/ui.js |
| 2 | Add API client functions for admin features | ✅ | scripts/apiClient.js |
| 3 | Register backend routes | ✅ | backend/server.js |

## Key Decisions

- SQL Agent Jobs node added under each database in object explorer tree
- Click on SQL Agent Jobs node → `initJobBrowser()` renders job browser in results area
- Backup/Restore menu items added to "..." menu dropdown
- Keyboard shortcuts: Ctrl+Shift+B (backup), Ctrl+Shift+R (restore) — live mode only
- Hook injection pattern: `setJobBrowserHooks` and `setBackupRestoreHooks` wired in main.js

## Files Created/Modified

### Modified
- `index.html` — Added Backup Database... and Restore Database... menu items, CSS imports
- `scripts/main.js` — Imported jobBrowser/backupRestore modules, wired hooks, added menu handlers and keyboard shortcuts
- `scripts/ui.js` — Added SQL Agent Jobs to object explorer tree, added click handler for `sql-agent` node type
- `scripts/apiClient.js` — Added 11 new functions: fetchSqlAgentJobs, fetchJobDetails, fetchJobHistory, startJob, stopJob, enableJob, disableJob, executeBackup, fetchBackupHistory, executeRestore, verifyBackup
- `backend/server.js` — Registered /api/sql-agent and /api/backup routes

## Success Criteria Verification

- ✅ SQL Agent Jobs node appears in object explorer tree (under each database)
- ✅ Clicking SQL Agent Jobs shows job browser in right panel
- ✅ Database menu has "Backup Database..." and "Restore Database..." items
- ✅ Backup menu item opens backup modal with tabs
- ✅ Restore menu item opens restore wizard
- ✅ All API endpoints respond when called from frontend
- ✅ Keyboard shortcuts Ctrl+Shift+B and Ctrl+Shift+R work (live mode only)

## Self-Check
- ✅ grep confirms sql-agent and backup references in main.js and index.html
- ✅ 5 API client functions verified: fetchSqlAgentJobs, startJob, stopJob, executeBackup, fetchBackupHistory
- ✅ backend/server.js registers sql-agent and backup routes
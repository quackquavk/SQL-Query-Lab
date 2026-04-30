# Phase 7: Administration - Research

**Researched:** 2026-04-30
**Phase:** 07-administration
**Goal:** How to implement SQL Agent Jobs and Backup/Restore GUIs

---

## Domain Overview

Phase 7 implements two professional SQL Server administration features:

1. **SQL Agent Jobs Browser** — Tree+list GUI for browsing/managing SQL Agent jobs
2. **Backup/Restore GUI** — Modal dialogs for backup operations and multi-step restore wizard

Both features require backend proxy communication since they need live SQL Server access (cannot use sql.js).

---

## SQL Agent Jobs — Technical Research

### SQL Agent Data Model

SQL Agent jobs are stored in `msdb` database. Key tables:
- `dbo.sysjobs` — Job definitions (job_id, name, enabled, description)
- `dbo.sysjobsteps` — Job steps (step_id, step_name, command, subsystem)
- `dbo.sysjobschedules` — Job schedules (enabled, frequency, active_start_time)
- `dbo.sysjobhistory` — Run history (run_date, run_time, run_duration, run_status, message)
- `dbo.sysjobs_view` — Active job executions

### Key Queries

**List all jobs with folder hierarchy:**
```sql
SELECT j.job_id, j.name, j.enabled, j.description,
       s.owner_sid, s.name AS owner_name
FROM msdb.dbo.sysjobs j
JOIN master.dbo.syslogins s ON j.owner_sid = s.sid
ORDER BY j.name
```

**Job details (steps, schedules):**
```sql
-- Steps
SELECT step_id, step_name, subsystem, command, on_success_action, on_failure_action
FROM msdb.dbo.sysjobsteps
WHERE job_id = @job_id

-- Schedules
SELECT s.name, s.enabled, s.freq_type, s.freq_interval, s.active_start_time,
       s.active_end_time, s.active_start_date, s.active_end_date
FROM msdb.dbo.sysjobschedules js
JOIN msdb.dbo.sysschedules s ON js.schedule_id = s.schedule_id
WHERE js.job_id = @job_id
```

**Run history (paginated):**
```sql
SELECT run_date, run_time, run_duration, run_status, message,
       step_id, step_name
FROM msdb.dbo.sysjobhistory
WHERE job_id = @job_id
ORDER BY run_date DESC, run_time DESC
```

**Current running jobs:**
```sql
SELECT ja.session_id, ja.job_id, ja.start_execution_date, ja.last_execution_date,
       j.name AS job_name
FROM msdb.dbo.sysjobactivity ja
JOIN msdb.dbo.sysjobs j ON ja.job_id = j.job_id
WHERE ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL
```

### Job Control Operations

**Start job:**
```sql
EXEC msdb.dbo.sp_start_job @job_id = @job_id  -- or @job_name
```

**Stop job:**
```sql
EXEC msdb.dbo.sp_stop_job @job_id = @job_id
```

**Enable/Disable job:**
```sql
EXEC msdb.dbo.sp_update_job @job_id = @job_id, @enabled = 1  -- or 0
```

### Alerts Integration

Job alerts are stored in `msdb.dbo.sysalerts` with a `job_id` reference. Join with `sysnotifications` to find recent alerts.

---

## Backup/Restore — Technical Research

### Backup Types

1. **Full Backup** — Complete database backup
2. **Differential Backup** — Changes since last full backup
3. **Transaction Log Backup** — Point-in-time recovery enabler

### Backup T-SQL

```sql
-- Full backup
BACKUP DATABASE @db_name TO DISK = @path
WITH COMPRESSION, CHECKSUM, NAME = @backup_set_name, STATS = 10

-- Differential backup
BACKUP DATABASE @db_name TO DISK = @path
WITH DIFFERENTIAL, COMPRESSION, CHECKSUM, NAME = @backup_set_name, STATS = 10

-- Transaction log backup
BACKUP LOG @db_name TO DISK = @path
WITH COMPRESSION, CHECKSUM, NAME = @backup_set_name, STATS = 10
```

### Restore T-SQL

```sql
-- Restore full backup
RESTORE DATABASE @db_name FROM DISK = @path
WITH NORECOVERY, REPLACE, STATS = 10

-- Restore differential
RESTORE DATABASE @db_name FROM DISK = @path
WITH NORECOVERY, STATS = 10

-- Restore transaction log (point-in-time)
RESTORE LOG @db_name FROM DISK = @path
WITH STOPAT = @point_in_time, RECOVERY, STATS = 10

-- Recover database (after all logs applied)
RESTORE DATABASE @db_name WITH RECOVERY
```

### Verify Backup

```sql
RESTORE VERIFYONLY FROM DISK = @path
WITH STATS = 10
```

### Backup History

```sql
SELECT bs.backup_set_id, bs.database_name, bs.backup_start_date, bs.backup_finish_date,
       bs.type, bs.backup_size, bs.compressed_backup_size,
       bs.media_set_id, mf.physical_device_name
FROM msdb.dbo.backupset bs
JOIN msdb.dbo.backupmediafamily mf ON bs.media_set_id = mf.media_set_id
WHERE bs.database_name = @db_name
ORDER BY bs.backup_start_date DESC
```

### Backup Set Name vs Media Set

- `BACKUP DATABASE` creates a **backup set** within a **media set** (tape/disk file)
- First backup to a file creates the media set; subsequent backups append
- `INIT` option overwrites the media set; `NOINIT` appends (default)
- For differential/log backups, must use same media set as last full backup

---

## WebSocket Progress Streaming

### Pattern Established (Phase 2, executionPlan.js)

Backend uses `ws` library for WebSocket streaming. Progress events:

```javascript
// Backend pattern (from executionPlan.js)
ws.send(JSON.stringify({
  type: 'progress',
  percent: 50,
  currentFile: 'database_backup.bak',
  elapsed: 1500,
  message: 'Writing backup data...'
}))
```

### Implementation for Backup

**Backend:**
```javascript
// In backup endpoint
async function executeBackup(dbName, options, ws) {
  // Stream progress to WebSocket client
  const connection = await sql.connect(config)
  
  await connection.query(sqlQuery, { /* params */ })
  
  // Progress updates during backup
  ws.send(JSON.stringify({
    type: 'progress',
    percent: Math.round((bytesWritten / totalBytes) * 100),
    currentFile: options.destination,
    elapsed: Date.now() - startTime
  }))
  
  // Completion
  ws.send(JSON.stringify({
    type: 'complete',
    success: true,
    backupSetId: result.recordset[0].backup_set_id
  }))
}
```

**Frontend:**
```javascript
// WebSocket client
const ws = new WebSocket(wsUrl)
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.type === 'progress') {
    updateProgressBar(data.percent)
  } else if (data.type === 'complete') {
    showSuccess(data)
  }
}
```

---

## Frontend Patterns

### Tree + List Hybrid (Job Browser)

**Reference Pattern:** Object Explorer tree from Phase 3 (`03-CONTEXT.md`)

Tree structure:
- Root: "SQL Agent" node
- Level 1: Job categories/folders
- Level 2: Individual jobs with status icon

Selected job → right panel with tabbed details.

**Tab Structure:**
```
[Overview] [Steps] [Schedules] [History] [Alerts]
```

Each tab renders a list/grid of data.

### Modal with Tabs (Backup Dialog)

**Reference Pattern:** Modal system from Phase 5 (`modal.css`)

```
╔══════════════════════════════════════════════════════╗
║  Backup Database                                [X] ║
╠══════════════════════════════════════════════════════╣
║  [General] [Options] [Destination]                  ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  (tab content)                                       ║
║                                                      ║
║                         [Cancel]  [Execute Backup]  ║
╚══════════════════════════════════════════════════════╝
```

### Multi-Step Wizard (Restore)

**Step indicator:**
```
Step 1 of 4: Select Backup
  ●───────────────────────────────────○──○──○

Step 2 of 4: Point-in-Time
  ○──●────────────────────────────────○──○

Step 3 of 4: Target Database
  ○──○──●──────────────────────────────○

Step 4 of 4: Confirm
  ○──○──○──●─────────────────────────────
```

Each step has Back/Next buttons. Final step has "Restore" button.

### Context Menu (Job Actions)

Right-click on tree node shows menu:
```
┌──────────────────┐
│ ▶  Start Job     │
│ ⏹  Stop Job     │
│ ✓  Enable Job   │
│ ✗  Disable Job  │
│ ──────────────── │
│ 📋 View History │
│ ⚙  Properties   │
└──────────────────┘
```

### Confirmation Pattern (Destructive Actions)

**Reference:** Confirmation dialog from Phase 6 (DELETE with typing confirmation)

```
╔══════════════════════════════════════════════════════╗
║  ⚠️  Confirm Restore                                  ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  You are about to restore "production_db" to:        ║
║  2026-04-30 14:32:00                                 ║
║                                                      ║
║  This will overwrite the current database.          ║
║                                                      ║
║  Type "production_db" to confirm:                   ║
║  ┌────────────────────────────────────────┐         ║
║  │                                        │         ║
║  └────────────────────────────────────────┘         ║
║                                                      ║
║                    [Cancel]  [Restore]              ║
╚══════════════════════════════════════════════════════╝
```

---

## State Management

### Frontend State Additions

```javascript
// runtime.js additions
cursor: {
  // ... existing
  selectedJob: null,        // Currently selected job name
  jobHistory: [],           // Current job run history
  backupProgress: null,     // { percent, currentFile, elapsed }
  restoreStep: 1,           // Current wizard step (1-4)
}
```

### Backend Session State

Each WebSocket connection tied to user session. Connection pool per user/server (established in Phase 1).

---

## Error Handling

### SQL Agent Errors

- Job not found: `SQL Server error: 14274` — Cannot update job that does not exist
- Permission denied: `SQL Server error: 229` — Execute permission denied on procedure
- Job already running: `SQL Server error: 22022` — SQLAgent error: Job is already running

### Backup/Restore Errors

- Database in use: `RESTORE database error: 3154` — The database cannot be restored over itself
- Insufficient disk space: `Backup/Restore error: 3201` — Cannot open backup device
- Corrupt backup: `RESTORE VERIFYONLY error: 3136` — The media family on device is incorrectly formed

Error messages should be surfaced with suggested actions.

---

## Security Considerations

1. **EXECUTE permission on `sp_start_job`, `sp_stop_job`** — Only db_ddladmin or sysadmin
2. **Backup/Restore require db_backupoperator** — Minimum role for backups
3. **Connection pool isolation** — User A cannot see User B's jobs
4. **No server-level destruction** — Cannot drop databases, drop logins, etc.

---

## Validation Architecture

**Testing approach for admin features:**

1. **Unit tests:** API endpoint responses (mocked SQL Server)
2. **Integration tests:** Real SQL Server container (if available)
3. **UI tests:** Playwright for modal flows, wizard navigation

**Key validation scenarios:**

### SQL Agent Jobs
- Jobs list loads and displays correctly (tree structure)
- Job details tabs show correct data
- Start/Stop/Enable/Disable actions execute successfully
- History pagination works
- Right-click context menu appears and actions work

### Backup/Restore
- Backup modal tabs switch correctly
- All backup types (Full/Diff/Log) can be configured
- Progress bar updates in real-time
- RESTORE VERIFYONLY runs after backup
- Restore wizard steps through correctly
- Confirmation typing prevents accidental restore

---

## Pitfalls & Gotchas

### SQL Agent

1. **Job history retention** — `sysjobhistory` has limited retention (days configurable). Don't assume full history available.
2. **Category is not folder** — Jobs have `category_id` referencing `syscategories`, but there's no native "folder" hierarchy. Implement client-side grouping by category name.
3. **Owner vs execute_as** — Job may run under `executes_as` user, not owner. Show who it's configured to run as.

### Backup/Restore

1. **Differential requires FULL first** — Cannot take differential if no full backup exists. Validate this before allowing differential backup.
2. **Point-in-time needs LOG backup** — Can only do point-in-time restore if database is in full or bulk-logged recovery model with log backups.
3. **RESTORE VERIFYONLY is separate** — Must run as explicit command after backup; not automatic.
4. **Database must be accessible** — Cannot restore database if it's in use by other connections. May need `ALTER DATABASE SET SINGLE_USER`.
5. **No OVERWRITE without REPLACE** — Must explicitly use REPLACE to overwrite existing database.

---

## Implementation Approach

### Task 1: SQL Agent Jobs (Admin-01)

**Backend:**
- New route file `backend/routes/sqlAgentJobs.js`
- Endpoints: list jobs, job details, job history, start/stop/enable/disable
- Uses `msdb.dbo.sp_help_job`, `sp_start_job`, `sp_stop_job`, `sp_update_job`

**Frontend:**
- `scripts/jobBrowser.js` — Job tree rendering, tab panels
- `styles/job-browser.css` — Tree styles, status indicator colors
- Add to object explorer tree in `index.html`
- Wire in `main.js`

### Task 2: Backup/Restore (Admin-02)

**Backend:**
- New route file `backend/routes/backupRestore.js`
- Endpoints: execute backup, list backup history, execute restore, verify backup
- WebSocket streaming for progress

**Frontend:**
- `scripts/backupRestore.js` — Modal rendering, wizard flow
- Add backup/restore modal to `index.html`
- Wire in `main.js`

### Task 3: Backend Integration

- `backend/routes/index.js` — Register new routes
- `scripts/apiClient.js` — Add API functions

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job hierarchy | Client-side grouping by category | SQL Agent has no native folder hierarchy |
| Progress streaming | WebSocket (already used in Phase 2) | Real-time feedback for long-running operations |
| Wizard state | Frontend state machine | Wizard steps are UI-only; backend stateless |
| Job action feedback | Immediate + refresh | Optimistic UI with eventual consistency |
| Restore confirmation | Type-to-confirm pattern | Prevents accidental restores (Phase 6 established) |

---

## Dependencies on Prior Phases

- **Phase 1:** Backend proxy foundation — WebSocket pattern, connection pooling
- **Phase 3:** Object explorer tree — Reuse tree structure for job browser
- **Phase 5:** Modal pattern — Extend for backup dialog with tabs
- **Phase 6:** Confirmation dialogs — Reuse typing confirmation pattern

---

*Research complete: 2026-04-30*
*Agent: gsd-phase-researcher*

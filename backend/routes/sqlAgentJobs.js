// SQL Agent Jobs backend routes
import { Hono } from 'hono';
import { getPool } from '../services/sqlServer.js';

const sqlAgentJobs = new Hono();

function getConnInfo(c) {
  return {
    userId: c.req.header('x-user-id') || 'anonymous',
    server: c.req.header('x-server') || process.env.DEFAULT_SERVER,
    authType: c.req.header('x-auth-type') || 'sql',
    credentials: JSON.parse(c.req.header('x-credentials') || '{}')
  };
}

// GET /api/sql-agent/jobs/:db — List all jobs with category hierarchy
sqlAgentJobs.get('/jobs/:db', async (ctx) => {
  const { db } = ctx.req.param();
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });

    const result = await pool.request().query(`
      SELECT
        j.name,
        j.enabled,
        j.description,
        c.name AS category,
        j.last_run_date,
        CASE
          WHEN j.current_execution_step_id IS NOT NULL THEN 'running'
          WHEN j.last_run_outcome = 0 THEN 'failed'
          WHEN j.last_run_outcome = 1 THEN 'succeeded'
          ELSE 'unknown'
        END AS status
      FROM msdb.dbo.sysjobs j
      LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
      ORDER BY c.name, j.name
    `);

    const jobs = result.recordset.map(row => ({
      name: row.name,
      enabled: Boolean(row.enabled),
      description: row.description || '',
      category: row.category || 'Uncategorized',
      lastRun: row.last_run_date,
      status: row.status || 'unknown'
    }));

    return ctx.json({ jobs });
  } catch (err) {
    console.error('Error fetching SQL Agent jobs:', err);
    return ctx.json({ error: err.message }, 500);
  }
});

// GET /api/sql-agent/job/:db/:name — Job details (steps, schedules, alerts)
sqlAgentJobs.get('/job/:db/:name', async (ctx) => {
  const { db, name } = ctx.req.param();
  const decodedName = decodeURIComponent(name);
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });

    // Overview
    const overviewResult = await pool.request()
      .input('jobName', decodedName)
      .query(`
        SELECT
          j.name,
          j.enabled,
          j.description,
          c.name AS category,
          j.owner_sid,
          j.last_run_date,
          j.next_run_date,
          j.last_run_outcome,
          CASE
            WHEN j.current_execution_step_id IS NOT NULL THEN 'running'
            WHEN j.last_run_outcome = 0 THEN 'failed'
            WHEN j.last_run_outcome = 1 THEN 'succeeded'
            ELSE 'idle'
          END AS status
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
        WHERE j.name = @jobName
      `);

    const overview = overviewResult.recordset[0] || null;

    // Steps
    const stepsResult = await pool.request()
      .input('jobName', decodedName)
      .query(`
        SELECT step_id, step_name, subsystem, command, last_run_outcome, last_run_duration
        FROM msdb.dbo.sysjobsteps
        WHERE job_id IN (SELECT job_id FROM msdb.dbo.sysjobs WHERE name = @jobName)
        ORDER BY step_id
      `);

    const steps = stepsResult.recordset.map(row => ({
      name: row.step_name,
      type: row.subsystem,
      command: row.command,
      outcome: row.last_run_outcome === 0 ? 'Failed' : row.last_run_outcome === 1 ? 'Succeeded' : 'Unknown',
      duration: row.last_run_duration
    }));

    // Schedules
    const schedResult = await pool.request()
      .input('jobName', decodedName)
      .query(`
        SELECT s.name, s.freq_type, s.freq_interval, s.freq_subday_type, s.freq_subday_interval, s.active_start_time, js.next_run_date
        FROM msdb.dbo.sysjobschedules js
        JOIN msdb.dbo.sysschedules s ON js.schedule_id = s.schedule_id
        WHERE js.job_id IN (SELECT job_id FROM msdb.dbo.sysjobs WHERE name = @jobName)
      `);

    const schedules = schedResult.recordset.map(row => ({
      name: row.name,
      frequency: describeFrequency(row.freq_type, row.freq_interval),
      nextRun: row.next_run_date ? new Date(row.next_run_date).toLocaleString() : 'Not scheduled'
    }));

    // Alerts
    const alertsResult = await pool.request()
      .input('jobName', decodedName)
      .query(`
        SELECT a.name
        FROM msdb.dbo.sysalerts a
        JOIN msdb.dbo.sysjobalerts ja ON a.id = ja.alert_id
        WHERE ja.job_id IN (SELECT job_id FROM msdb.dbo.sysjobs WHERE name = @jobName)
      `);

    const alerts = alertsResult.recordset.map(row => ({ name: row.name }));

    if (!overview) {
      return ctx.json({ error: 'Job not found' }, 404);
    }

    return ctx.json({
      overview: {
        name: overview.name,
        enabled: Boolean(overview.enabled),
        description: overview.description || '',
        category: overview.category || 'Uncategorized',
        owner: overview.owner_sid,
        lastRunDate: overview.last_run_date ? new Date(overview.last_run_date).toLocaleString() : null,
        nextRunDate: overview.next_run_date ? new Date(overview.next_run_date).toLocaleString() : null,
        status: overview.status
      },
      steps,
      schedules,
      alerts
    });
  } catch (err) {
    console.error('Error fetching job details:', err);
    return ctx.json({ error: err.message }, 500);
  }
});

// GET /api/sql-agent/job/:db/:name/history — Paginated run history
sqlAgentJobs.get('/job/:db/:name/history', async (ctx) => {
  const { db, name } = ctx.req.param();
  const decodedName = decodeURIComponent(name);
  const page = parseInt(ctx.req.query('page') || '0');
  const pageSize = parseInt(ctx.req.query('pageSize') || '50');
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });

    const countResult = await pool.request()
      .input('jobName', decodedName)
      .query(`
        SELECT COUNT(*) as total
        FROM msdb.dbo.sysjobhistory h
        WHERE h.job_id IN (SELECT job_id FROM msdb.dbo.sysjobs WHERE name = @jobName)
          AND h.step_id > 0
      `);
    const total = countResult.recordset[0]?.total || 0;

    const offset = page * pageSize;
    const historyResult = await pool.request()
      .input('jobName', decodedName)
      .query(`
        SELECT TOP ${pageSize}
          h.instance_id, h.step_id, h.step_name, h.sql_message_id, h.sql_severity,
          h.message, h.run_status, h.run_date, h.run_time, h.run_duration,
          h.operator_id_emailed, h.operator_id_netsent, h.operator_id_paged
        FROM msdb.dbo.sysjobhistory h
        WHERE h.job_id IN (SELECT job_id FROM msdb.dbo.sysjobs WHERE name = @jobName)
          AND h.step_id > 0
        ORDER BY h.instance_id DESC
        OFFSET ${offset} ROWS
      `);

    const history = historyResult.recordset.map(row => ({
      runDate: formatRunDateTime(row.run_date, row.run_time),
      duration: formatDuration(row.run_duration),
      status: row.run_status === 0 ? 'Failed' : row.run_status === 1 ? 'Succeeded' : row.run_status === 2 ? 'Retry' : row.run_status === 3 ? 'Canceled' : 'Unknown',
      message: row.message || ''
    }));

    return ctx.json({ history, total, hasMore: (page + 1) * pageSize < total });
  } catch (err) {
    console.error('Error fetching job history:', err);
    return ctx.json({ error: err.message }, 500);
  }
});

// POST /api/sql-agent/job/:db/:name/start
sqlAgentJobs.post('/job/:db/:name/start', async (ctx) => {
  const { db, name } = ctx.req.param();
  const decodedName = decodeURIComponent(name);
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });
    await pool.request()
      .input('jobName', decodedName)
      .query('EXEC msdb.dbo.sp_start_job @job_name = @jobName');
    return ctx.json({ success: true });
  } catch (err) {
    console.error('Error starting job:', err);
    const msg = err.message || '';
    if (msg.includes('already running')) {
      return ctx.json({ success: false, error: 'Job is already running' }, 409);
    }
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/sql-agent/job/:db/:name/stop
sqlAgentJobs.post('/job/:db/:name/stop', async (ctx) => {
  const { db, name } = ctx.req.param();
  const decodedName = decodeURIComponent(name);
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });
    await pool.request()
      .input('jobName', decodedName)
      .query('EXEC msdb.dbo.sp_stop_job @job_name = @jobName');
    return ctx.json({ success: true });
  } catch (err) {
    console.error('Error stopping job:', err);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/sql-agent/job/:db/:name/enable
sqlAgentJobs.post('/job/:db/:name/enable', async (ctx) => {
  const { db, name } = ctx.req.param();
  const decodedName = decodeURIComponent(name);
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });
    await pool.request()
      .input('jobName', decodedName)
      .query('EXEC msdb.dbo.sp_update_job @job_name = @jobName, @enabled = 1');
    return ctx.json({ success: true });
  } catch (err) {
    console.error('Error enabling job:', err);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/sql-agent/job/:db/:name/disable
sqlAgentJobs.post('/job/:db/:name/disable', async (ctx) => {
  const { db, name } = ctx.req.param();
  const decodedName = decodeURIComponent(name);
  const { userId, server, authType, credentials } = getConnInfo(ctx);

  try {
    const pool = await getPool(userId, server, authType, { ...credentials, database: 'msdb' });
    await pool.request()
      .input('jobName', decodedName)
      .query('EXEC msdb.dbo.sp_update_job @job_name = @jobName, @enabled = 0');
    return ctx.json({ success: true });
  } catch (err) {
    console.error('Error disabling job:', err);
    return ctx.json({ success: false, error: err.message }, 500);
  }
});

function describeFrequency(freqType) {
  switch (freqType) {
    case 1: return 'Once';
    case 4: return 'Daily';
    case 8: return 'Weekly';
    case 16: return 'Monthly';
    case 32: return 'When CPU is idle';
    default: return `Type ${freqType}`;
  }
}

function formatRunDateTime(runDate, runTime) {
  if (!runDate) return '';
  const dateStr = String(runDate).padStart(8, '0');
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 2) || '01';
  const day = dateStr.slice(6, 2) || '01';
  const timeStr = String(runTime || 0).padStart(6, '0');
  const hh = timeStr.slice(0, 2);
  const mm = timeStr.slice(2, 2);
  const ss = timeStr.slice(4, 2);
  return `${year}-${month}-${day} ${hh}:${mm}:${ss}`;
}

function formatDuration(duration) {
  if (!duration) return '00:00:00';
  const d = String(duration).padStart(6, '0');
  const hh = d.slice(0, 2);
  const mm = d.slice(2, 2);
  const ss = d.slice(4, 2);
  return `${hh}:${mm}:${ss}`;
}

export default sqlAgentJobs;
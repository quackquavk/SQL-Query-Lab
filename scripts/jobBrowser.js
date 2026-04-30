// SQL Agent Jobs browser module
// Displays jobs in tree + list layout with status indicators, tabbed details, and job controls

let _hooks = {
  showFeedback: () => {},
  switchTab: () => {}
};

export function setJobBrowserHooks({ showFeedback, switchTab }) {
  _hooks.showFeedback = showFeedback;
  _hooks.switchTab = switchTab;
}

// Current job browser state
let _currentJobs = [];
let _currentJobName = null;
let _jobHistoryPage = 0;

export async function initJobBrowser() {
  // Render the job browser container in the right panel area
  const center = document.querySelector('.center');
  if (!center) return;

  // Find the results div and swap in job browser
  const resultsBody = document.getElementById('resultsBody');
  if (resultsBody) {
    resultsBody.innerHTML = `
      <div class="job-browser" id="jobBrowser">
        <div class="job-browser-toolbar">
          <button class="btn btn-ghost" id="jobBrowserRefresh">
            <span class="ico">↻</span> Refresh
          </button>
        </div>
        <div class="job-browser-content">
          <div class="job-tree-panel" id="jobTreePanel">
            <div class="job-tree-header">SQL Agent Jobs</div>
            <div class="job-tree" id="jobTree"></div>
          </div>
          <div class="job-details-panel" id="jobDetailsPanel" style="display:none">
            <div class="job-details-header">
              <h3 id="jobDetailsTitle">Job Details</h3>
              <button class="close-btn" id="jobDetailsClose">×</button>
            </div>
            <div class="job-details-tabs">
              <button class="job-tab active" data-tab="overview">Overview</button>
              <button class="job-tab" data-tab="steps">Steps</button>
              <button class="job-tab" data-tab="schedules">Schedules</button>
              <button class="job-tab" data-tab="history">History</button>
              <button class="job-tab" data-tab="alerts">Alerts</button>
            </div>
            <div class="job-tab-content" id="jobTabContent"></div>
          </div>
        </div>
      </div>
    `;

    // Bind toolbar events
    document.getElementById('jobBrowserRefresh')?.addEventListener('click', loadJobTree);

    // Bind close button
    document.getElementById('jobDetailsClose')?.addEventListener('click', () => {
      document.getElementById('jobDetailsPanel').style.display = 'none';
    });

    // Bind tab buttons
    document.querySelectorAll('.job-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.job-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        renderJobTab(tab);
      });
    });

    // Load jobs
    await loadJobTree();
  }
}

async function loadJobTree() {
  const treeEl = document.getElementById('jobTree');
  if (!treeEl) return;

  try {
    const { fetchSqlAgentJobs } = await import('./apiClient.js');
    const data = await fetchSqlAgentJobs();
    _currentJobs = data.jobs || [];
    renderJobTree(_currentJobs);
  } catch (err) {
    treeEl.innerHTML = `<div class="job-tree-empty">Failed to load jobs: ${escapeHtml(err.message)}</div>`;
  }
}

export function renderJobTree(jobs) {
  const treeEl = document.getElementById('jobTree');
  if (!treeEl) return;

  if (!jobs || jobs.length === 0) {
    treeEl.innerHTML = '<div class="job-tree-empty">No SQL Agent jobs found</div>';
    return;
  }

  // Group by category
  const categories = {};
  for (const job of jobs) {
    const cat = job.category || 'Uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(job);
  }

  let html = '';
  for (const [catName, catJobs] of Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]))) {
    html += `<div class="job-category">`;
    html += `<div class="job-category-header" data-category="${escapeHtml(catName)}">`;
    html += `<span class="tree-toggle">▶</span>`;
    html += `<span class="tree-icon">📁</span>`;
    html += `<span class="tree-label">${escapeHtml(catName)}</span>`;
    html += `</div>`;
    html += `<div class="job-category-items" style="display:none">`;
    for (const job of catJobs.sort((a, b) => a.name.localeCompare(b.name))) {
      const statusIcon = getStatusIcon(job.status, job.enabled);
      html += `<div class="job-tree-item" data-job="${escapeHtml(job.name)}">`;
      html += `<span class="tree-spacer"></span>`;
      html += `<span class="tree-icon">${statusIcon}</span>`;
      html += `<span class="tree-label">${escapeHtml(job.name)}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
    html += `</div>`;
  }

  treeEl.innerHTML = html;

  // Bind category toggles
  document.querySelectorAll('.job-category-header').forEach(header => {
    header.addEventListener('click', () => {
      const items = header.nextElementSibling;
      const toggle = header.querySelector('.tree-toggle');
      if (items.style.display === 'none') {
        items.style.display = '';
        toggle.textContent = '▼';
      } else {
        items.style.display = 'none';
        toggle.textContent = '▶';
      }
    });
  });

  // Bind job item clicks
  document.querySelectorAll('.job-tree-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const jobName = item.dataset.job;
      renderJobDetails(jobName);

      // Highlight selected
      document.querySelectorAll('.job-tree-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const jobName = item.dataset.job;
      showJobContextMenu(jobName, e);
    });
  });
}

function getStatusIcon(status, enabled) {
  if (!enabled) return '<span class="status-icon status-disabled">○</span>';
  if (status === 'running') return '<span class="status-icon status-running">●</span>';
  if (status === 'failed') return '<span class="status-icon status-failed">●</span>';
  if (status === 'succeeded') return '<span class="status-icon status-success">●</span>';
  return '<span class="status-icon status-success">●</span>';
}

export async function renderJobDetails(jobName) {
  _currentJobName = jobName;
  _jobHistoryPage = 0;

  const panel = document.getElementById('jobDetailsPanel');
  const titleEl = document.getElementById('jobDetailsTitle');
  if (panel) {
    panel.style.display = '';
    if (titleEl) titleEl.textContent = jobName;
  }

  // Load job details
  try {
    const { fetchJobDetails } = await import('./apiClient.js');
    const data = await fetchJobDetails(jobName);
    renderJobTab('overview', data);
  } catch (err) {
    _hooks.showFeedback('error', 'Job Details', err.message);
  }
}

function renderJobTab(tab, extraData) {
  const contentEl = document.getElementById('jobTabContent');
  if (!contentEl) return;

  if (!_currentJobName) {
    contentEl.innerHTML = '<div class="job-tab-empty">Select a job to view details</div>';
    return;
  }

  switch (tab) {
    case 'overview':
      renderJobOverview(contentEl, extraData);
      break;
    case 'steps':
      renderJobSteps(contentEl, extraData);
      break;
    case 'schedules':
      renderJobSchedules(contentEl, extraData);
      break;
    case 'history':
      renderJobHistoryTab(contentEl);
      break;
    case 'alerts':
      renderJobAlerts(contentEl, extraData);
      break;
    default:
      contentEl.innerHTML = '<div class="job-tab-empty">Unknown tab</div>';
  }
}

async function renderJobOverview(el, data) {
  if (!data) {
    try {
      const { fetchJobDetails } = await import('./apiClient.js');
      data = await fetchJobDetails(_currentJobName);
    } catch (err) {
      el.innerHTML = `<div class="job-error">Failed to load: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  const o = data.overview || {};
  el.innerHTML = `
    <div class="job-overview-grid">
      <div class="job-overview-row">
        <span class="job-label">Enabled</span>
        <span class="job-value">${o.enabled ? 'Yes' : 'No'}</span>
      </div>
      <div class="job-overview-row">
        <span class="job-label">Last Run</span>
        <span class="job-value">${o.lastRunDate || 'Never'}</span>
      </div>
      <div class="job-overview-row">
        <span class="job-label">Next Run</span>
        <span class="job-value">${o.nextRunDate || 'Not scheduled'}</span>
      </div>
      <div class="job-overview-row">
        <span class="job-label">Owner</span>
        <span class="job-value">${escapeHtml(o.owner || 'Unknown')}</span>
      </div>
      <div class="job-overview-row">
        <span class="job-label">Description</span>
        <span class="job-value">${escapeHtml(o.description || 'No description')}</span>
      </div>
      <div class="job-overview-row">
        <span class="job-label">Status</span>
        <span class="job-value">${getStatusIcon(o.status, o.enabled)} ${escapeHtml(o.status || 'Unknown')}</span>
      </div>
    </div>
  `;
}

async function renderJobSteps(el, data) {
  if (!data) {
    try {
      const { fetchJobDetails } = await import('./apiClient.js');
      data = await fetchJobDetails(_currentJobName);
    } catch (err) {
      el.innerHTML = `<div class="job-error">Failed to load: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  const steps = data.steps || [];
  if (steps.length === 0) {
    el.innerHTML = '<div class="job-tab-empty">No steps defined</div>';
    return;
  }

  let html = '<div class="job-steps-list">';
  for (const step of steps) {
    html += `
      <div class="job-step-row">
        <div class="job-step-name">${escapeHtml(step.name)}</div>
        <div class="job-step-type">${escapeHtml(step.type || 'Transact-SQL')}</div>
        <div class="job-step-outcome">${escapeHtml(step.outcome || 'Unknown')}</div>
      </div>
    `;
  }
  html += '</div>';
  el.innerHTML = html;
}

async function renderJobSchedules(el, data) {
  if (!data) {
    try {
      const { fetchJobDetails } = await import('./apiClient.js');
      data = await fetchJobDetails(_currentJobName);
    } catch (err) {
      el.innerHTML = `<div class="job-error">Failed to load: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  const schedules = data.schedules || [];
  if (schedules.length === 0) {
    el.innerHTML = '<div class="job-tab-empty">No schedules defined</div>';
    return;
  }

  let html = '<div class="job-schedules-list">';
  for (const sched of schedules) {
    html += `
      <div class="job-schedule-row">
        <div class="job-schedule-name">${escapeHtml(sched.name)}</div>
        <div class="job-schedule-freq">${escapeHtml(sched.frequency || 'Once')}</div>
        <div class="job-schedule-next">${escapeHtml(sched.nextRun || 'N/A')}</div>
      </div>
    `;
  }
  html += '</div>';
  el.innerHTML = html;
}

async function renderJobHistoryTab(el) {
  el.innerHTML = `
    <div class="job-history-toolbar">
      <button class="btn btn-ghost" id="jobHistPrev">← Prev</button>
      <span id="jobHistPage">Page 0</span>
      <button class="btn btn-ghost" id="jobHistNext">Next →</button>
    </div>
    <div class="job-history-table" id="jobHistoryTable"></div>
  `;

  document.getElementById('jobHistPrev')?.addEventListener('click', () => {
    if (_jobHistoryPage > 0) {
      _jobHistoryPage--;
      loadJobHistory();
    }
  });

  document.getElementById('jobHistNext')?.addEventListener('click', () => {
    _jobHistoryPage++;
    loadJobHistory();
  });

  await loadJobHistory();
}

async function loadJobHistory() {
  const tableEl = document.getElementById('jobHistoryTable');
  const pageEl = document.getElementById('jobHistPage');
  if (!tableEl) return;

  if (pageEl) pageEl.textContent = `Page ${_jobHistoryPage}`;

  try {
    const { fetchJobHistory } = await import('./apiClient.js');
    const data = await fetchJobHistory(_currentJobName, _jobHistoryPage);
    const history = data.history || [];

    if (history.length === 0) {
      tableEl.innerHTML = '<div class="job-tab-empty">No history available</div>';
      return;
    }

    let html = `
      <table class="job-history-grid">
        <thead>
          <tr>
            <th>Run Date</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const h of history) {
      html += `
        <tr>
          <td>${escapeHtml(h.runDate || '')}</td>
          <td>${escapeHtml(h.duration || '')}</td>
          <td>${escapeHtml(h.status || '')}</td>
          <td>${escapeHtml(h.message || '')}</td>
        </tr>
      `;
    }
    html += '</tbody></table>';
    tableEl.innerHTML = html;

    // Update prev/next buttons
    const prevBtn = document.getElementById('jobHistPrev');
    const nextBtn = document.getElementById('jobHistNext');
    if (prevBtn) prevBtn.disabled = _jobHistoryPage === 0;
    if (nextBtn) nextBtn.disabled = !data.hasMore;
  } catch (err) {
    tableEl.innerHTML = `<div class="job-error">Failed to load history: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderJobAlerts(el, data) {
  if (!data) {
    try {
      const { fetchJobDetails } = await import('./apiClient.js');
      data = await fetchJobDetails(_currentJobName);
    } catch (err) {
      el.innerHTML = `<div class="job-error">Failed to load: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  const alerts = data.alerts || [];
  if (alerts.length === 0) {
    el.innerHTML = '<div class="job-tab-empty">No alerts linked</div>';
    return;
  }

  let html = '<div class="job-alerts-list">';
  for (const alert of alerts) {
    html += `<div class="job-alert-row"><span class="badge">${alerts.length}</span> ${escapeHtml(alert.name)}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

export async function showJobContextMenu(jobName, event) {
  // Remove any existing menu
  document.querySelectorAll('.job-context-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'job-context-menu';
  menu.innerHTML = `
    <div class="context-item" data-action="start">▶ Start</div>
    <div class="context-item" data-action="stop">■ Stop</div>
    <div class="context-separator"></div>
    <div class="context-item" data-action="enable">✓ Enable</div>
    <div class="context-item" data-action="disable">✗ Disable</div>
    <div class="context-separator"></div>
    <div class="context-item" data-action="history">📋 View History</div>
    <div class="context-item" data-action="properties">ℹ Properties</div>
  `;

  menu.style.position = 'fixed';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);

  // Close on click outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);

  // Handle actions
  menu.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      menu.remove();

      if (action === 'history') {
        _currentJobName = jobName;
        const panel = document.getElementById('jobDetailsPanel');
        if (panel) {
          panel.style.display = '';
          document.getElementById('jobDetailsTitle').textContent = jobName;
        }
        // Switch to history tab
        document.querySelectorAll('.job-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.job-tab[data-tab="history"]')?.classList.add('active');
        await renderJobHistoryTab(document.getElementById('jobTabContent'));
        return;
      }

      if (action === 'properties') {
        renderJobDetails(jobName);
        // Switch to overview tab
        document.querySelectorAll('.job-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.job-tab[data-tab="overview"]')?.classList.add('active');
        return;
      }

      await executeJobAction(jobName, action);
    });
  });
}

export async function executeJobAction(jobName, action) {
  try {
    const { startJob, stopJob, enableJob, disableJob } = await import('./apiClient.js');
    let result;
    switch (action) {
      case 'start':
        result = await startJob(jobName);
        break;
      case 'stop':
        result = await stopJob(jobName);
        break;
      case 'enable':
        result = await enableJob(jobName);
        break;
      case 'disable':
        result = await disableJob(jobName);
        break;
      default:
        return;
    }
    if (result.success) {
      _hooks.showFeedback('info', 'Job Action', `Job ${action} succeeded`);
      await loadJobTree();
    } else {
      _hooks.showFeedback('error', 'Job Action', result.error || `Failed to ${action} job`);
    }
  } catch (err) {
    _hooks.showFeedback('error', 'Job Action', err.message);
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
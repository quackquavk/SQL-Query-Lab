// Backup/Restore frontend module
// Provides modal dialogs for backup operations and multi-step restore wizard

import * as runtime from './runtime.js';

let _hooks = {
  showFeedback: () => {},
  toast: () => {}
};

export function setBackupRestoreHooks({ showFeedback, toast }) {
  _hooks.showFeedback = showFeedback;
  _hooks.toast = toast;
}

// State for restore wizard
let _wizardState = {
  step: 1,
  selectedBackups: [],
  pointInTime: null,
  targetDb: '',
  overwrite: false
};

export function openBackupModal() {
  renderBackupModal();
}

export function openRestoreWizard() {
  _wizardState = {
    step: 1,
    selectedBackups: [],
    pointInTime: null,
    targetDb: '',
    overwrite: false
  };
  renderRestoreWizard();
}

function renderBackupModal() {
  // Remove existing modal
  document.querySelectorAll('.backup-modal, .backup-modal-backdrop').forEach(m => m.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'backupModalBackdrop';

  backdrop.innerHTML = `
    <div class="backup-modal modal">
      <div class="modal-head">
        <h2>Backup Database</h2>
        <button class="close-btn" id="backupModalClose">×</button>
      </div>
      <div class="backup-tabs">
        <button class="backup-tab active" data-tab="general">General</button>
        <button class="backup-tab" data-tab="options">Options</button>
        <button class="backup-tab" data-tab="destination">Destination</button>
      </div>
      <div class="backup-tab-content" id="backupTabContent">
        ${renderBackupGeneralTab()}
      </div>
      <div class="backup-progress-wrap" id="backupProgressWrap" style="display:none">
        <div class="backup-progress-bar">
          <div class="backup-progress-fill" id="backupProgressFill"></div>
        </div>
        <div class="backup-progress-text" id="backupProgressText">0%</div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="backupCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="backupExecuteBtn">Execute Backup</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Bind events
  backdrop.querySelector('#backupModalClose')?.addEventListener('click', closeBackupModal);
  backdrop.querySelector('#backupCancelBtn')?.addEventListener('click', closeBackupModal);
  backdrop.querySelector('#backupExecuteBtn')?.addEventListener('click', executeBackup);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeBackupModal();
  });

  // Bind tab switching
  backdrop.querySelectorAll('.backup-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('.backup-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('backupTabContent').innerHTML = renderBackupTabContent(tab);
      bindBackupTabEvents(backdrop);
    });
  });

  bindBackupTabEvents(backdrop);

  // Populate database dropdown from live SQL Server (async, non-blocking)
  populateBackupDbDropdown(backdrop);
}

// Populate database dropdown asynchronously
async function populateBackupDbDropdown(backdrop) {
  const dbSelect = backdrop.querySelector('#backupDbSelect');
  try {
    const { fetchObjectTree } = await import('./apiClient.js');
    const data = await fetchObjectTree(runtime.cursor.connectionId);
    const databases = data.databases || [];
    if (dbSelect) {
      for (const db of databases) {
        const opt = document.createElement('option');
        opt.value = db.name;
        opt.textContent = db.name;
        dbSelect.appendChild(opt);
      }
      // Pre-select current DB if set
      if (runtime.cursor.currentDbName && dbSelect.querySelector(`option[value="${runtime.cursor.currentDbName}"]`)) {
        dbSelect.value = runtime.cursor.currentDbName;
      }
    }
  } catch (err) {
    // Leave dropdown as-is on failure
  }
}

function renderBackupTabContent(tab) {
  switch (tab) {
    case 'general': return renderBackupGeneralTab();
    case 'options': return renderBackupOptionsTab();
    case 'destination': return renderBackupDestinationTab();
    default: return '';
  }
}

function renderBackupGeneralTab() {
  return `
    <div class="backup-form-group">
      <label class="backup-label">Backup type</label>
      <div class="backup-radio-group">
        <label class="backup-radio">
          <input type="radio" name="backupType" value="full" checked />
          <span>Full</span>
        </label>
        <label class="backup-radio">
          <input type="radio" name="backupType" value="diff" />
          <span>Differential</span>
        </label>
        <label class="backup-radio">
          <input type="radio" name="backupType" value="log" />
          <span>Transaction Log</span>
        </label>
      </div>
    </div>
    <div class="backup-form-group">
      <label class="backup-label">Database</label>
      <select class="backup-select" id="backupDbSelect">
        <option value="">Select database...</option>
      </select>
    </div>
    <div class="backup-form-group">
      <label class="backup-label">Backup set name</label>
      <input type="text" class="backup-input" id="backupSetName" placeholder="Optional: auto-generated if blank" />
    </div>
    <div class="backup-form-group" id="pointInTimeGroup" style="display:none">
      <label class="backup-label">Point-in-time restore</label>
      <input type="datetime-local" class="backup-input" id="pointInTimeInput" />
    </div>
  `;
}

function renderBackupOptionsTab() {
  return `
    <div class="backup-form-group">
      <label class="backup-checkbox">
        <input type="checkbox" id="backupCompression" checked />
        <span>Compress backup</span>
      </label>
      <p class="backup-hint">Reduces backup file size but uses more CPU</p>
    </div>
    <div class="backup-form-group">
      <label class="backup-checkbox">
        <input type="checkbox" id="backupChecksum" checked />
        <span>Verify checksum</span>
      </label>
      <p class="backup-hint">Performs checksum validation during backup</p>
    </div>
    <div class="backup-form-group">
      <label class="backup-checkbox">
        <input type="checkbox" id="backupEncrypt" />
        <span>Encrypt backup</span>
      </label>
      <input type="text" class="backup-input" id="backupEncryptKey" placeholder="Encryption key (if enabled)" style="margin-top:8px" />
    </div>
  `;
}

function renderBackupDestinationTab() {
  return `
    <div class="backup-form-group">
      <label class="backup-label">Destination path</label>
      <input type="text" class="backup-input" id="backupDestination" placeholder="e.g., /var/opt/mssql/backups/db.bak" />
    </div>
    <div class="backup-form-group">
      <label class="backup-label">Backup set expiration (days)</label>
      <input type="number" class="backup-input" id="backupExpiration" value="0" min="0" max="365" />
      <p class="backup-hint">0 = no expiration</p>
    </div>
    <div class="backup-history-display" id="backupHistoryDisplay">
      <div class="backup-history-loading">Loading backup history...</div>
    </div>
  `;
}

function bindBackupTabEvents(backdrop) {
  // Show point-in-time for log backups
  const logRadio = backdrop.querySelector('input[name="backupType"][value="log"]');
  const pointInTimeGroup = backdrop.querySelector('#pointInTimeGroup');
  logRadio?.addEventListener('change', () => {
    if (logRadio.checked && pointInTimeGroup) {
      pointInTimeGroup.style.display = '';
    }
  });
  const fullRadio = backdrop.querySelector('input[name="backupType"][value="full"]');
  fullRadio?.addEventListener('change', () => {
    if (pointInTimeGroup) pointInTimeGroup.style.display = 'none';
  });
  const diffRadio = backdrop.querySelector('input[name="backupType"][value="diff"]');
  diffRadio?.addEventListener('change', () => {
    if (pointInTimeGroup) pointInTimeGroup.style.display = 'none';
  });

  // Fetch backup history when destination tab is shown
  const activeTab = backdrop.querySelector('.backup-tab.active');
  if (activeTab?.dataset.tab === 'destination') {
    fetchAndRenderBackupHistory();
  }
}

async function fetchAndRenderBackupHistory() {
  const historyDisplay = document.getElementById('backupHistoryDisplay');
  if (!historyDisplay) return;

  // Get currently selected DB from the dropdown
  const dbSelect = document.getElementById('backupDbSelect');
  const dbName = dbSelect?.value || runtime.cursor.currentDbName;

  if (!dbName) {
    historyDisplay.innerHTML = '<p class="backup-history-empty">Select a database to view backup history.</p>';
    return;
  }

  try {
    const { fetchBackupHistory } = await import('./apiClient.js');
    const result = await fetchBackupHistory(dbName);
    const backups = result.backups || [];

    if (backups.length === 0) {
      historyDisplay.innerHTML = '<p class="backup-history-empty">No backup history found for this database.</p>';
      return;
    }

    let html = `
      <h4 class="backup-history-heading">Backup History</h4>
      <table class="backup-history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Size</th>
            <th>Path</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const b of backups) {
      html += `
        <tr>
          <td>${escapeHtml(b.date || '')}</td>
          <td>${escapeHtml(b.type || '')}</td>
          <td>${escapeHtml(b.size || '')}</td>
          <td>${escapeHtml(b.backupPath || '')}</td>
        </tr>
      `;
    }
    html += '</tbody></table>';
    historyDisplay.innerHTML = html;
  } catch (err) {
    historyDisplay.innerHTML = '<p class="backup-history-empty">Failed to load backup history.</p>';
  }
}

async function executeBackup() {
  const modal = document.querySelector('.backup-modal');
  if (!modal) return;

  const backupType = document.querySelector('input[name="backupType"]:checked')?.value || 'full';
  const dbName = document.getElementById('backupDbSelect')?.value;
  const backupSetName = document.getElementById('backupSetName')?.value || '';
  const destination = document.getElementById('backupDestination')?.value || '';
  const compression = document.getElementById('backupCompression')?.checked || false;
  const checksum = document.getElementById('backupChecksum')?.checked || false;
  const encrypt = document.getElementById('backupEncrypt')?.checked || false;
  const encryptKey = document.getElementById('backupEncryptKey')?.value || '';
  const expiration = parseInt(document.getElementById('backupExpiration')?.value || '0');

  if (!dbName) {
    _hooks.showFeedback('error', 'Backup', 'Please select a database');
    return;
  }

  if (!destination) {
    _hooks.showFeedback('error', 'Backup', 'Please specify a destination path');
    return;
  }

  // Show progress UI
  const progressWrap = document.getElementById('backupProgressWrap');
  const progressFill = document.getElementById('backupProgressFill');
  const progressText = document.getElementById('backupProgressText');
  const executeBtn = document.getElementById('backupExecuteBtn');
  const cancelBtn = document.getElementById('backupCancelBtn');

  if (progressWrap) progressWrap.style.display = '';
  if (executeBtn) executeBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  // Establish WebSocket for progress streaming
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/api/backup-progress`;
  let ws = null;
  let progressDebounceTimer = null;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = async () => {
      // Send backup request via REST, then stream progress via WebSocket
      const { executeBackup: apiBackup } = await import('./apiClient.js');
      const result = await apiBackup({
        dbName,
        backupType,
        destination,
        compression,
        checksum,
        backupSetName,
        expiration,
        encrypt: encrypt ? encryptKey : null
      }, runtime.cursor.connectionId);

      if (!result.success && !result.backupSetId) {
        throw new Error(result.error || 'Backup failed to start');
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'progress') {
        updateProgress(msg.percent, msg.currentFile || '');
      } else if (msg.type === 'complete') {
        ws.close();
        onBackupComplete(true, msg.backupSetId);
      } else if (msg.type === 'error') {
        ws.close();
        onBackupError(msg.message, msg.suggestion);
      }
    };

    ws.onerror = () => {
      // WebSocket failed — fall back to polling or show error
      _hooks.showFeedback('error', 'Backup', 'Progress connection lost');
      if (executeBtn) executeBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    };

  } catch (err) {
    if (executeBtn) executeBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    _hooks.showFeedback('error', 'Backup', err.message);
  }

  function updateProgress(percent, currentFile) {
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%${currentFile ? ' — ' + currentFile : ''}`;
  }

  function onBackupComplete(success, backupSetId) {
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '100% — Verifying backup...';

    // Run RESTORE VERIFYONLY
    setTimeout(async () => {
      try {
        const { verifyBackup } = await import('./apiClient.js');
        const verifyResult = await verifyBackup(destination);
        if (verifyResult.valid) {
          _hooks.toast('Backup complete and verified', 'Success');
        } else {
          _hooks.showFeedback('warn', 'Backup', `Backup complete but verification failed: ${verifyResult.message}`);
        }
      } catch (err) {
        _hooks.showFeedback('warn', 'Backup', 'Backup complete but verification error: ' + err.message);
      }

      if (executeBtn) executeBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      setTimeout(closeBackupModal, 1500);
    }, 500);
  }

  function onBackupError(message, suggestion) {
    if (progressFill) progressFill.style.width = '0%';
    if (executeBtn) executeBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    _hooks.showFeedback('error', 'Backup', `${message}${suggestion ? ' Suggestion: ' + suggestion : ''}`);
  }
}

function closeBackupModal() {
  document.querySelectorAll('.backup-modal, .backup-modal-backdrop').forEach(m => m.remove());
}

export async function executeRestore(options) {
  const { executeRestore: apiRestore } = await import('./apiClient.js');
  return apiRestore(options, runtime.cursor.connectionId);
}

export async function verifyBackup(backupPath) {
  const { verifyBackup: apiVerify } = await import('./apiClient.js');
  return apiVerify(backupPath);
}

// Restore Wizard
function renderRestoreWizard() {
  document.querySelectorAll('.backup-modal, .backup-modal-backdrop').forEach(m => m.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'restoreModalBackdrop';

  backdrop.innerHTML = `
    <div class="backup-modal modal restore-wizard-modal">
      <div class="modal-head">
        <h2>Restore Database</h2>
        <button class="close-btn" id="restoreWizardClose">×</button>
      </div>
      <div class="wizard-steps">
        <div class="wizard-step ${_wizardState.step === 1 ? 'active' : ''}" data-step="1">
          <span class="wizard-step-num">1</span>
          <span class="wizard-step-label">Select Backup</span>
        </div>
        <div class="wizard-step-sep">›</div>
        <div class="wizard-step ${_wizardState.step === 2 ? 'active' : ''}" data-step="2">
          <span class="wizard-step-num">2</span>
          <span class="wizard-step-label">Point-in-Time</span>
        </div>
        <div class="wizard-step-sep">›</div>
        <div class="wizard-step ${_wizardState.step === 3 ? 'active' : ''}" data-step="3">
          <span class="wizard-step-num">3</span>
          <span class="wizard-step-label">Target Database</span>
        </div>
        <div class="wizard-step-sep">›</div>
        <div class="wizard-step ${_wizardState.step === 4 ? 'active' : ''}" data-step="4">
          <span class="wizard-step-num">4</span>
          <span class="wizard-step-label">Confirm</span>
        </div>
      </div>
      <div class="wizard-content" id="wizardContent"></div>
      <div class="backup-progress-wrap" id="restoreProgressWrap" style="display:none">
        <div class="backup-progress-bar">
          <div class="backup-progress-fill" id="restoreProgressFill"></div>
        </div>
        <div class="backup-progress-text" id="restoreProgressText">0%</div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="wizardPrevBtn">← Previous</button>
        <button class="btn" id="wizardNextBtn">Next →</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector('#restoreWizardClose')?.addEventListener('click', closeRestoreWizard);
  backdrop.querySelector('#wizardPrevBtn')?.addEventListener('click', wizardPrev);
  backdrop.querySelector('#wizardNextBtn')?.addEventListener('click', wizardNext);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeRestoreWizard();
  });

  renderWizardStep();
  updateWizardButtons();
}

function renderWizardStep() {
  const content = document.getElementById('wizardContent');
  if (!content) return;

  switch (_wizardState.step) {
    case 1: content.innerHTML = renderWizardStep1(); bindStep1Events(); break;
    case 2: content.innerHTML = renderWizardStep2(); bindStep2Events(); break;
    case 3: content.innerHTML = renderWizardStep3(); bindStep3Events(); break;
    case 4: content.innerHTML = renderWizardStep4(); bindStep4Events(); break;
  }
}

async function renderWizardStep1() {
  // Fetch database list from server
  let databases = [];
  let dbFetchError = false;
  try {
    const { fetchObjectTree } = await import('./apiClient.js');
    const data = await fetchObjectTree(runtime.cursor.connectionId);
    databases = data.databases || [];
  } catch (err) {
    dbFetchError = true;
  }

  // Fetch backup history for the current target DB
  const initialDb = _wizardState.targetDb || runtime.cursor.currentDbName || 'master';
  let backups = [];
  try {
    const { fetchBackupHistory } = await import('./apiClient.js');
    const result = await fetchBackupHistory(initialDb);
    backups = result.backups || [];
  } catch (err) {
    // Ignore — show empty state
  }

  if (databases.length === 0) {
    return `
      <div class="wizard-step-content">
        <h3>Select Backup Files</h3>
        ${dbFetchError ? '<p class="wizard-hint">Could not load database list. Enter the database name manually.</p>' : '<p class="wizard-hint">No databases found.</p>'}
        <div class="backup-form-group">
          <label class="backup-label">Database</label>
          <input type="text" class="backup-input" id="wizardDbName" value="${_wizardState.targetDb}" placeholder="Database name" />
        </div>
        ${renderBackupHistoryTable(initialDb, backups)}
      </div>
    `;
  }

  return `
    <div class="wizard-step-content">
      <h3>Select Backup Files</h3>
      <p class="wizard-hint">Select one or more backup files to restore. Differential backups require their full backup to also be selected.</p>
      <div class="backup-form-group">
        <label class="backup-label">Database</label>
        <select class="backup-select" id="wizardDbSelect">
          ${databases.map(db => `<option value="${escapeHtml(db.name)}" ${db.name === initialDb ? 'selected' : ''}>${escapeHtml(db.name)}</option>`).join('\n          ')}
        </select>
      </div>
      ${renderBackupHistoryTable(initialDb, backups)}
    </div>
  `;
}

/**
 * Render the backup history table for a given database.
 * Used both in step 1 (restore wizard) and the destination tab.
 */
function renderBackupHistoryTable(dbName, backups) {
  if (backups.length === 0) {
    return `<p class="wizard-hint" id="wizardBackupHint">No backup history found for <strong>${escapeHtml(dbName)}</strong>.</p>
      <table class="backup-history-table" id="wizardBackupTable" style="display:none">
        <thead>
          <tr>
            <th></th>
            <th>Date</th>
            <th>Type</th>
            <th>Size</th>
            <th>First LSN</th>
            <th>Last LSN</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>`;
  }

  let html = `
    <p class="wizard-hint" id="wizardBackupHint" style="display:none">No backup history found for this database.</p>
    <table class="backup-history-table" id="wizardBackupTable">
      <thead>
        <tr>
          <th></th>
          <th>Date</th>
          <th>Type</th>
          <th>Size</th>
          <th>First LSN</th>
          <th>Last LSN</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const b of backups) {
    html += `
      <tr>
        <td><input type="checkbox" class="backup-select-check" data-lsn="${b.lastLsn}" value="${escapeHtml(b.backupPath || '')}" /></td>
        <td>${escapeHtml(b.date || '')}</td>
        <td>${escapeHtml(b.type || '')}</td>
        <td>${escapeHtml(b.size || '')}</td>
        <td>${escapeHtml(b.firstLsn || '')}</td>
        <td>${escapeHtml(b.lastLsn || '')}</td>
      </tr>
    `;
  }
  html += '</tbody></table>';
  return html;
}

function bindStep1Events() {
  // Text input fallback
  const dbInput = document.getElementById('wizardDbName');
  dbInput?.addEventListener('change', () => {
    _wizardState.targetDb = dbInput.value;
  });

  // Dropdown selector — re-fetch backup history on change
  const dbSelect = document.getElementById('wizardDbSelect');
  if (dbSelect) {
    dbSelect.addEventListener('change', (e) => {
      _wizardState.targetDb = e.target.value;
      reFetchBackupHistory(_wizardState.targetDb); // fire-and-forget, errors logged inside
    });
  }

  document.querySelectorAll('.backup-select-check').forEach(cb => {
    cb.addEventListener('change', () => {
      _wizardState.selectedBackups = Array.from(document.querySelectorAll('.backup-select-check:checked')).map(c => ({
        path: c.value,
        lsn: c.dataset.lsn
      }));
    });
  });
}

/**
 * Re-fetch backup history for a given database and re-render the history table.
 * Called when user changes the database selector in step 1.
 */
async function reFetchBackupHistory(dbName) {
  const hint = document.getElementById('wizardBackupHint');
  const table = document.getElementById('wizardBackupTable');

  if (hint) hint.textContent = 'Loading backup history...';
  if (table) table.style.display = 'none';

  try {
    const { fetchBackupHistory } = await import('./apiClient.js');
    const result = await fetchBackupHistory(dbName);
    const backups = result.backups || [];

    if (backups.length === 0) {
      if (hint) {
        hint.textContent = `No backup history found for ${dbName}.`;
        hint.style.display = '';
      }
      if (table) table.style.display = 'none';
      return;
    }

    // Populate the table body
    if (table) {
      table.style.display = '';
      const tbody = table.querySelector('tbody');
      if (tbody) {
        let html = '';
        for (const b of backups) {
          html += `
            <tr>
              <td><input type="checkbox" class="backup-select-check" data-lsn="${b.lastLsn}" value="${escapeHtml(b.backupPath || '')}" /></td>
              <td>${escapeHtml(b.date || '')}</td>
              <td>${escapeHtml(b.type || '')}</td>
              <td>${escapeHtml(b.size || '')}</td>
              <td>${escapeHtml(b.firstLsn || '')}</td>
              <td>${escapeHtml(b.lastLsn || '')}</td>
            </tr>
          `;
        }
        tbody.innerHTML = html;

        // Re-bind checkbox events
        tbody.querySelectorAll('.backup-select-check').forEach(cb => {
          cb.addEventListener('change', () => {
            _wizardState.selectedBackups = Array.from(document.querySelectorAll('.backup-select-check:checked')).map(c => ({
              path: c.value,
              lsn: c.dataset.lsn
            }));
          });
        });
      }
    }
    if (hint) hint.style.display = 'none';
  } catch (err) {
    if (hint) {
      hint.textContent = 'Failed to load backup history.';
      hint.style.display = '';
    }
  }
}

function renderWizardStep2() {
  return `
    <div class="wizard-step-content">
      <h3>Point-in-Time Restore</h3>
      <p class="wizard-hint">Optionally restore to a specific point in time. Leave unchecked to restore to the most recent point in the selected backup chain.</p>
      <div class="backup-form-group">
        <label class="backup-checkbox">
          <input type="checkbox" id="restorePointInTime" ${_wizardState.pointInTime ? 'checked' : ''} />
          <span>Restore to point in time</span>
        </label>
        <input type="datetime-local" class="backup-input" id="pointInTimeDateTime" value="${_wizardState.pointInTime || ''}" style="margin-top:8px;${_wizardState.pointInTime ? '' : 'display:none'}" />
      </div>
      <div class="wizard-warning">
        <strong>Warning:</strong> Point-in-time restore is only available for full or bulk-logged recovery models.
      </div>
    </div>
  `;
}

function bindStep2Events() {
  const checkbox = document.getElementById('restorePointInTime');
  const dateInput = document.getElementById('pointInTimeDateTime');
  checkbox?.addEventListener('change', () => {
    if (dateInput) dateInput.style.display = checkbox.checked ? '' : 'none';
    if (!checkbox.checked) {
      _wizardState.pointInTime = null;
    }
  });
  dateInput?.addEventListener('change', () => {
    _wizardState.pointInTime = dateInput.value;
  });
}

function renderWizardStep3() {
  return `
    <div class="wizard-step-content">
      <h3>Target Database</h3>
      <div class="backup-form-group">
        <label class="backup-label">Database name</label>
        <input type="text" class="backup-input" id="restoreTargetDb" value="${_wizardState.targetDb}" placeholder="Target database name" />
      </div>
      <div class="backup-form-group">
        <label class="backup-checkbox">
          <input type="checkbox" id="restoreOverwrite" ${_wizardState.overwrite ? 'checked' : ''} />
          <span>Overwrite existing database</span>
        </label>
        <p class="wizard-hint">Warning: This will replace the existing database. Type the database name below to confirm.</p>
        <input type="text" class="backup-input" id="restoreOverwriteConfirm" placeholder="Type database name to confirm" style="margin-top:8px" />
      </div>
    </div>
  `;
}

function bindStep3Events() {
  const targetDb = document.getElementById('restoreTargetDb');
  const overwrite = document.getElementById('restoreOverwrite');
  const overwriteConfirm = document.getElementById('restoreOverwriteConfirm');

  targetDb?.addEventListener('change', () => {
    _wizardState.targetDb = targetDb.value;
  });

  overwrite?.addEventListener('change', () => {
    _wizardState.overwrite = overwrite.checked;
  });
}

function renderWizardStep4() {
  const backupList = _wizardState.selectedBackups.map(b => b.path).join(', ');
  return `
    <div class="wizard-step-content">
      <h3>Confirm Restore</h3>
      <p class="wizard-hint">Review the restore command below. Type the target database name to enable the Restore button.</p>
      <div class="restore-command-preview">
        <pre id="restoreCommandPreview">RESTORE DATABASE [${_wizardState.targetDb}] FROM DISK='${backupList}' WITH${_wizardState.overwrite ? ' REPLACE' : ''}${_wizardState.pointInTime ? `, STOPAT="${_wizardState.pointInTime}"` : ''}</pre>
        <button class="btn btn-ghost" id="copyRestoreCmd">Copy command</button>
      </div>
      <div class="backup-form-group" style="margin-top:16px">
        <label class="backup-label">Type "${_wizardState.targetDb}" to confirm</label>
        <input type="text" class="backup-input" id="restoreConfirmInput" placeholder="Database name" />
      </div>
    </div>
  `;
}

function bindStep4Events() {
  const copyBtn = document.getElementById('copyRestoreCmd');
  copyBtn?.addEventListener('click', () => {
    const pre = document.getElementById('restoreCommandPreview');
    if (pre) {
      navigator.clipboard.writeText(pre.textContent).then(() => {
        _hooks.toast('Command copied', 'Copied');
      });
    }
  });
}

function updateWizardButtons() {
  const prevBtn = document.getElementById('wizardPrevBtn');
  const nextBtn = document.getElementById('wizardNextBtn');

  if (prevBtn) prevBtn.style.display = _wizardState.step === 1 ? 'none' : '';

  if (nextBtn) {
    if (_wizardState.step === 4) {
      nextBtn.textContent = 'Restore';
      nextBtn.disabled = true; // Will be enabled when confirmation typed
    } else {
      nextBtn.textContent = 'Next →';
      nextBtn.disabled = false;
    }
  }

  // Update step indicators
  document.querySelectorAll('.wizard-step').forEach(el => {
    const step = parseInt(el.dataset.step);
    el.classList.toggle('active', step === _wizardState.step);
    el.classList.toggle('completed', step < _wizardState.step);
  });
}

async function wizardNext() {
  if (_wizardState.step === 4) {
    // Execute restore
    const confirmInput = document.getElementById('restoreConfirmInput');
    if (confirmInput && confirmInput.value !== _wizardState.targetDb) {
      _hooks.showFeedback('error', 'Restore', 'Database name does not match. Please type it exactly to confirm.');
      return;
    }
    await executeRestoreWizard();
    return;
  }

  _wizardState.step++;
  renderWizardStep();
  updateWizardButtons();
}

function wizardPrev() {
  if (_wizardState.step > 1) {
    _wizardState.step--;
    renderWizardStep();
    updateWizardButtons();
  }
}

async function executeRestoreWizard() {
  const progressWrap = document.getElementById('restoreProgressWrap');
  const progressFill = document.getElementById('restoreProgressFill');
  const progressText = document.getElementById('restoreProgressText');
  const nextBtn = document.getElementById('wizardNextBtn');
  const prevBtn = document.getElementById('wizardPrevBtn');

  if (progressWrap) progressWrap.style.display = '';
  if (nextBtn) nextBtn.disabled = true;
  if (prevBtn) prevBtn.disabled = true;

  try {
    const { executeRestore: apiRestore } = await import('./apiClient.js');
    const result = await apiRestore({
      dbName: _wizardState.targetDb,
      backupPaths: _wizardState.selectedBackups.map(b => b.path),
      pointInTime: _wizardState.pointInTime,
      overwrite: _wizardState.overwrite
    }, runtime.cursor.connectionId);

    if (result.success) {
      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = '100% — Restore complete';
      _hooks.toast('Restore completed successfully', 'Success');
      setTimeout(closeRestoreWizard, 1500);
    } else {
      throw new Error(result.error || 'Restore failed');
    }
  } catch (err) {
    _hooks.showFeedback('error', 'Restore', err.message);
    if (nextBtn) nextBtn.disabled = false;
    if (prevBtn) prevBtn.disabled = false;
  }
}

function closeRestoreWizard() {
  document.querySelectorAll('.backup-modal, .backup-modal-backdrop').forEach(m => m.remove());
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
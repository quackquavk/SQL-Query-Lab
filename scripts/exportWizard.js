// Export Wizard: modal for exporting query results with column selection/rename, format pick, and preview.
import * as runtime from './runtime.js';
import { exportToCsv, exportToJson, exportToXlsx, downloadBlob } from './utils.js';

// ─── State (module closure) ─────────────────────────────────────────────────

let state = {
  format: 'csv',       // 'csv' | 'json' | 'xlsx'
  columnMap: new Map(), // originalName → { selected: bool, renamed: string }
  csvOptions: { delimiter: ',', encoding: 'UTF-8' },
};

let _wizardEl = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openWizard() {
  const last = runtime.cursor.lastUserResult;
  if (!last || !last.columns || last.columns.length === 0) {
    // No results — show empty state
    _wizardEl = buildWizard(true, null);
    document.body.appendChild(_wizardEl);
    return;
  }
  initColumnMap(last.columns);
  _wizardEl = buildWizard(false, last);
  document.body.appendChild(_wizardEl);
}

function initColumnMap(columns) {
  state.columnMap = new Map();
  columns.forEach(col => {
    state.columnMap.set(col, { selected: true, renamed: col });
  });
}

// ─── Wizard HTML builder ────────────────────────────────────────────────────

function buildWizard(empty, result) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop wizard-backdrop open';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeWizard();
  });

  const content = empty
    ? buildEmptyState()
    : buildWizardContent(result);

  backdrop.appendChild(content);
  return backdrop;
}

function buildEmptyState() {
  const modal = document.createElement('div');
  modal.className = 'modal export-wizard-modal';
  modal.innerHTML = `
    <div class="modal-head">
      <h2>Export Wizard</h2>
      <button class="close-btn" id="wizardClose">×</button>
    </div>
    <div class="wizard-body wizard-empty-state">
      <p>No results to export.</p>
      <p style="color:var(--text-dim)">Run a query first to see results here.</p>
    </div>
  `;
  modal.querySelector('#wizardClose').addEventListener('click', closeWizard);
  return modal;
}

function buildWizardContent(result) {
  const modal = document.createElement('div');
  modal.className = 'modal export-wizard-modal';

  const formats = ['csv', 'json', 'xlsx'];
  const formatLabels = { csv: 'CSV', json: 'JSON', xlsx: 'Excel (XLSX)' };
  const xlsxDisabled = typeof window.XLSX === 'undefined';

  const formatCards = formats.map(f => {
    const disabled = f === 'xlsx' && xlsxDisabled;
    const active = state.format === f ? 'active' : '';
    const tip = f === 'csv' ? ' — comma-separated values' : f === 'json' ? ' — structured objects' : f === 'xlsx' ? ' — spreadsheet' : '';
    return `
      <div class="wizard-format-card ${active}" data-format="${f}" ${disabled ? 'data-disabled="true"' : ''}>
        <span class="fmt-label">${formatLabels[f]}</span>
        <span class="fmt-tip">${tip}</span>
        ${disabled ? '<span class="fmt-disabled">unavailable</span>' : ''}
      </div>
    `;
  }).join('');

  const colRows = buildColumnRows(result.columns);

  const csvOptionsHtml = state.format === 'csv' ? buildCsvOptions() : '';

  const previewRows = buildPreviewRows(result, 5);

  const duplicateWarning = hasDuplicateRenames() ? '<div class="wizard-warning">⚠ Duplicate column names detected — please rename to unique values.</div>' : '';
  const downloadDisabled = hasDuplicateRenames() ? 'disabled' : '';

  modal.innerHTML = `
    <div class="modal-head">
      <h2>Export Wizard</h2>
      <button class="close-btn" id="wizardClose">×</button>
    </div>
    <div class="wizard-body">
      <!-- Step 1: Format -->
      <div class="wizard-step">
        <div class="wizard-step-label">1. Format</div>
        <div class="wizard-format-cards">${formatCards}</div>
      </div>
      <!-- Step 2: Columns -->
      <div class="wizard-step">
        <div class="wizard-step-label">2. Columns</div>
        <div class="wizard-col-list">${colRows}</div>
      </div>
      <!-- Step 3: Format options (CSV only) -->
      <div class="wizard-step wizard-csv-options" style="${state.format === 'csv' ? '' : 'display:none'}">
        <div class="wizard-step-label">3. CSV Options</div>
        ${csvOptionsHtml}
      </div>
      <!-- Step 4: Preview -->
      <div class="wizard-step">
        <div class="wizard-step-label">4. Preview <span style="font-weight:400;color:var(--text-dim)">— first 5 rows</span></div>
        <div class="wizard-preview-wrap">${previewRows}</div>
        ${duplicateWarning}
      </div>
    </div>
    <div class="modal-foot wizard-footer">
      <button class="btn btn-primary" id="wizardDownload" ${downloadDisabled}>Download</button>
    </div>
  `;

  wireWizardEvents(modal, result);
  return modal;
}

function buildColumnRows(columns) {
  return columns.map(col => {
    const entry = state.columnMap.get(col) || { selected: true, renamed: col };
    const checked = entry.selected ? 'checked' : '';
    return `
      <div class="wizard-col-row" data-col="${escapeHtml(col)}">
        <input type="checkbox" class="wizard-col-check" data-orig="${escapeHtml(col)}" ${checked} />
        <span class="wizard-col-orig">${escapeHtml(col)}</span>
        <span class="wizard-col-arrow">→</span>
        <input type="text" class="wizard-col-rename" data-orig="${escapeHtml(col)}" value="${escapeHtml(entry.renamed)}" placeholder="Column name" />
      </div>
    `;
  }).join('');
}

function buildCsvOptions() {
  const delims = [
    { value: ',', label: 'Comma (,)' },
    { value: ';', label: 'Semicolon (;)' },
    { value: '\t', label: 'Tab' },
  ];
  const encs = [
    { value: 'UTF-8', label: 'UTF-8' },
    { value: 'UTF-8-BOM', label: 'UTF-8 with BOM' },
    { value: 'ASCII', label: 'ASCII' },
  ];
  const delimOptions = delims.map(d =>
    `<option value="${d.value}" ${state.csvOptions.delimiter === d.value ? 'selected' : ''}>${d.label}</option>`
  ).join('');
  const encOptions = encs.map(e =>
    `<option value="${e.value}" ${state.csvOptions.encoding === e.value ? 'selected' : ''}>${e.label}</option>`
  ).join('');

  return `
    <div class="wizard-csv-row">
      <div class="wizard-csv-field">
        <label>Delimiter</label>
        <select class="wizard-csv-delim" data-csv-opt="delimiter">${delimOptions}</select>
      </div>
      <div class="wizard-csv-field">
        <label>Encoding</label>
        <select class="wizard-csv-enc" data-csv-opt="encoding">${encOptions}</select>
      </div>
    </div>
  `;
}

function buildPreviewRows(result, maxRows) {
  const selectedCols = getSelectedColumns();
  if (selectedCols.length === 0) {
    return '<div class="wizard-preview-empty">No columns selected</div>';
  }

  // Build display headers
  const headers = selectedCols.map(c => escapeHtml(c.displayName));
  const headerHtml = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

  // Build preview rows (up to maxRows)
  const rows = result.values.slice(0, maxRows);
  const bodyRows = rows.map(row => {
    const cells = selectedCols.map(col => {
      const origIdx = result.columns.indexOf(col.originalName);
      const val = origIdx >= 0 ? row[origIdx] : '';
      return `<td>${escapeHtml(String(val ?? ''))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const rowCountNote = result.values.length > maxRows
    ? `<div class="wizard-preview-note">Showing 1–${maxRows} of ${result.values.length} rows</div>`
    : `<div class="wizard-preview-note">${result.values.length} row${result.values.length !== 1 ? 's' : ''}</div>`;

  return `
    <table class="wizard-preview-table">
      <thead>${headerHtml}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${rowCountNote}
  `;
}

// ─── Wizard event wiring ─────────────────────────────────────────────────────

function wireWizardEvents(modal, result) {
  // Close button
  modal.querySelector('#wizardClose').addEventListener('click', closeWizard);

  // Format cards
  modal.querySelectorAll('.wizard-format-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.disabled === 'true') return;
      state.format = card.dataset.format;
      updateWizardUI(modal, result);
    });
  });

  // Column checkboxes
  modal.querySelectorAll('.wizard-col-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const orig = cb.dataset.orig;
      const entry = state.columnMap.get(orig);
      if (entry) entry.selected = cb.checked;
      updateWizardUI(modal, result);
    });
  });

  // Column rename inputs
  modal.querySelectorAll('.wizard-col-rename').forEach(input => {
    input.addEventListener('input', () => {
      const orig = input.dataset.orig;
      const entry = state.columnMap.get(orig);
      if (entry) entry.renamed = input.value;
      // Update preview inline
      updatePreviewOnly(modal, result);
      updateDuplicateWarnings(modal);
      updateDownloadButton(modal);
    });
  });

  // CSV delimiter/encoding
  modal.querySelectorAll('.wizard-csv-delim, .wizard-csv-enc').forEach(sel => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.csvOpt;
      state.csvOptions[key] = sel.value;
    });
  });

  // Download button
  modal.querySelector('#wizardDownload').addEventListener('click', () => {
    performDownload(result);
  });
}

function updateWizardUI(modal, result) {
  // Update format cards
  modal.querySelectorAll('.wizard-format-card').forEach(card => {
    card.classList.toggle('active', card.dataset.format === state.format);
  });

  // Update CSV options visibility
  const csvStep = modal.querySelector('.wizard-csv-options');
  if (csvStep) csvStep.style.display = state.format === 'csv' ? '' : 'none';

  // Re-render CSV options if needed
  if (state.format === 'csv') {
    const csvRow = modal.querySelector('.wizard-csv-row');
    if (csvRow) csvRow.innerHTML = buildCsvOptions().replace(/^<div class="wizard-csv-row">|<\/div>\s*$/g, '');
    // Re-wire CSV selects
    modal.querySelectorAll('.wizard-csv-delim, .wizard-csv-enc').forEach(sel => {
      sel.addEventListener('change', () => {
        const key = sel.dataset.csvOpt;
        state.csvOptions[key] = sel.value;
      });
    });
  }

  // Re-render preview
  updatePreviewOnly(modal, result);
  updateDuplicateWarnings(modal);
  updateDownloadButton(modal);
}

function updatePreviewOnly(modal, result) {
  const previewWrap = modal.querySelector('.wizard-preview-wrap');
  if (previewWrap) {
    previewWrap.innerHTML = buildPreviewRows(result, 5);
  }
}

function updateDuplicateWarnings(modal) {
  const previewWrap = modal.querySelector('.wizard-preview-wrap');
  const existingWarn = modal.querySelector('.wizard-warning');
  if (existingWarn) existingWarn.remove();

  if (hasDuplicateRenames()) {
    const warning = document.createElement('div');
    warning.className = 'wizard-warning';
    warning.textContent = '⚠ Duplicate column names detected — please rename to unique values.';
    previewWrap?.insertAdjacentElement('afterend', warning);
  }
}

function updateDownloadButton(modal) {
  const btn = modal.querySelector('#wizardDownload');
  if (!btn) return;
  btn.disabled = hasDuplicateRenames();
}

// ─── Column map helpers ──────────────────────────────────────────────────────

function getSelectedColumns() {
  const result = [];
  state.columnMap.forEach((entry, originalName) => {
    if (entry.selected) {
      result.push({ originalName, displayName: entry.renamed });
    }
  });
  return result;
}

function hasDuplicateRenames() {
  const renamed = [];
  let hasDuplicate = false;
  state.columnMap.forEach(entry => {
    if (entry.selected) {
      if (renamed.includes(entry.renamed)) hasDuplicate = true;
      renamed.push(entry.renamed);
    }
  });
  return hasDuplicate;
}

// ─── Download ───────────────────────────────────────────────────────────────

function performDownload(result) {
  const selectedCols = getSelectedColumns();
  if (selectedCols.length === 0) return;

  const displayNames = selectedCols.map(c => c.displayName);
  const origIndices = selectedCols.map(c => result.columns.indexOf(c.originalName));
  const filteredRows = result.values.map(row => origIndices.map(i => row[i]));

  let content, filename, mimeType;

  if (state.format === 'csv') {
    const delimiter = state.csvOptions.delimiter;
    const enc = state.csvOptions.encoding;
    content = exportToCsvWithDelimiter(displayNames, filteredRows, delimiter);
    if (enc === 'UTF-8-BOM') content = '\uFEFF' + content;
    filename = timestampedFilename('csv');
    mimeType = enc === 'ASCII' ? 'text/plain' : 'text/csv;charset=UTF-8';
  } else if (state.format === 'json') {
    content = exportToJsonCustom(displayNames, filteredRows);
    filename = timestampedFilename('json');
    mimeType = 'application/json';
  } else if (state.format === 'xlsx') {
    const buf = exportToXlsx(displayNames, filteredRows);
    if (!buf) {
      // Show error via feedback
      import('./ui.js').then(m => m.showFeedback('error', 'Export', 'XLSX export failed — SheetJS not available.'));
      return;
    }
    filename = timestampedFilename('xlsx');
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    closeWizard();
    import('./ui.js').then(m => m.showFeedback('success', 'Export', `Exported ${filteredRows.length} rows as XLSX.`));
    return;
  }

  downloadBlob(content, filename, mimeType);
  closeWizard();
  import('./ui.js').then(m => m.showFeedback('success', 'Export', `Exported ${filteredRows.length} rows as ${state.format.toUpperCase()}.`));
}

function exportToCsvWithDelimiter(columns, rows, delimiter) {
  const escapeField = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    const needsQuotes = str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
    if (needsQuotes) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };
  const header = columns.map(c => escapeField(c)).join(delimiter);
  const dataRows = rows.map(row =>
    row.map(cell => escapeField(cell)).join(delimiter)
  );
  return [header, ...dataRows].join('\r\n');
}

function exportToJsonCustom(columns, rows) {
  const objects = rows.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

function timestampedFilename(ext) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `export_${yyyy}-${mm}-${dd}T${hh}-${min}.${ext}`;
}

// ─── Close ──────────────────────────────────────────────────────────────────

function closeWizard() {
  if (_wizardEl) {
    _wizardEl.remove();
    _wizardEl = null;
  }
  state.columnMap = new Map();
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function openExportWizard() {
  openWizard();
}
// Stored Procedure Editor - View, edit, create stored procedures.
// T-SQL syntax validation, parameter extraction, GO batch separator support.

import { validateTsql } from './apiClient.js';

let _isOpen = false;
let _currentSp = null;
let _dirty = false;
let _editor = null;
let _batches = [];
let _hooks = {};
let _validationTimer = null;
let _errorMarkers = [];

// Open SP editor
export function openSpEditor(spName = null) {
  _currentSp = spName;
  _dirty = false;
  _isOpen = true;

  // Render the SP editor panel
  renderSpEditorPanel();

  if (spName) {
    // Load existing SP definition
    loadStoredProcedure(spName);
  } else {
    // New procedure - initialize with template
    if (_editor) {
      _editor.setValue('-- CREATE PROCEDURE [dbo].[NewProcedure]\n-- @Param1 INT,\n-- @Param2 VARCHAR(50)\nAS\nBEGIN\n  -- Your SQL here\nEND');
      _editor.setCursor({ line: 0, ch: 0 });
    }
  }
}

// Close SP editor
export function closeSpEditor() {
  if (_dirty) {
    if (!confirm('You have unsaved changes. Discard?')) {
      return;
    }
  }
  _isOpen = false;
  _currentSp = null;
  _dirty = false;
  _batches = [];

  // Clean up CodeMirror markers
  if (_editor) {
    _errorMarkers.forEach(m => m.clear());
    _errorMarkers = [];
  }

  hideSpEditorPanel();
}

// Load stored procedure definition
async function loadStoredProcedure(spName) {
  try {
    const result = await fetchStoredProcedure(window.currentDatabase || 'master', spName);
    if (result && result.definition && _editor) {
      _editor.setValue(result.definition);
      _dirty = false;
      updateParameterStrip();
      splitAndRenderBatches();
    }
  } catch (err) {
    console.error('Failed to load stored procedure:', err);
  }
}

// Split text into batches by GO separator
export function splitBatches(spText) {
  const batchSeparator = /\nGO\s*;?\n/gi;
  const parts = spText.split(batchSeparator).filter(p => p.trim().length > 0);
  _batches = parts;
  return parts;
}

// Extract parameters from CREATE PROCEDURE signature
export function extractParameters(spText) {
  const match = spText.match(/CREATE\s+PROCEDURE\s+(\w+)\s+([\s\S]*?)\s+AS\s+BEGIN/i);
  if (!match) {
    // Try alternative pattern without BEGIN
    const match2 = spText.match(/CREATE\s+PROCEDURE\s+(\w+)\s+([\s\S]*?)\s+AS\s+/i);
    if (!match2) return [];
  }

  const paramsStr = match ? match[2] : match2[2];
  const paramMatches = [...paramsStr.matchAll(/@(\w+)\s+(\w+(?:\(\d+\))?)\s*(=\s*([^,\n]+))?/gi)];
  return paramMatches.map(m => ({
    name: m[1],
    type: m[2],
    default: m[4]?.trim()
  }));
}

// Update parameter strip above editor
function updateParameterStrip() {
  const strip = document.getElementById('sp-param-strip');
  if (!strip) return;

  const params = extractParameters(_editor ? _editor.getValue() : '');

  if (params.length === 0) {
    strip.innerHTML = '<span class="sp-no-params">No parameters</span>';
    return;
  }

  strip.innerHTML = params.map(p => `
    <span class="sp-param-chip">
      <span class="sp-param-name">@${p.name}</span>
      <span class="sp-param-type">${p.type}${p.default ? ' = ' + p.default : ''}</span>
    </span>
  `).join('');
}

// Split and render GO batch dividers
function splitAndRenderBatches() {
  if (!_editor) return;
  const text = _editor.getValue();
  splitBatches(text);
  renderGoDividers();
}

// Render GO dividers in CodeMirror gutter
function renderGoDividers() {
  if (!_editor) return;

  // Clear existing markers
  _editor.eachLine((line) => {
    // Clear any existing GO line markers
  });

  // Find GO lines and mark them
  const doc = _editor.getDoc();
  const lines = doc.getValue().split('\n');

  lines.forEach((line, index) => {
    if (line.trim().toUpperCase() === 'GO') {
      // Add a gutter marker or line decoration
      _editor.addLineClass(index, 'background', 'sp-go-line');
    }
  });
}

// Validate T-SQL (debounced)
async function validateSp() {
  if (!_editor) return;

  // Clear previous errors
  clearValidationErrors();

  const text = _editor.getValue();
  if (!text.trim()) return;

  try {
    const result = await validateTsql(text);

    if (!result.valid && result.errors) {
      showValidationErrors(result.errors);
    }
  } catch (err) {
    console.error('Validation error:', err);
  }
}

// Show validation errors inline
function showValidationErrors(errors) {
  if (!_editor) return;

  const doc = _editor.getDoc();

  errors.forEach(err => {
    const lineNum = (err.line || 1) - 1;
    const lineHandle = doc.getLineHandle(lineNum);
    if (lineHandle) {
      // Add wavy underline
      const marker = doc.markText(
        { line: lineNum, ch: 0 },
        { line: lineNum, ch: lineHandle.text.length },
        { className: 'sp-validation-error',
          attributes: { title: err.message || 'Syntax error' }
        }
      );
      _errorMarkers.push(marker);
    }
  });
}

// Clear validation errors
function clearValidationErrors() {
  _errorMarkers.forEach(m => m.clear());
  _errorMarkers = [];
}

// Save procedure
async function saveProcedure() {
  if (!_editor) return;

  const text = _editor.getValue();
  const db = window.currentDatabase || 'master';
  const name = _currentSp || 'NewProcedure';

  try {
    const result = await saveStoredProcedure(db, name, text);

    if (result.error) {
      showFeedback('error', 'Save Failed', result.error);
      return;
    }

    _dirty = false;
    toast('Procedure saved', 'Success');
    if (_hooks.onSpSave) {
      _hooks.onSpSave(name);
    }
  } catch (err) {
    showFeedback('error', 'Save Failed', err.message);
  }
}

// Render the SP editor panel
function renderSpEditorPanel() {
  // Check if panel already exists
  let panel = document.getElementById('sp-editor-panel');
  if (panel) {
    panel.style.display = 'flex';
    return;
  }

  const panelHtml = `
    <div id="sp-editor-panel" class="sp-editor-panel">
      <div class="sp-editor-header">
        <h3>⚡ SP Editor</h3>
        <div class="sp-header-actions">
          <button class="sp-new-btn" id="sp-new-btn">+ New</button>
          <button class="sp-close-btn" id="sp-close-btn">×</button>
        </div>
      </div>
      <div id="sp-param-strip" class="sp-param-strip">
        <span class="sp-no-params">No parameters</span>
      </div>
      <div id="sp-editor-area" class="sp-editor-area"></div>
      <button class="sp-save-btn" id="sp-save-btn">Save Procedure</button>
    </div>
  `;

  // Find the right panel and insert
  const rightPanel = document.querySelector('.right');
  if (rightPanel) {
    rightPanel.insertAdjacentHTML('beforeend', panelHtml);
    initSpEditorCodeMirror();
    wireSpEditorEvents();
  }
}

// Initialize CodeMirror for SP editor
function initSpEditorCodeMirror() {
  const editorArea = document.getElementById('sp-editor-area');
  if (!editorArea) return;

  if (typeof CodeMirror === 'undefined') {
    console.error('CodeMirror not loaded');
    return;
  }

  _editor = CodeMirror(editorArea, {
    mode: 'text/x-sql',
    theme: 'default',
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    value: ''
  });

  // Listen for changes
  _editor.on('change', () => {
    _dirty = true;
    updateParameterStrip();
    splitAndRenderBatches();

    // Debounced validation
    if (_validationTimer) clearTimeout(_validationTimer);
    _validationTimer = setTimeout(validateSp, 800);
  });
}

// Wire SP editor button events
function wireSpEditorEvents() {
  document.getElementById('sp-close-btn')?.addEventListener('click', closeSpEditor);
  document.getElementById('sp-new-btn')?.addEventListener('click', () => {
    openSpEditor(null);
  });
  document.getElementById('sp-save-btn')?.addEventListener('click', saveProcedure);
}

// Hide the SP editor panel
function hideSpEditorPanel() {
  const panel = document.getElementById('sp-editor-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

// Set hooks for external integration
export function setSpEditorHooks({ onSpSave, onSpSelect }) {
  _hooks.onSpSave = onSpSave;
  _hooks.onSpSelect = onSpSelect;
}

// Check if editor is open
export function isSpEditorOpen() {
  return _isOpen;
}

// Get current SP name
export function getCurrentSpName() {
  return _currentSp;
}
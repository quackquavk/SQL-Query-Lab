// Optimization Highlights - Inline wavy underlines in editor with click-to-show tooltips.

let _editor = null;
let _decorations = [];
let _tooltipEl = null;
let _enabled = false;

export function enableOptimizationHints(editor, suggestions) {
  _editor = editor;
  clearOptimizationDecorations();
  _enabled = true;

  if (!suggestions || suggestions.length === 0) return;

  suggestions.forEach(s => {
    try {
      const line = Math.max(0, (s.line || 1) - 1);
      const from = CodeMirror.Pos(line, Math.max(0, (s.column || 1) - 1));
      const to = CodeMirror.Pos(line, Math.max(0, from.ch + (s.length || 10)));

      const deco = editor.markText(from, to, {
        className: 'optimization-highlight',
        title: s.message
      });

      _decorations.push({ deco, suggestion: s });
    } catch (e) {
      console.warn('Failed to add optimization highlight:', e);
    }
  });

  editor.on('click', handleHighlightClick);
}

export function clearOptimizationDecorations() {
  _decorations.forEach(d => {
    try { d.deco.clear(); } catch (e) {}
  });
  _decorations = [];
  hideTooltip();
}

export function disableOptimizationHints() {
  clearOptimizationDecorations();
  _enabled = false;
  if (_editor) {
    _editor.off('click', handleHighlightClick);
  }
}

export function isOptimizationEnabled() {
  return _enabled;
}

function handleHighlightClick(cm, e) {
  const pos = cm.coordsChar(e);
  const markers = cm.findMarksAt(pos);

  for (const marker of markers) {
    const deco = _decorations.find(d => d.deco === marker);
    if (deco) {
      showTooltip(e, deco.suggestion);
      return;
    }
  }

  if (_tooltipEl && !_tooltipEl.contains(e.target)) {
    hideTooltip();
  }
}

function showTooltip(event, suggestion) {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'optimization-tooltip';
    document.body.appendChild(_tooltipEl);
  }

  const typeLabel = suggestion.type?.toUpperCase() || 'SUGGESTION';
  const typeClass = suggestion.type === 'index' ? 'type-index' : suggestion.type === 'restructure' ? 'type-restructure' : 'type-syntax';

  let html = `
    <div class="optimization-tooltip-header">
      <span class="optimization-tooltip-type ${typeClass}">${typeLabel}</span>
    </div>
    <div class="optimization-tooltip-message">${suggestion.message || ''}</div>
  `;

  if (suggestion.sql) {
    html += `<div class="optimization-tooltip-sql">${escapeHtml(suggestion.sql)}</div>`;
  }

  if (suggestion.createStatement) {
    html += `<div class="optimization-tooltip-create">${escapeHtml(suggestion.createStatement)}</div>`;
  }

  _tooltipEl.innerHTML = html;

  let left = event.pageX + 15;
  let top = event.pageY + 15;

  if (left + 320 > window.innerWidth) {
    left = event.pageX - 330;
  }

  if (top + 200 > window.innerHeight) {
    top = event.pageY - 220;
  }

  _tooltipEl.style.display = 'block';
  _tooltipEl.style.left = left + 'px';
  _tooltipEl.style.top = top + 'px';

  document.addEventListener('click', closeTooltipOnClickOutside);
}

function hideTooltip() {
  if (_tooltipEl) {
    _tooltipEl.style.display = 'none';
  }
  document.removeEventListener('click', closeTooltipOnClickOutside);
}

function closeTooltipOnClickOutside(e) {
  if (_tooltipEl && !_tooltipEl.contains(e.target) && !e.target.classList.contains('optimization-highlight')) {
    hideTooltip();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
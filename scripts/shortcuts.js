// Keyboard shortcut registry and modal management

export const SHORTCUTS = [
  // Editor
  { id: 'toggle-comment', category: 'Editor', action: 'Toggle comment', keys: ['Ctrl+/', 'Cmd+/'], description: 'Toggle // comment on the current line or selection' },
  { id: 'format', category: 'Editor', action: 'Format SQL', keys: ['Ctrl+Q', 'Cmd+Q'], description: 'Beautify and align the SQL in the editor' },
  { id: 'format-alt', category: 'Editor', action: 'Format SQL (alt)', keys: ['Ctrl+S', 'Cmd+S'], description: 'Beautify and align the SQL in the editor' },
  { id: 'autocomplete', category: 'Editor', action: 'Autocomplete', keys: ['Ctrl+Space', 'Cmd+Space'], description: 'Trigger SQL keyword and column-name autocomplete' },
  { id: 'indent', category: 'Editor', action: 'Indent selection', keys: ['Tab'], description: 'Indent the selected lines' },

  // Navigation
  { id: 'find', category: 'Navigation', action: 'Find', keys: ['Ctrl+F', 'Cmd+F'], description: 'Search for text in the editor' },
  { id: 'replace', category: 'Navigation', action: 'Replace', keys: ['Ctrl+H', 'Cmd+H'], description: 'Search and replace text in the editor' },
  { id: 'next', category: 'Navigation', action: 'Next match', keys: ['Ctrl+G', 'Cmd+G'], description: 'Jump to the next search match' },
  { id: 'prev', category: 'Navigation', action: 'Previous match', keys: ['Ctrl+Shift+G', 'Cmd+Shift+G'], description: 'Jump to the previous search match' },
  { id: 'goto-line', category: 'Navigation', action: 'Go to line', keys: ['Alt+G'], description: 'Jump to a specific line number' },
  { id: 'escape', category: 'Navigation', action: 'Focus editor', keys: ['Escape'], description: 'Return keyboard focus to the editor' },

  // Query
  { id: 'run', category: 'Query', action: 'Run query', keys: ['Ctrl+Enter', 'Cmd+Enter'], description: 'Execute the current SQL statement(s)' },
  { id: 'run-f5', category: 'Query', action: 'Run query (F5)', keys: ['F5'], description: 'Execute the current SQL statement(s)' },
  { id: 'cancel', category: 'Query', action: 'Cancel query', keys: ['Escape'], description: 'Cancel a running live-mode query' },

  // View
  { id: 'shortcuts', category: 'View', action: 'Keyboard shortcuts', keys: ['Ctrl+/', 'Cmd+/'], description: 'Open this shortcut reference' },
  { id: 'profile', category: 'View', action: 'Toggle column profile', keys: ['Ctrl+P', 'Cmd+P'], description: 'Show or hide the column profile panel' },
  { id: 'theme-light', category: 'View', action: 'Light theme', keys: ['Ctrl+Shift+L', 'Cmd+Shift+L'], description: 'Switch to light color theme' },
  { id: 'theme-dark', category: 'View', action: 'Dark theme', keys: ['Ctrl+Shift+D', 'Cmd+Shift+D'], description: 'Switch to dark color theme' },

  // General
  { id: 'backup', category: 'General', action: 'Backup database', keys: ['Ctrl+Shift+B', 'Cmd+Shift+B'], description: 'Open the backup wizard (Live mode only)' },
  { id: 'restore', category: 'General', action: 'Restore database', keys: ['Ctrl+Shift+R', 'Cmd+Shift+R'], description: 'Open the restore wizard (Live mode only)' },
  { id: 'optimize', category: 'General', action: 'Query optimization', keys: ['Ctrl+Shift+O', 'Cmd+Shift+O'], description: 'Analyze query and suggest indexes' },
];

function groupByCategory(shortcuts) {
  const groups = {};
  for (const s of shortcuts) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }
  return groups;
}

function renderShortcutList() {
  const list = document.getElementById('shortcutList');
  if (!list) return;

  const search = document.getElementById('shortcutSearch');
  const query = search ? search.value.toLowerCase().trim() : '';

  const filtered = query
    ? SHORTCUTS.filter(s =>
        s.action.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.keys.some(k => k.toLowerCase().includes(query))
      )
    : SHORTCUTS;

  const groups = groupByCategory(filtered);

  let html = '';
  for (const [category, shortcuts] of Object.entries(groups)) {
    html += `<div class="shortcut-group">
  <div class="shortcut-cat">${category}</div>`;
    for (const s of shortcuts) {
      const keysStr = s.keys.map(k => `<kbd>${k}</kbd>`).join('&nbsp;&nbsp;');
      html += `<div class="shortcut-row">
    <span class="shortcut-action">${s.action}</span>
    <span class="shortcut-keys">${keysStr}</span>
    <span class="shortcut-desc">${s.description}</span>
  </div>`;
    }
    html += '</div>';
  }

  if (filtered.length === 0) {
    html = '<div class="shortcut-empty">No shortcuts match your search.</div>';
  }

  list.innerHTML = html;
}

export function openShortcutModal() {
  const modal = document.getElementById('shortcutModal');
  if (!modal) return;
  modal.classList.add('open');
  // Clear search and render all shortcuts
  const search = document.getElementById('shortcutSearch');
  if (search) search.value = '';
  renderShortcutList();
  // Focus search input for quick typing
  setTimeout(() => search && search.focus(), 50);
}

export function closeShortcutModal() {
  const modal = document.getElementById('shortcutModal');
  if (!modal) return;
  modal.classList.remove('open');
  // Return focus to editor if open
  if (runtime?.editor) {
    runtime.editor.focus();
  }
}

export function getShortcuts() {
  return SHORTCUTS;
}

// Wire search input on first open — called from main.js via module init
export function initShortcutSearch() {
  const search = document.getElementById('shortcutSearch');
  if (search) {
    search.addEventListener('input', renderShortcutList);
  }
}

// CodeMirror editor setup. Depends on global CodeMirror loaded via CDN.

import * as runtime from './runtime.js';
import { state, persist, saveDraft } from './state.js';
import { formatEditorSql } from './format.js';

export function initEditor({ runQuery, runMssqlTranslation }) {
  const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    mode: 'text/x-sql',
    theme: 'querylab',
    lineNumbers: true,
    matchBrackets: true,
    styleActiveLine: true,
    indentUnit: 2,
    smartIndent: true,
    extraKeys: {
      'Ctrl-Enter': () => { if (runtime.cursor.currentMode === 'mssql') runMssqlTranslation(); else runQuery(); },
      'Cmd-Enter':  () => { if (runtime.cursor.currentMode === 'mssql') runMssqlTranslation(); else runQuery(); },
      'Ctrl-Q': formatEditorSql,
      'Cmd-Q':  formatEditorSql,
      'Ctrl-Space': 'autocomplete'
    },
    hintOptions: {
      tables: {},
      completeSingle: false,
      closeOnUnfocus: true
    }
  });

  // Auto-trigger autocomplete as the user types word characters
  editor.on('inputRead', function(cm, change) {
    if (change.text.length !== 1) return;
    const ch = change.text[0];
    if (/[\w.]/.test(ch) && !cm.state.completionActive) {
      setTimeout(() => {
        if (!cm.state.completionActive) {
          cm.showHint({ completeSingle: false });
        }
      }, 50);
    }
  });

  // Persist drafts (practice) or sandbox script as the user types
  editor.on('change', () => {
    if (runtime.cursor.editorLoading) return;
    if (runtime.cursor.currentMode === 'sandbox') {
      state.sandboxScript = editor.getValue();
      persist();
    } else {
      saveDraft(runtime.cursor.currentQuestionId, editor.getValue());
    }
  });

  runtime.setEditor(editor);
  return editor;
}

// Apply CodeMirror font override (originally inserted via document.head append)
export function injectCodemirrorFontFix() {
  const cmStyleFix = document.createElement('style');
  cmStyleFix.textContent = `.CodeMirror { font-family: var(--mono) !important; }`;
  document.head.appendChild(cmStyleFix);
}

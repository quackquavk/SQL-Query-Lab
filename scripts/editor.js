// CodeMirror editor setup. Depends on global CodeMirror loaded via CDN.

import * as runtime from './runtime.js';
import { state, persist, saveDraft } from './state.js';
import { formatEditorSql } from './format.js';

const TSQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ORDER', 'BY', 'GROUP',
  'HAVING', 'DISTINCT', 'TOP', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY', 'AS', 'ASC',
  'DESC', 'NULL', 'IS', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE',
  'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'PROCEDURE', 'FUNCTION', 'TRIGGER',
  'DATABASE', 'SCHEMA', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'BEGIN',
  'END', 'IF', 'ELSE', 'WHILE', 'CASE', 'WHEN', 'THEN', 'DECLARE', 'EXEC', 'EXECUTE',
  'OUTPUT', 'UNION', 'ALL', 'PIVOT', 'UNPIVOT', 'WITH', 'CTE', 'OVER', 'PARTITION',
  'RANK', 'ROW_NUMBER', 'DENSE_RANK', 'LEAD', 'LAG', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX',
  'CAST', 'CONVERT', 'COALESCE', 'NULLIF', 'IIF', 'TRY', 'CATCH', 'THROW', 'RAISERROR',
  'GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'DATEADD', 'DATEDIFF', 'DATEPART', 'YEAR',
  'MONTH', 'DAY', 'SUBSTRING', 'CHARINDEX', 'LEN', 'LTRIM', 'RTRIM', 'REPLACE', 'UPPER',
  'LOWER', 'ISNULL', 'NVL', 'COUNT_BIG', '@@ROWCOUNT', '@@ERROR', 'SCOPE_IDENTITY',
  'IDENT_CURRENT', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'BIT', 'DECIMAL', 'NUMERIC',
  'MONEY', 'SMALLMONEY', 'FLOAT', 'REAL', 'CHAR', 'VARCHAR', 'NVARCHAR', 'NCHAR',
  'NTEXT', 'TEXT', 'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'TIMESTAMP',
  'UNIQUEIDENTIFIER', 'XML', 'JSON', 'BINARY', 'VARBINARY', 'IMAGE', 'IDENTITY', 'PRIMARY',
  'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CHECK', 'UNIQUE', 'CLUSTERED',
  'NONCLUSTERED', 'INCLUDE', 'OPTION', 'RECOMPILE', 'NOLOCK', 'READUNCOMMITTED',
  'READCOMMITTED', 'REPEATABLEREAD', 'SERIALIZABLE', 'HOLDLOCK', 'UPDLOCK', 'TABLOCK',
  'XLOCK', 'ROWLOCK', 'ANY', 'SOME', 'EXCEPT', 'INTERSECT', 'RETURN', 'PRINT', 'WAITFOR',
  ' raiserror', 'sp_executesql', 'xp_cmdshell', 'sys', 'dm_db', 'dm_exec', 'dm_os'
];

function sqlHint(cm) {
  const cur = cm.getCursor();
  const token = cm.getTokenAt(cur);
  if (!/^[\w.]+$/.test(token.string)) return null;

  const matches = TSQL_KEYWORDS.filter(k => k.toLowerCase().startsWith(token.string.toLowerCase()))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().indexOf(token.string.toLowerCase()) === 0;
      const bStarts = b.toLowerCase().indexOf(token.string.toLowerCase()) === 0;
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.length - b.length;
    })
    .slice(0, 12)
    .map(k => ({ text: k, displayText: k }));

  if (matches.length === 0) return null;

  return {
    list: matches,
    from: CodeMirror.Pos(cur.line, token.start),
    to: cur
  };
}

export function initEditor({ runQuery, runMssqlTranslation, runLiveQuery }) {
  const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    mode: 'text/x-sql',
    theme: 'querylab',
    lineNumbers: true,
    matchBrackets: true,
    styleActiveLine: true,
    indentUnit: 2,
    smartIndent: true,
    extraKeys: {
      'F5': () => { const fn = runtime.getEditorQueryExecutor?.(); if (fn) fn(); },
      'Ctrl-Enter': () => { if (runtime.cursor.currentMode === 'mssql') runMssqlTranslation(); else { const fn = runtime.getEditorQueryExecutor?.(); if (fn) fn(); } },
      'Cmd-Enter':  () => { if (runtime.cursor.currentMode === 'mssql') runMssqlTranslation(); else { const fn = runtime.getEditorQueryExecutor?.(); if (fn) fn(); } },
      'Ctrl-Q': formatEditorSql,
      'Cmd-Q':  formatEditorSql,
      'Ctrl-S': formatEditorSql,
      'Cmd-S':  formatEditorSql,
      'Ctrl-/': function(cm) { cm.toggleComment({ lineComment: '--' }); },
      'Cmd-/': function(cm) { cm.toggleComment({ lineComment: '--' }); },
      'Ctrl-F': 'findPersistent',
      'Cmd-F': 'findPersistent',
      'Ctrl-H': 'replace',
      'Cmd-H': 'replace',
      'Escape': function(cm) { cm.focus(); },
      'Ctrl-Space': 'autocomplete',
      'Ctrl-Shift-O': function(cm) {
        if (runtime.cursor.currentMode === 'live') {
          import('./sandbox.js').then(m => {
            if (m.isOptimizationEnabled()) {
              m.disableOptimizationHints();
            } else {
              const sql = cm.getValue();
              if (sql.trim()) m.fetchAndShowOptimizations(sql);
            }
          });
        }
      },
      'Cmd-Shift-O': function(cm) {
        if (runtime.cursor.currentMode === 'live') {
          import('./sandbox.js').then(m => {
            if (m.isOptimizationEnabled()) {
              m.disableOptimizationHints();
            } else {
              const sql = cm.getValue();
              if (sql.trim()) m.fetchAndShowOptimizations(sql);
            }
          });
        }
      }
    },
    hintOptions: {
      tables: {},
      completeSingle: false,
      closeOnUnfocus: true
    }
  });

  CodeMirror.registerHelper('hint', 'sql', sqlHint);
  CodeMirror.hint.sql = sqlHint;

  const origShowHint = editor.showHint.bind(editor);
  editor.showHint = function(options) {
    return origShowHint(Object.assign({}, options || {}, { hint: sqlHint }));
  };

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
  // Also mark active tab dirty if tab workspace is active
  editor.on('change', () => {
    if (runtime.cursor.editorLoading) return;
    if (runtime.cursor.currentMode === 'sandbox') {
      state.sandboxScript = editor.getValue();
      persist();
    } else {
      saveDraft(runtime.cursor.currentQuestionId, editor.getValue());
    }
    // Mark tab dirty when content changes
    if (runtime.activeTabId && runtime.openTabs && runtime.openTabs.length > 0) {
      runtime.openTabs.forEach(t => {
        if (t.id === runtime.activeTabId) t.dirty = true;
      });
      if (typeof markTabDirty === 'function') markTabDirty(runtime.activeTabId, true);
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

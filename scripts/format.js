// SQL formatter. Uppercases keywords, line-breaks major clauses,
// keeps strings/comments intact. Good-enough prettifier.

import * as runtime from './runtime.js';

export function formatSql(raw) {
  if (!raw || !raw.trim()) return raw;

  const tokens = [];
  let sql = raw.replace(
    /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|--[^\n]*|\/\*[\s\S]*?\*\//g,
    (m) => { tokens.push(m); return `~TOK${tokens.length - 1}~`; }
  );

  sql = sql.replace(/\s+/g, ' ').trim();

  const multi = [
    'LEFT OUTER JOIN','RIGHT OUTER JOIN','FULL OUTER JOIN',
    'LEFT JOIN','RIGHT JOIN','INNER JOIN','CROSS JOIN','FULL JOIN',
    'GROUP BY','ORDER BY','PARTITION BY','INSERT INTO','DELETE FROM',
    'CREATE TABLE','CREATE INDEX','CREATE UNIQUE INDEX','CREATE VIEW',
    'ALTER TABLE','DROP TABLE','DROP INDEX','DROP VIEW',
    'IS NOT NULL','IS NULL','NOT IN','NOT LIKE','NOT BETWEEN','NOT EXISTS',
    'UNION ALL','PRIMARY KEY','FOREIGN KEY','NOT NULL',
    'ADD COLUMN','RENAME TO','RENAME COLUMN','IF EXISTS','IF NOT EXISTS',
    'ON CONFLICT','ON DELETE','ON UPDATE'
  ];
  for (const kw of multi) {
    sql = sql.replace(new RegExp('\\b' + kw.replace(/ /g, '\\s+') + '\\b', 'gi'), kw);
  }

  const single = [
    'SELECT','FROM','WHERE','HAVING','LIMIT','OFFSET','JOIN','ON','USING',
    'AND','OR','AS','IN','NOT','LIKE','BETWEEN','UNION','INTERSECT','EXCEPT',
    'DISTINCT','ALL','ANY','EXISTS','CASE','WHEN','THEN','ELSE','END',
    'WITH','VALUES','RETURNING','UPDATE','SET','INSERT','DELETE','CREATE',
    'ALTER','DROP','RENAME','REPLACE','TABLE','INDEX','VIEW','COLUMN','INTO',
    'ASC','DESC','TRUE','FALSE','NULL','DEFAULT','CHECK','UNIQUE','REFERENCES',
    'CONSTRAINT','IF','CAST','TEXT','INTEGER','REAL','BLOB','NUMERIC','BOOLEAN',
    'PRAGMA','VACUUM','BEGIN','COMMIT','ROLLBACK','TRANSACTION','AUTOINCREMENT'
  ];
  for (const kw of single) {
    sql = sql.replace(new RegExp('\\b' + kw + '\\b', 'gi'), kw);
  }

  const clauses = [
    'FROM','WHERE','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET',
    'LEFT OUTER JOIN','RIGHT OUTER JOIN','FULL OUTER JOIN',
    'LEFT JOIN','RIGHT JOIN','INNER JOIN','CROSS JOIN','FULL JOIN','JOIN',
    'UNION ALL','UNION','INTERSECT','EXCEPT','VALUES','SET','RETURNING'
  ];
  for (const c of clauses) {
    const re = new RegExp('(\\S)\\s+(' + c.replace(/ /g, '\\s+') + ')(\\s|$)', 'g');
    sql = sql.replace(re, '$1\n$2$3');
  }

  sql = sql.replace(/\b(LEFT OUTER|RIGHT OUTER|FULL OUTER|LEFT|RIGHT|INNER|CROSS|FULL)\s*\n\s*JOIN\b/g, '$1 JOIN');

  sql = sql.replace(/;\s*/g, ';\n\n');

  sql = sql.replace(/~TOK(\d+)~/g, (_, i) => {
    const tok = tokens[parseInt(i)];
    if (/^--/.test(tok)) return tok + '\n';
    return tok;
  });

  sql = sql.split('\n').map(l => l.trimEnd()).join('\n');
  sql = sql.replace(/\n +/g, '\n');
  sql = sql.replace(/\n{3,}/g, '\n\n');
  return sql.trim() + '\n';
}

export function formatEditorSql() {
  const editor = runtime.editor;
  if (!editor) return;
  const cur = editor.getValue();
  try {
    const out = formatSql(cur);
    if (out !== cur) {
      const cursor = editor.getCursor();
      editor.setValue(out);
      editor.setCursor({ line: Math.min(cursor.line, editor.lineCount() - 1), ch: 0 });
    }
    editor.focus();
  } catch (e) {
    console.error('format error', e);
  }
}

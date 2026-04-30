export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Tiny SQL syntax highlighter for the static solution display.
// Stash strings/comments first (word-char delimiters so the number-regex
// can't reach into them), then escape HTML, then tag keywords & numbers,
// then restore the stash with proper span classes.
export function highlightSql(sql) {
  const stash = [];
  let text = sql.replace(
    /'(?:[^'\\]|\\.|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g,
    (m) => {
      stash.push(m);
      return `SQLSTASHZ${stash.length - 1}ZEND`;
    }
  );

  text = escapeHtml(text);

  const keywords = [
    'SELECT','FROM','WHERE','HAVING','LIMIT','OFFSET','JOIN','ON','USING',
    'AND','OR','AS','IN','NOT','LIKE','BETWEEN','UNION','INTERSECT','EXCEPT',
    'DISTINCT','ALL','ANY','EXISTS','CASE','WHEN','THEN','ELSE','END','WITH',
    'VALUES','UPDATE','SET','INSERT','DELETE','CREATE','ALTER','DROP','RENAME',
    'REPLACE','TABLE','INDEX','VIEW','COLUMN','INTO','ASC','DESC','TRUE','FALSE',
    'NULL','DEFAULT','CHECK','UNIQUE','REFERENCES','CONSTRAINT','IF','CAST',
    'TEXT','INTEGER','REAL','BLOB','NUMERIC','BOOLEAN','PRAGMA','AUTOINCREMENT',
    'GROUP BY','ORDER BY','PARTITION BY',
    'LEFT OUTER JOIN','RIGHT OUTER JOIN','FULL OUTER JOIN',
    'LEFT JOIN','RIGHT JOIN','INNER JOIN','FULL JOIN','CROSS JOIN',
    'INSERT INTO','DELETE FROM','IS NULL','IS NOT NULL',
    'NOT IN','NOT EXISTS','NOT LIKE','UNION ALL',
    'PRIMARY KEY','FOREIGN KEY','NOT NULL',
    'ADD COLUMN','RENAME TO','RENAME COLUMN',
    'CREATE TABLE','CREATE INDEX','CREATE UNIQUE INDEX','CREATE VIEW',
    'ALTER TABLE','DROP TABLE','DROP INDEX',
    'IF EXISTS','IF NOT EXISTS','OR REPLACE','INSERT OR REPLACE',
    'ROW_NUMBER','RANK','DENSE_RANK','OVER','SUM','AVG','COUNT',
    'MIN','MAX','ROUND','COALESCE','IFNULL','GROUP_CONCAT'
  ].sort((a, b) => b.length - a.length);

  for (const k of keywords) {
    const re = new RegExp('\\b' + k.replace(/ /g, '\\s+') + '\\b', 'g');
    text = text.replace(re, `<span class="kw">${k}</span>`);
  }

  text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="num">$1</span>');

  text = text.replace(/SQLSTASHZ(\d+)ZEND/g, (_, i) => {
    const raw = stash[parseInt(i)];
    const cls = raw.startsWith('--') || raw.startsWith('/*') ? 'cmt' : 'str';
    return `<span class="${cls}">${escapeHtml(raw)}</span>`;
  });
  return text;
}

export function previewStatement(stmt, max = 80) {
  const s = stmt.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Split a multi-statement script into individual statements,
// respecting strings and comments so semicolons inside them don't
// prematurely terminate a statement.
export function splitSqlStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { cur += sql[i++]; }
      continue;
    }
    if (c === '/' && next === '*') {
      cur += c + next; i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i+1] === '/')) { cur += sql[i++]; }
      if (i < sql.length) { cur += sql[i] + sql[i+1]; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      cur += c; i++;
      while (i < sql.length) {
        if (sql[i] === '\\' && i + 1 < sql.length) { cur += sql[i] + sql[i+1]; i += 2; continue; }
        if (sql[i] === q && sql[i+1] === q) { cur += q + q; i += 2; continue; }
        if (sql[i] === q) { cur += q; i++; break; }
        cur += sql[i++];
      }
      continue;
    }
    if (c === ';') {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
      i++;
      continue;
    }
    cur += sql[i++];
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

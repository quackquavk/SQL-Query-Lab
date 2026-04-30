# Testing Patterns

**Analysis Date:** 2026-04-30

## Test Framework

**None detected.**
- No Jest, Vitest, Mocha, or other test runner found
- No `package.json` with test scripts found
- No test configuration files (`jest.config.*`, `vitest.config.*`, `.mocharc.*`)

## Test File Organization

**No test files exist.**
- No `test/`, `tests/`, `__tests__/`, or `spec/` directories
- No `*.test.js`, `*.spec.js`, `*.test.ts`, or `*.spec.ts` files

## Manual Testing Approach

The codebase uses **manual browser testing** for validation:

1. **SQL Execution** — All queries run against an in-browser sql.js database
2. **Query Validation** — Practice mode validates user SQL by comparing:
   - Result sets (for `SELECT` questions): `compareResults()` in `scripts/practice.js`
   - Database state snapshots (for `INSERT/UPDATE/DELETE/DDL`): verification queries compare before/after state
3. **UI Feedback** — Errors and success states rendered via `showFeedback()` in `scripts/ui.js`

**Example validation flow (practice.js):**
```javascript
// For SELECT questions — compare result sets
const match = compareResults(runtime.cursor.lastUserResult, runtime.cursor.lastExpectedResult);
if (match.ok) {
  markSolved(q.id, updateProgressUI);
  showFeedback('success', 'Correct', 'Your result matches the expected output.');
}

// For state-mutating questions — compare post-mutation DB state
const refClone = cloneFromPristine(runtime.cursor.currentDbName);
refClone.exec(q.referenceQuery);
const refVerif = refClone.exec(q.verificationQuery);
const match = compareResults(userVerif, refVerif);
```

## CI/CD Setup

**None detected.**
- No `.github/workflows/` directory
- No `.gitlab-ci.yml`, `Jenkinsfile`, or similar
- No `Makefile` or task runner scripts

**Deployment:**
- Static HTML/JS/CSS served directly — no build step required
- sql.js loaded from CDN: `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/`
- CodeMirror loaded from CDN

## What Could Be Tested

Given the current architecture, the following could be unit-tested:

**`utils.js` — Pure functions:**
```javascript
escapeHtml(s)              // String escaping
normalizeCell(v)           // Cell value normalization
splitSqlStatements(sql)    // SQL parsing
previewStatement(stmt, max)  // Statement truncation
highlightSql(sql)          // SQL syntax highlighting (returns HTML)
```

**`format.js` — SQL formatter:**
```javascript
formatSql(raw)             // Pure transformation, input → formatted SQL string
```

**`state.js` — State logic:**
```javascript
defaultState()             // Default state shape
loadState()                // localStorage parsing with legacy migration
formatHistoryTime(ts)      // Time formatting
bytesToBase64() / base64ToBytes()  // Encoding utilities
```

**`practice.js` — Comparison logic:**
```javascript
compareResults(a, b)        // Core comparison algorithm (pure)
normalizeCell(v)           // Already in same file
```

**Recommendation for adding tests:**
- Install Vitest (`npm i -D vitest`)
- Create `tests/` directory
- Add `vitest.config.js` with `include: ['tests/**/*.test.js']`
- Test files co-located: `tests/utils.test.js`, `tests/format.test.js`, etc.
- Mock `localStorage` for state tests
- Mock sql.js `Database` for DB-layer tests

---

*Testing analysis: 2026-04-30*

# Architecture

**Analysis Date:** 2026-04-30

## Pattern Overview

**Overall:** Single-page application with client-side SQL execution using sql.js (SQLite compiled to WebAssembly).

**Key Characteristics:**
- ES module-based modular architecture with explicit imports between modules
- Runtime singleton pattern for shared state (`runtime.js`)
- Persistent state via localStorage with debounced saves
- Three distinct operating modes: Practice, Sandbox, MS SQL Translation
- Client-side only — no backend, all databases live in browser memory via sql.js

## Layers

**UI Layer:**
- Purpose: Render interface, handle user input and DOM events
- Location: `index.html`, `scripts/ui.js`, `scripts/editor.js`
- Contains: DOM rendering functions, event listeners wired in `main.js`
- Depends on: `runtime.js` (for editor, cursor state), `state.js` (for persisted data)
- Used by: User interactions trigger handlers in `main.js` which call other modules

**Query Execution Layer:**
- Purpose: Execute SQL against in-browser SQLite databases
- Location: `scripts/sandbox.js`, `scripts/practice.js`, `scripts/db.js`
- Contains: Query running, validation logic, sandbox/practice mode differentiation
- Depends on: `runtime.js` (SQL, liveDb, sandboxDb), `state.js` (persistence)
- Used by: `main.js` run handlers, editor keyboard shortcuts

**Database Layer:**
- Purpose: Manage sql.js instances, pristine seeds, and sandbox state persistence
- Location: `scripts/db.js`, `scripts/seeds.js`
- Contains: Database initialization, cloning from pristine, base64 serialization for localStorage
- Depends on: `runtime.js` (SQL singleton), `state.js` (bytes helpers)
- Used by: `main.js` (boot), `practice.js`, `sandbox.js`

**State Layer:**
- Purpose: Persist drafts, history, solved questions, and sandbox DB states to localStorage
- Location: `scripts/state.js`
- Contains: Load/save state, draft management, history, progress tracking
- Depends on: localStorage
- Used by: All modules that need persisted state

**Question/Content Layer:**
- Purpose: Define practice questions with validation logic
- Location: `scripts/questions.js`, `scripts/seeds.js`
- Contains: 74 practice questions across 3 databases (hospital, company, school)
- Used by: `practice.js`, `main.js` (question list rendering)

**Utility Layer:**
- Purpose: Shared helpers for formatting, escaping, SQL parsing
- Location: `scripts/format.js`, `scripts/utils.js`
- Contains: SQL formatter, HTML escaper, SQL syntax highlighter, multi-statement splitter
- Used by: `ui.js`, `editor.js`, `sandbox.js`, `practice.js`

## Modes

**Practice Mode:**
- Load questions from `QUESTIONS[]` with reference queries and verification queries
- Clone pristine DB fresh per question, apply optional `setupQuery`
- Compare user result against reference using `compareResults()` (result-set or state-based)
- Mark solved, persist drafts, show pass/fail feedback

**Sandbox Mode:**
- Mutable in-memory DB that persists to localStorage as base64
- Run any SQL (SELECT, INSERT, UPDATE, DELETE, DDL)
- Multi-statement scripts supported via `splitSqlStatements()`
- Snippet save/load functionality

**MS SQL Translation Mode:**
- Static translation of SQLite SQL syntax to T-SQL
- Regex-based replacements for type names, functions, LIMIT/OFFSET pagination
- Output shown in right panel, does not execute

## Data Flow

**Boot Sequence:**

1. `main.js` calls `boot()` → initializes sql.js from CDN
2. Creates `runtime.pristineDb[name]` by running `SEEDS[name]` SQL into fresh SQL.Database
3. Creates `runtime.liveDb[name]` as clones of pristine (for practice mode)
4. Calls `initEditor()` → creates CodeMirror instance, wires keyboard shortcuts
5. Calls `setMode()` → enters practice or sandbox based on saved state
6. Wires all DOM event listeners

**Query Execution (Practice):**

1. User presses Run or Cmd+Enter → `runQuery()` in `main.js`
2. Delegates to `runPracticeQuery()` in `practice.js`
3. Creates temporary clone of pristine DB, applies `setupQuery` if present
4. Executes user's SQL and reference query on separate clones
5. Compares results via `compareResults()` (result-set or state diff depending on `validationType`)
6. Updates `runtime.cursor.lastUserResult` / `runtime.cursor.lastExpectedResult`
7. Calls `showFeedback()` with pass/fail, `updateProgressUI()` if solved
8. Persists draft if non-empty

**Query Execution (Sandbox):**

1. User presses Run → `runQuery()` → `runSandboxQuery()` in `sandbox.js`
2. Executes SQL against `runtime.sandboxDb[currentDbName]`
3. Detects mutating statements, marks DB dirty, triggers debounced persistence
4. Adds to history, shows feedback with row count

**Persistence Flow:**

- State auto-saves to localStorage via `persist()` with 400ms debounce
- Sandbox DBs serialize as base64 after 500ms debounce to avoid quota issues
- On load, sandbox DBs restored from `state.sandboxStates` if present

## State Management

**Runtime State** (`runtime.js` exports):
- `SQL` — sql.js singleton set after boot
- `editor` — CodeMirror instance
- `liveDb` — Practice mode DB instances (per database name)
- `sandboxDb` — Sandbox mode DB instances (per database name)
- `pristineDb` — Seed byte arrays for cloning (never mutated)
- `cursor` — Mutable session state: `currentMode`, `currentDbName`, `currentQuestionId`, `lastUserResult`, `lastExpectedResult`, etc.

**Persisted State** (`state.js` → localStorage key `querylab:v1`):
- `solved[]` — Array of solved question IDs
- `drafts{}` — Draft SQL per question ID
- `history[]` — Last 20 query runs with SQL, timestamp, success/failure
- `snippets[]` — Named saved SQL snippets
- `sandboxStates{}` — Base64-encoded sandbox DB states per database
- `mode`, `sandboxDb`, `sandboxScript`, `lastQuestionId`, `lastCategoryFilter`, `lastDifficultyFilter`

**Circular Dependency Avoidance:**
- `main.js` wires cross-module hooks via `setDbHooks()` and `setUiHooks()` after all modules import
- `db.js` receives UI callbacks without importing `ui.js`
- `ui.js` receives `loadQuestion`/`loadHistoryItem` callbacks without importing `practice.js`/`sandbox.js`

## Key Abstractions

**Database Abstraction:**
- `activeDb()` in `db.js` — returns either `sandboxDb` or `liveDb` based on current mode
- `cloneFromPristine(name)` — creates fresh in-memory DB from seed bytes

**Editor Abstraction:**
- `initEditor({ runQuery, runMssqlTranslation })` in `editor.js` — creates CodeMirror, wires hints
- All editor access via `runtime.editor` after initialization
- `runtime.cursor.editorLoading` flag prevents change-handler loops when programmatically setting value

**Mode Abstraction:**
- `setMode(mode)` in `sandbox.js` — single entry point for switching modes
- Sets CSS classes on `document.body` for mode-specific styling
- Calls `enterSandbox()`, `enterMssql()`, or `enterPractice()` accordingly

**Query Validation:**
- `compareResults(a, b)` — deep-compares result sets column-by-column, row-by-row
- `normalizeCell()` — converts numbers and nulls to comparable strings
- Two validation types: `result` (compares SELECT output) and `state` (compares DB state via verificationQuery)

## Entry Points

**`scripts/main.js`:**
- Boot function initializes sql.js, seeds databases, wires UI, sets initial mode
- All button/menu handlers defined here, delegating to specialized modules
- Single `boot()` async function called at module load time

**`index.html`:**
- Loads CodeMirror and sql.js from CDN (global scripts)
- Loads `scripts/main.js` as ES module (entry point)
- Contains all HTML structure; no server-side rendering

## Error Handling

**Strategy:** Graceful degradation with user-facing feedback

**Patterns:**
- SQL errors caught in try/catch, displayed via `showFeedback('error', ...)`
- localStorage failures caught with `try/catch`, logged to console.warn
- Missing questions/databases return early (no-op)
- Boot errors render error message in splash div

**Validation Failures:**
- `compareResults()` returns `{ ok: false, reason: '...' }` with specific mismatch description
- User gets column count, row count, or cell-level diff feedback

## Cross-Cutting Concerns

**Logging:** `console.warn` for recoverable issues (state load failures, storage quota); `console.error` for boot failures

**Validation:** Two types — result-set comparison for SELECT questions, state-diff for INSERT/UPDATE/DELETE/DDL questions

**Authentication:** Not applicable (client-only, no auth)

**Formatting:** SQL pretty-printer in `format.js` uppercases keywords, breaks clauses onto new lines, preserves strings/comments

---

*Architecture analysis: 2026-04-30*

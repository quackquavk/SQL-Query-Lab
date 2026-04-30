<!-- GSD:project-start source:PROJECT.md -->
## Project

**SQL Query Lab Evolution**

A professional-grade SQL Server management studio running entirely in the browser — direct competitor to SSMS, Azure Data Studio, and dbForge. Formerly a SQL learning tool, now rearchitected for real database professionals managing real SQL Server infrastructure.

**Core Value:** Professionals can manage SQL Server infrastructure from any browser, with zero setup and full feature parity with desktop SSMS.

### Constraints

- **Browser-based**: Must work entirely in browser — no desktop app
- **Cross-platform**: Must work on macOS, Windows, Linux equally
- **Backend required**: Real SQL Server needs a proxy (cannot use sql.js for live connections)
- **Professional audience**: DBAs, developers — not learners
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ES2020+) - All application logic
- CSS - All styling (custom, no framework)
## Runtime
- Browser-only (client-side execution)
- No Node.js server component
- ES Modules via `<script type="module">`
- None (no package.json or npm/yarn/pnpm)
- None (no bundler, no transpiler)
- Direct execution of ES modules in browser
- No build step required
## Frameworks
- Vanilla JavaScript (no frontend framework)
- Custom module architecture (~13 JS files in `scripts/`)
- CodeMirror 5.65.16 (CDN) - SQL syntax highlighting and autocomplete
- sql.js 1.10.3 (CDN) - SQLite compiled to WebAssembly
## Styling
- 8 CSS files in `styles/` directory
- CSS custom properties (variables) for theming
- BEM-like class naming convention
- `base.css` - Variables, reset, global styles, splash screen
- `topbar.css` - Header/toolbar styling
- `layout.css` - Main app grid layout
- `editor.css` - CodeMirror wrapper styling
- `results.css` - Query output panel
- `right-panel.css` - Question/sandbox panel
- `sandbox.css` - Sandbox mode specific styles
- `modal.css` - Question browser modal
- Instrument Serif (headings)
- Figtree (body/sans)
- JetBrains Mono (code)
## Configuration
- No tsconfig, webpack, vite, rollup, etc.
- No environment setup required
- Runs directly from `index.html`
## Architecture Pattern
- `main.js` - Entry point, boot sequence, UI wiring
- `runtime.js` - Global state singleton (SQL engine, editor instance, databases)
- `state.js` - Persistent state (localStorage)
- `db.js` - Database operations layer
- `ui.js` - DOM rendering functions
- `editor.js` - CodeMirror initialization
- `practice.js` - Practice mode logic
- `sandbox.js` - Sandbox mode logic
- `questions.js` - Question data (hardcoded)
- `seeds.js` - Database seed data (SQL statements)
- `format.js` - SQL formatter
- `utils.js` - Utility functions
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Lowercase with underscores: `main.js`, `editor.js`, `sandbox.js`, `practice.js`, `ui.js`, `db.js`, `format.js`, `utils.js`, `state.js`, `runtime.js`, `questions.js`, `seeds.js`
- One concept per file;文件名 reflects primary export or responsibility
- camelCase: `runQuery`, `loadQuestion`, `setMode`, `saveDraft`, `persistSandboxDbDebounced`
- Verb-first naming: `runQuery`, `saveDraft`, `clearDraft`, `resetAllProgress`
- Predicate functions: `isMutating`, `compareResults` returning boolean-like objects
- camelCase: `currentMode`, `currentQuestionId`, `editorLoading`
- Suffix `_db` for database instances: `sandboxDb`, `pristineDb`, `liveDb`
- Suffix `_timer` for timer IDs: `_sandboxSaveTimer`, `_persistTimer`
- Prefix `_` for module-scoped "private" locals: `_hooks`, `_sandboxSaveTimer`
- UPPER_SNAKE_CASE: `MAX_HISTORY`, `STORAGE_KEY`, `LEGACY_SOLVED_KEY`
- Plain objects used as namespaces: `runtime.cursor`, `runtime.sandboxDb`
- exported arrays as data: `QUESTIONS`, `SEEDS`
## Code Style
- No explicit formatter configured (no Prettier, ESLint, or biome config found)
- 2-space indentation observed
- Single quotes for strings in JS: `'practice'`, `'sandbox'`, `'mssql'`
- Semicolons at statement ends
- No ESLint configuration detected
- No pre-commit hooks detected
- No path aliases configured; all imports use relative `./` paths
## JavaScript Patterns
- ES Modules (`<script type="module">` in index.html)
- Named exports only; no default exports observed
- Barrel re-exports through parent modules (e.g., `state.js` re-exports from `./runtime.js`)
- Single mutable `state` object exported from `state.js` — acts as the application store
- `solved` is a `Set` derived from `state.solved` for O(1) lookups
- Persistence via `localStorage` with key `querylab:v1`
- Debounced writes via `persist()` with 400ms timer
- Uses a hook-injection pattern: `setDbHooks({ showFeedback, switchTab, renderSchema })`
- Hooks called via `_hooks.showFeedback(...)` rather than direct imports
- `main.js` wires hooks after all modules are imported
- `try/catch` for recoverable operations (DB restores, localStorage reads)
- `console.warn()` for recoverable errors (corrupt state, quota exceeded)
- `console.error()` for critical/unexpected errors
- Errors surfaced to UI via `showFeedback('error', ...)` or `toast(...)`
- Direct DOM queries: `document.getElementById()`, `document.querySelectorAll()`
- No virtual DOM or framework
- Event delegation used in `main.js` for menu and tab buttons
- Template literals for HTML generation in render functions
- `async/boot()` for initialization (sql.js loading)
- No `await` inside modules at top level — all async contained in `boot()`
- No Promises exposed externally
## CSS Organization
- `base.css` — CSS custom properties (`:root`), reset, layout shell, typography, scrollbars
- `editor.css` — CodeMirror editor styling, autocomplete popup
- `layout.css` — Grid layout for `.app`, `.main`, `.left`, `.right`, `.center`, `.results`
- `modal.css` — Question browser modal
- `results.css` — Result tables, feedback, output panels
- `right-panel.css` — Left panel tabs, schema viewer, history, resources
- `sandbox.css` — Snippet list, snippet row
- `topbar.css` — Top bar, mode buttons, DB select
- kebab-case: `.editor-wrap`, `.schema-table`, `.results-tab`, `.feedback`, `.toast`
- BEM-inspired compound names: `.left-tab[data-left]`, `.results-tab[data-tab]`
- Semantic class names: `.splash`, `.logo`, `.progress-fill`
- Each CSS file targets one UI component/section
- No CSS modules — all classes are global
## Comment Conventions
- Not used; no JSDoc annotations detected
## Function Design
- Functions are focused — typically 20-80 lines
- Large functions broken into smaller helpers (e.g., `compareResults` is separate from `runPracticeQuery`)
- Object destructuring for hook configs: `setDbHooks({ showFeedback, switchTab, renderSchema })`
- Multiple primitive params when clarity demands: `navQuestion(delta)`
- Most functions return `void` and mutate shared state directly
- Pure utility functions return values: `escapeHtml(s)`, `formatSql(raw)`, `normalizeCell(v)`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- ES module-based modular architecture with explicit imports between modules
- Runtime singleton pattern for shared state (`runtime.js`)
- Persistent state via localStorage with debounced saves
- Three distinct operating modes: Practice, Sandbox, MS SQL Translation
- Client-side only — no backend, all databases live in browser memory via sql.js
## Layers
- Purpose: Render interface, handle user input and DOM events
- Location: `index.html`, `scripts/ui.js`, `scripts/editor.js`
- Contains: DOM rendering functions, event listeners wired in `main.js`
- Depends on: `runtime.js` (for editor, cursor state), `state.js` (for persisted data)
- Used by: User interactions trigger handlers in `main.js` which call other modules
- Purpose: Execute SQL against in-browser SQLite databases
- Location: `scripts/sandbox.js`, `scripts/practice.js`, `scripts/db.js`
- Contains: Query running, validation logic, sandbox/practice mode differentiation
- Depends on: `runtime.js` (SQL, liveDb, sandboxDb), `state.js` (persistence)
- Used by: `main.js` run handlers, editor keyboard shortcuts
- Purpose: Manage sql.js instances, pristine seeds, and sandbox state persistence
- Location: `scripts/db.js`, `scripts/seeds.js`
- Contains: Database initialization, cloning from pristine, base64 serialization for localStorage
- Depends on: `runtime.js` (SQL singleton), `state.js` (bytes helpers)
- Used by: `main.js` (boot), `practice.js`, `sandbox.js`
- Purpose: Persist drafts, history, solved questions, and sandbox DB states to localStorage
- Location: `scripts/state.js`
- Contains: Load/save state, draft management, history, progress tracking
- Depends on: localStorage
- Used by: All modules that need persisted state
- Purpose: Define practice questions with validation logic
- Location: `scripts/questions.js`, `scripts/seeds.js`
- Contains: 74 practice questions across 3 databases (hospital, company, school)
- Used by: `practice.js`, `main.js` (question list rendering)
- Purpose: Shared helpers for formatting, escaping, SQL parsing
- Location: `scripts/format.js`, `scripts/utils.js`
- Contains: SQL formatter, HTML escaper, SQL syntax highlighter, multi-statement splitter
- Used by: `ui.js`, `editor.js`, `sandbox.js`, `practice.js`
## Modes
- Load questions from `QUESTIONS[]` with reference queries and verification queries
- Clone pristine DB fresh per question, apply optional `setupQuery`
- Compare user result against reference using `compareResults()` (result-set or state-based)
- Mark solved, persist drafts, show pass/fail feedback
- Mutable in-memory DB that persists to localStorage as base64
- Run any SQL (SELECT, INSERT, UPDATE, DELETE, DDL)
- Multi-statement scripts supported via `splitSqlStatements()`
- Snippet save/load functionality
- Static translation of SQLite SQL syntax to T-SQL
- Regex-based replacements for type names, functions, LIMIT/OFFSET pagination
- Output shown in right panel, does not execute
## Data Flow
- State auto-saves to localStorage via `persist()` with 400ms debounce
- Sandbox DBs serialize as base64 after 500ms debounce to avoid quota issues
- On load, sandbox DBs restored from `state.sandboxStates` if present
## State Management
- `SQL` — sql.js singleton set after boot
- `editor` — CodeMirror instance
- `liveDb` — Practice mode DB instances (per database name)
- `sandboxDb` — Sandbox mode DB instances (per database name)
- `pristineDb` — Seed byte arrays for cloning (never mutated)
- `cursor` — Mutable session state: `currentMode`, `currentDbName`, `currentQuestionId`, `lastUserResult`, `lastExpectedResult`, etc.
- `solved[]` — Array of solved question IDs
- `drafts{}` — Draft SQL per question ID
- `history[]` — Last 20 query runs with SQL, timestamp, success/failure
- `snippets[]` — Named saved SQL snippets
- `sandboxStates{}` — Base64-encoded sandbox DB states per database
- `mode`, `sandboxDb`, `sandboxScript`, `lastQuestionId`, `lastCategoryFilter`, `lastDifficultyFilter`
- `main.js` wires cross-module hooks via `setDbHooks()` and `setUiHooks()` after all modules import
- `db.js` receives UI callbacks without importing `ui.js`
- `ui.js` receives `loadQuestion`/`loadHistoryItem` callbacks without importing `practice.js`/`sandbox.js`
## Key Abstractions
- `activeDb()` in `db.js` — returns either `sandboxDb` or `liveDb` based on current mode
- `cloneFromPristine(name)` — creates fresh in-memory DB from seed bytes
- `initEditor({ runQuery, runMssqlTranslation })` in `editor.js` — creates CodeMirror, wires hints
- All editor access via `runtime.editor` after initialization
- `runtime.cursor.editorLoading` flag prevents change-handler loops when programmatically setting value
- `setMode(mode)` in `sandbox.js` — single entry point for switching modes
- Sets CSS classes on `document.body` for mode-specific styling
- Calls `enterSandbox()`, `enterMssql()`, or `enterPractice()` accordingly
- `compareResults(a, b)` — deep-compares result sets column-by-column, row-by-row
- `normalizeCell()` — converts numbers and nulls to comparable strings
- Two validation types: `result` (compares SELECT output) and `state` (compares DB state via verificationQuery)
## Entry Points
- Boot function initializes sql.js, seeds databases, wires UI, sets initial mode
- All button/menu handlers defined here, delegating to specialized modules
- Single `boot()` async function called at module load time
- Loads CodeMirror and sql.js from CDN (global scripts)
- Loads `scripts/main.js` as ES module (entry point)
- Contains all HTML structure; no server-side rendering
## Error Handling
- SQL errors caught in try/catch, displayed via `showFeedback('error', ...)`
- localStorage failures caught with `try/catch`, logged to console.warn
- Missing questions/databases return early (no-op)
- Boot errors render error message in splash div
- `compareResults()` returns `{ ok: false, reason: '...' }` with specific mismatch description
- User gets column count, row count, or cell-level diff feedback
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

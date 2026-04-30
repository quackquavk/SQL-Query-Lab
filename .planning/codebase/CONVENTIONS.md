# Coding Conventions

**Analysis Date:** 2026-04-30

## Naming Patterns

**Files:**
- Lowercase with underscores: `main.js`, `editor.js`, `sandbox.js`, `practice.js`, `ui.js`, `db.js`, `format.js`, `utils.js`, `state.js`, `runtime.js`, `questions.js`, `seeds.js`
- One concept per file;文件名 reflects primary export or responsibility

**Functions:**
- camelCase: `runQuery`, `loadQuestion`, `setMode`, `saveDraft`, `persistSandboxDbDebounced`
- Verb-first naming: `runQuery`, `saveDraft`, `clearDraft`, `resetAllProgress`
- Predicate functions: `isMutating`, `compareResults` returning boolean-like objects

**Variables:**
- camelCase: `currentMode`, `currentQuestionId`, `editorLoading`
- Suffix `_db` for database instances: `sandboxDb`, `pristineDb`, `liveDb`
- Suffix `_timer` for timer IDs: `_sandboxSaveTimer`, `_persistTimer`
- Prefix `_` for module-scoped "private" locals: `_hooks`, `_sandboxSaveTimer`

**Constants:**
- UPPER_SNAKE_CASE: `MAX_HISTORY`, `STORAGE_KEY`, `LEGACY_SOLVED_KEY`

**Types/Objects:**
- Plain objects used as namespaces: `runtime.cursor`, `runtime.sandboxDb`
- exported arrays as data: `QUESTIONS`, `SEEDS`

## Code Style

**Formatting:**
- No explicit formatter configured (no Prettier, ESLint, or biome config found)
- 2-space indentation observed
- Single quotes for strings in JS: `'practice'`, `'sandbox'`, `'mssql'`
- Semicolons at statement ends

**Linting:**
- No ESLint configuration detected
- No pre-commit hooks detected

**Import Organization:**
```javascript
// 1. Node built-ins (none used)
// 2. External libraries (none — sql.js loaded via CDN)
// 3. Internal modules — path starts with './'
import * as runtime from './runtime.js';
import { state, persist } from './state.js';
import { escapeHtml, splitSqlStatements } from './utils.js';
```

**Path Aliases:**
- No path aliases configured; all imports use relative `./` paths

## JavaScript Patterns

**Module System:**
- ES Modules (`<script type="module">` in index.html)
- Named exports only; no default exports observed
- Barrel re-exports through parent modules (e.g., `state.js` re-exports from `./runtime.js`)

**State Management:**
- Single mutable `state` object exported from `state.js` — acts as the application store
- `solved` is a `Set` derived from `state.solved` for O(1) lookups
- Persistence via `localStorage` with key `querylab:v1`
- Debounced writes via `persist()` with 400ms timer

**Runtime Singleton (`runtime.js`):**
```javascript
export let SQL = null;
export let editor = null;
export const liveDb = {};
export const pristineDb = {};
export const sandboxDb = {};
export const cursor = { currentDbName, currentQuestionId, currentMode, ... };
```
Other modules mutate these via setter helpers: `setSQL(v)`, `setEditor(v)`.

**Circular Dependency Avoidance:**
- Uses a hook-injection pattern: `setDbHooks({ showFeedback, switchTab, renderSchema })`
- Hooks called via `_hooks.showFeedback(...)` rather than direct imports
- `main.js` wires hooks after all modules are imported

**Error Handling:**
- `try/catch` for recoverable operations (DB restores, localStorage reads)
- `console.warn()` for recoverable errors (corrupt state, quota exceeded)
- `console.error()` for critical/unexpected errors
- Errors surfaced to UI via `showFeedback('error', ...)` or `toast(...)`

**DOM Patterns:**
- Direct DOM queries: `document.getElementById()`, `document.querySelectorAll()`
- No virtual DOM or framework
- Event delegation used in `main.js` for menu and tab buttons
- Template literals for HTML generation in render functions

**Async Patterns:**
- `async/boot()` for initialization (sql.js loading)
- No `await` inside modules at top level — all async contained in `boot()`
- No Promises exposed externally

## CSS Organization

**Files:**
- `base.css` — CSS custom properties (`:root`), reset, layout shell, typography, scrollbars
- `editor.css` — CodeMirror editor styling, autocomplete popup
- `layout.css` — Grid layout for `.app`, `.main`, `.left`, `.right`, `.center`, `.results`
- `modal.css` — Question browser modal
- `results.css` — Result tables, feedback, output panels
- `right-panel.css` — Left panel tabs, schema viewer, history, resources
- `sandbox.css` — Snippet list, snippet row
- `topbar.css` — Top bar, mode buttons, DB select

**Naming Convention:**
- kebab-case: `.editor-wrap`, `.schema-table`, `.results-tab`, `.feedback`, `.toast`
- BEM-inspired compound names: `.left-tab[data-left]`, `.results-tab[data-tab]`
- Semantic class names: `.splash`, `.logo`, `.progress-fill`

**CSS Custom Properties (`base.css`):**
```css
:root {
  --bg: #0b0c0a;
  --accent: #e08a3c;        /* warm amber */
  --success: #a3c968;
  --error: #e56b5a;
  --serif: 'Instrument Serif', ...;
  --sans: 'Figtree', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ...;
}
```

**Component Structure:**
- Each CSS file targets one UI component/section
- No CSS modules — all classes are global

## Comment Conventions

**File Header Comments:**
```javascript
// Entry point: boot the SQL engine, wire UI, kick off initial mode.
```
Single-line comment at top describing purpose.

**Section Separators:**
```javascript
// ─── Snippets ─────────────────────────────────────────
```
ASCII art dividers with section name for major code blocks.

**Inline Clarifications:**
```javascript
// Auto-trigger autocomplete as the user types word characters
// Debounced so heavy-mutation scripts don't write a 16KB blob to localStorage
// Restore the live (practice) DB to its pristine state. Sandbox reset lives in sandbox.js.
```

**JSDoc:**
- Not used; no JSDoc annotations detected

## Function Design

**Size:**
- Functions are focused — typically 20-80 lines
- Large functions broken into smaller helpers (e.g., `compareResults` is separate from `runPracticeQuery`)

**Parameters:**
- Object destructuring for hook configs: `setDbHooks({ showFeedback, switchTab, renderSchema })`
- Multiple primitive params when clarity demands: `navQuestion(delta)`

**Return Values:**
- Most functions return `void` and mutate shared state directly
- Pure utility functions return values: `escapeHtml(s)`, `formatSql(raw)`, `normalizeCell(v)`

---

*Convention analysis: 2026-04-30*

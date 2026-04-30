# Technology Stack

**Analysis Date:** 2026-04-30

## Languages

**Primary:**
- JavaScript (ES2020+) - All application logic
- CSS - All styling (custom, no framework)

## Runtime

**Environment:**
- Browser-only (client-side execution)
- No Node.js server component
- ES Modules via `<script type="module">`

**Package Manager:**
- None (no package.json or npm/yarn/pnpm)

**Build Tools:**
- None (no bundler, no transpiler)
- Direct execution of ES modules in browser
- No build step required

## Frameworks

**Core:**
- Vanilla JavaScript (no frontend framework)
- Custom module architecture (~13 JS files in `scripts/`)

**Editor:**
- CodeMirror 5.65.16 (CDN) - SQL syntax highlighting and autocomplete

**SQL Engine:**
- sql.js 1.10.3 (CDN) - SQLite compiled to WebAssembly
  - Enables in-browser SQLite database operations
  - Handles all query execution and schema management

## Styling

**Approach:** Custom CSS (no framework)
- 8 CSS files in `styles/` directory
- CSS custom properties (variables) for theming
- BEM-like class naming convention

**CSS Files:**
- `base.css` - Variables, reset, global styles, splash screen
- `topbar.css` - Header/toolbar styling
- `layout.css` - Main app grid layout
- `editor.css` - CodeMirror wrapper styling
- `results.css` - Query output panel
- `right-panel.css` - Question/sandbox panel
- `sandbox.css` - Sandbox mode specific styles
- `modal.css` - Question browser modal

**Fonts (Google Fonts CDN):**
- Instrument Serif (headings)
- Figtree (body/sans)
- JetBrains Mono (code)

## Configuration

**No configuration files detected:**
- No tsconfig, webpack, vite, rollup, etc.
- No environment setup required
- Runs directly from `index.html`

## Architecture Pattern

**Module-based vanilla JS:**
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

**Data Flow:**
1. `boot()` in main.js initializes sql.js from CDN
2. Seeds databases from `seeds.js` into memory
3. CodeMirror editor initialized in `editor.js`
4. UI event handlers wired in `main.js`
5. Mode switching (practice/sandbox/mssql) controls which logic runs

---

*Stack analysis: 2026-04-30*
# Phase 4: Professional Polish - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Tool feels like a professional-grade IDE with VS Code conventions. Phase 4 delivers:
- Dark theme (VS Code-style) as default, light theme option, system preference auto-detection
- Keyboard shortcuts following VS Code conventions (Cmd/Ctrl+S save, Cmd/Ctrl+N new tab, etc.)
- SQL formatting (prettify/beautify) with shortcut
- Comment/uncomment selected lines (line comment `--` via Cmd+/)
- Find and replace within editor
- Focus indicators for accessibility (WCAG AA)

**Does NOT include:** Visual table designer, ER diagrams, execution plan viewer (Phase 4 v2 scope per ROADMAP.md)

</domain>

<decisions>
## Implementation Decisions

### Theme Architecture
- **D-01:** Theme switch via `data-theme` attribute on `<html>` element (`dark` | `light` | `auto`)
- **D-02:** All CSS custom properties (`--bg`, `--surface`, `--text`, `--accent`, etc.) defined in `base.css :root` with dark values; light overrides in `[data-theme="light"]` block
- **D-03:** `auto` mode reads `window.matchMedia('(prefers-color-scheme: dark)')` and applies dark/light accordingly; updates on system change via `change` event
- **D-04:** Default theme: `dark`

### Keyboard Shortcut System
- **D-05:** Hybrid approach: CodeMirror `extraKeys` for editor-focused shortcuts; global `keydown` listener in `main.js` for app-level shortcuts
- **D-06:** Global shortcuts only call `preventDefault()` when editor is NOT focused (avoids blocking user's typing)
- **D-07:** Core shortcuts:
  - Cmd/Ctrl+S: Format SQL (prettify)
  - Cmd/Ctrl+/ : Comment/uncomment lines
  - Cmd/Ctrl+F: Find (opens search bar)
  - Cmd/Ctrl+H: Find and replace
  - Cmd/Ctrl+N: New tab (app-level)
  - Cmd/Ctrl+W: Close tab (app-level)
  - Escape: Close find bar / cancel operation

### SQL Formatting (EDIT-05)
- **D-08:** Uses existing `formatSql()` from `scripts/format.js` — already implemented
- **D-09:** Formats entire editor content on Cmd/Ctrl+S (in-place replacement preserving cursor position)
- **D-10:** Format result does NOT auto-save (save is manual action separate from format)

### Comment/Uncomment (EDIT-06)
- **D-11:** Line comment style (`--`) as standard SQL convention
- **D-12:** Uses CodeMirror 5's `toggleComment` with `lineComment: '--'` configuration
- **D-13:** Shortcut: Cmd+/ (Ctrl+/ on Windows/Linux) — toggles `--` at line start for selected lines (or current line if no selection)
- **D-14:** Block comments (`/* */`) available via manual typing — not a toggle action

### Find and Replace (EDIT-07)
- **D-15:** Uses CodeMirror search addon (`@codemirror/search`) — searchcursor-based, supports regex
- **D-16:** Search bar appears as slim strip at TOP of editor area (not modal, not floating dialog)
- **D-17:** Search bar contains: search input, replace input, prev/next buttons, replace button, replace-all button, close button
- **D-18:** Escape closes search bar and returns focus to editor
- **D-19:** Search state (query, replace, match case) does NOT persist across sessions

### Accessibility (THEM-05)
- **D-20:** Focus indicators: `:focus-visible` outlines on all interactive elements using `--accent` color
- **D-21:** Minimum 3:1 contrast ratio for all text (WCAG AA); UI components meet 3:1 for adjacent colors
- **D-22:** Focus order follows logical reading order (tabindex not used to artificially reorder)

### Agent's Discretion
- Light theme color values (exact hex for --bg-light, --surface-light, --text-light, etc.)
- Search bar animation (fade in vs slide down)
- Focus indicator thickness and style (solid vs dotted outline)
- Tab bar shortcut (Ctrl+Tab for next tab — already handled in Phase 3 tab workspace)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/ROADMAP.md` §Phase 4 — Phase 4 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §Theming & UI — THEM-01 through THEM-05
- `.planning/REQUIREMENTS.md` §Query Editor — EDIT-05, EDIT-06, EDIT-07

### Phase Context
- `.planning/phases/01-backend-proxy-foundation/01-CONTEXT.md` — Backend decisions, Hono, WebSocket protocol
- `.planning/phases/02-connected-query-execution/02-CONTEXT.md` — CodeMirror 5, static T-SQL IntelliSense, custom HTML results grid
- `.planning/phases/03-object-explorer-workspace/03-CONTEXT.md` — Tab workspace, snippet management, object explorer

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current client-side architecture
- `.planning/codebase/STACK.md` — CodeMirror 5, vanilla JS, CSS custom properties
- `.planning/codebase/CONVENTIONS.md` — 2-space indent, single quotes, ES modules, hook-injection pattern

### Existing Code
- `scripts/format.js` — `formatSql()` already implemented (D-08 reference)
- `styles/base.css` — CSS custom properties already defined (D-02 reference)
- `scripts/editor.js` — `initEditor()` pattern for CodeMirror configuration (D-05, D-12 reference)
- `scripts/main.js` — Event handler wiring, global keydown pattern (D-06 reference)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/format.js` — `formatSql()` and `formatEditorSql()` already exist; only needs shortcut wiring
- `styles/base.css` — CSS custom properties already defined; adding light theme block is additive
- `scripts/editor.js` — `initEditor()` returns configured CM instance; extraKeys added here
- `scripts/main.js` — Global event handlers already wired via delegation; keydown listener lives here

### Established Patterns
- ES modules with named exports only; no default exports
- Hook-injection pattern: `setXxxHooks({ callback })` to avoid circular imports
- Debounced persistence: `debounce(fn, 400ms)` pattern
- Template literals for HTML generation in render functions
- CSS custom properties cascade through all 8 stylesheets

### Integration Points
- `index.html` — Theme toggle in topbar; find bar injected above editor
- `scripts/main.js` — Global shortcut handler; wires format shortcut to `formatEditorSql()`
- `scripts/editor.js` — CM `extraKeys` config; `toggleComment` configuration
- `styles/base.css` — Add light theme overrides; update `prefers-color-scheme` for auto

### Visual Polish Items (Not in Scope for Phase 4)
- Consistent icon set (deferred to Phase 5 if needed)
- Micro-interactions on hover/focus (deferred)
- Panel resize handles (deferred)
- Status bar polish (deferred)

</code_context>

<specifics>
## Specific Ideas

- Theme toggle in topbar: sun/moon icons for light/dark, gear for auto
- Search bar slim strip (24px height) with muted background matching editor
- Find bar has "Find:" label, input fills remaining space, "Replace:" label, replace input, buttons right-aligned
- Comment adds `-- ` at line start (with trailing space); uncomment removes first occurrence
- Focus outline: 2px solid var(--accent) with 2px offset

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-professional-polish*
*Context gathered: 2026-04-30*
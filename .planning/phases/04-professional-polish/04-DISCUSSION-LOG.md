# Phase 4: Professional Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 04-professional-polish
**Areas discussed:** Theme architecture, Keyboard shortcut system, Find and replace UI, Comment/uncomment behavior

---

## Theme Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| CSS class swap (`data-theme="dark"`) | Simple, no JS, CSS cascade works | |
| Separate CSS files per theme | Parallel loading, no cascade issues | |
| CSS custom property override in `:root` | Single file, easy to switch, existing vars | ✓ |

**User's choice:** CSS custom property override in `:root`
**Notes:** Codebase already uses CSS custom properties for theming (--bg, --surface, --text, --accent, etc.) in base.css. All 8 CSS files reference these vars.

---

## Keyboard Shortcut System

| Option | Description | Selected |
|--------|-------------|----------|
| CodeMirror `extraKeys` only | Built-in, works with CM5 | |
| Global `keydown` listener in main.js | Works outside editor (global shortcuts) | |
| Hybrid: CM `extraKeys` + global handler | Best of both worlds | ✓ |

**User's choice:** Hybrid approach
**Notes:** Global shortcuts only call preventDefault when editor is NOT focused. CodeMirror 5 in use (from Phase 2 decision).

---

## Find and Replace UI

| Option | Description | Selected |
|--------|-------------|----------|
| CodeMirror search addon (searchcursor + dialog) | CM5 built-in, tested | ✓ |
| Custom HTML panel below editor | Matches existing design language | |
| Modal dialog | Clean separation | |

**User's choice:** CodeMirror search addon
**Notes:** Integrated as slim strip at top of editor area (not modal). Matches existing panel styling conventions.

---

## Comment/Uncomment Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Line comment toggle (`--`) | Standard SQL, idempotent | ✓ |
| Block comment toggle (`/* */`) | Non-standard for SQL | |
| Smart: line if full-line selected, block otherwise | Flexible | |

**User's choice:** Line comment toggle (--)
**Notes:** Uses CodeMirror 5's toggleComment with lineComment: '--'. Block comments available via manual typing.

---

## Agent's Discretion

The following areas were delegated to the agent (user said "do what's best"):
- Light theme color values (exact hex for --bg-light, --surface-light, --text-light, etc.)
- Search bar animation (fade in vs slide down)
- Focus indicator thickness and style (solid vs dotted outline)
- Tab bar shortcut (Ctrl+Tab for next tab — already handled in Phase 3 tab workspace)

---

## Deferred Ideas

None — discussion stayed within phase scope.
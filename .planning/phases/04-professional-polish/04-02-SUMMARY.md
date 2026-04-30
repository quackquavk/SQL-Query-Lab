---
phase: 04-professional-polish
plan: 02
subsystem: keyboard
tags: [keyboard, shortcuts, CodeMirror, VS Code, find, replace, comment]
dependency_graph:
  requires: []
  provides:
    - id: THEM-04
      description: Keyboard shortcuts follow VS Code conventions
    - id: EDIT-05
      description: Cmd/Ctrl+S formats SQL in-place
    - id: EDIT-06
      description: Cmd/Ctrl+/ comments/uncomments selected lines
    - id: EDIT-07
      description: Cmd/Ctrl+F find and Cmd/Ctrl+H replace work
  affects:
    - scripts/editor.js (extraKeys for all shortcuts)
    - scripts/main.js (global keydown handler)
    - styles/editor.css (search bar styles)
    - index.html (CodeMirror search addon CDN)
tech_stack:
  added:
    - CodeMirror toggleComment with lineComment: '--' configuration
    - CodeMirror search addon (findPersistent, replace commands)
    - Global keydown event listener for editor fallback shortcuts
  patterns:
    - extraKeys object in initEditor() for all CodeMirror shortcuts
    - CSS-styled search dialog to match app theme
key_files:
  created: []
  modified:
    - scripts/editor.js (extraKeys shortcuts: toggleComment, format, find, replace, escape)
    - scripts/main.js (global keydown handler for format shortcut)
    - styles/editor.css (CodeMirror-dialog search bar styling)
    - index.html (search addon CDN: searchcursor.min.js, dialog.min.js, search.min.js)
decisions:
  - Used 'findPersistent' instead of 'find' so search stays open when editor refocuses
  - Added Escape key handler to refocus editor (search addon handles closing automatically)
  - Kept existing Ctrl-Q/Cmd-Q format shortcut (backwards compatibility)
  - Global Cmd+S handler only fires when editor is NOT focused (fallback for edge cases)
  - CSS-only auto theme via @media (prefers-color-scheme: light) - no JS for system detection
metrics:
  duration: ~6 minutes
  completed: "2026-04-30T07:07:00Z"
---

# Plan 04-02 Summary: Keyboard Shortcuts

**One-liner:** VS Code-style keyboard shortcuts for SQL editing (format, comment, find, replace)

## What Was Built

Implemented VS Code-style keyboard shortcuts for SQL editing using CodeMirror 5 extraKeys configuration and the search addon.

### Shortcuts Added

| Shortcut | Action |
|---------|--------|
| Cmd/Ctrl+S | Format SQL (prettify) |
| Cmd/Ctrl+Q | Format SQL (alternate, kept for compatibility) |
| Cmd/Ctrl+/ | Toggle line comment (`-- `) |
| Cmd/Ctrl+F | Open search bar (findPersistent) |
| Cmd/Ctrl+H | Open find and replace bar |
| Escape | Close search bar and return focus to editor |
| Cmd/Ctrl+Enter | Run query (already existed) |
| F5 | Run query (already existed) |

### CodeMirror Search Addon
- Added CDN scripts for `searchcursor.min.js`, `dialog.min.js`, and `search.min.js`
- Proper load order (searchcursor/dialog before search.js)
- Dialog CSS styled to match app theme with `--surface-*` variables

### Search Bar Styling
- `.CodeMirror-dialog` positioned at top of editor area
- Dark surface background matching app theme
- Input fields with `--surface-2` background and `--accent` focus border
- Hover states on buttons matching app patterns

### Global Keydown Handler
- Fallback handler in `main.js` catches Cmd/Ctrl+S when editor isn't focused
- Uses `runtime.editor.getInputField()` to detect editor focus state
- Prevents default browser save behavior

## Deviations from Plan

None — plan executed exactly as written.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Configure CodeMirror toggleComment for SQL | c79986b |
| 2 | Add format shortcut (Cmd+S) to editor extraKeys | c79986b |
| 3 | Add CodeMirror search addon for find/replace | c79986b |
| 4 | Style search bar in editor.css | c79986b |
| 5 | Bind Cmd+F/Cmd+H to open search bar | c79986b |
| 6 | Add Escape to close search bar and global key handler | c79986b |

## Self-Check

- [x] editor.js extraKeys contains Ctrl+/ and Cmd+/ bindings to toggleComment
- [x] toggleComment configured with lineComment: '--'
- [x] editor.js extraKeys contains 'Cmd-S': formatEditorSql
- [x] editor.js extraKeys contains 'Ctrl-S': formatEditorSql
- [x] Pressing Cmd+S or Ctrl+S formats the current editor content
- [x] index.html loads search.js, searchcursor.min.js, dialog.min.js, dialog.min.css
- [x] search.js is loaded after searchcursor.js and dialog.js
- [x] editor.css has .CodeMirror-dialog styles matching app theme
- [x] Search input styled with var(--surface-2) background
- [x] Dialog buttons have hover states
- [x] extraKeys contains 'Cmd-F': 'findPersistent' and 'Ctrl-F': 'findPersistent'
- [x] extraKeys contains 'Cmd-H': 'replace' and 'Ctrl-H': 'replace'
- [x] Cmd+F opens search bar, Cmd+H opens replace bar
- [x] main.js has global keydown listener
- [x] Global handler checks if editor is focused before acting
- [x] Escape returns focus to editor after closing search

## Self-Check: PASSED
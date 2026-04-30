---
phase: 04-professional-polish
plan: 01
subsystem: theme
tags: [theme, dark, light, auto, WCAG, accessibility, CSS]
dependency_graph:
  requires: []
  provides:
    - id: THEM-01
      description: Dark theme is default on first load
    - id: THEM-02
      description: Light theme available via toggle
    - id: THEM-03
      description: Auto theme follows system preference
    - id: THEM-05
      description: WCAG AA focus indicators on all interactive elements
  affects:
    - styles/base.css (new theme blocks)
    - styles/topbar.css (theme toggle styles)
    - index.html (theme toggle buttons)
    - scripts/main.js (theme initialization and handlers)
tech_stack:
  added:
    - CSS custom properties with data-theme attribute for theme switching
    - @media (prefers-color-scheme: light) for auto theme
    - :focus-visible for WCAG AA focus indicators
  patterns:
    - data-theme attribute on <html> element controls all CSS variables
    - Inline SVG icons for theme buttons (no emoji)
    - Theme preference persisted to state via localStorage
key_files:
  created: []
  modified:
    - styles/base.css (dark/light/auto theme blocks + focus indicators)
    - styles/topbar.css (.theme-toggle and .theme-btn styles)
    - index.html (theme toggle buttons with SVG icons)
    - scripts/main.js (theme initialization, handlers, system preference listener)
decisions:
  - Used data-theme attribute on <html> element (not class) for VS Code-style control
  - Inline SVG icons for theme buttons instead of emoji (per project conventions)
  - CSS-only auto theme via @media (prefers-color-scheme: light) - no JS for system detection
  - Applied theme BEFORE first paint in boot() to avoid flash of wrong theme
metrics:
  duration: ~8 minutes
  completed: "2026-04-30T06:59:21Z"
---

# Plan 04-01 Summary: Theme System

**One-liner:** VS Code-style dark/light/auto theme with WCAG AA focus indicators

## What Was Built

Implemented a complete theme system with three modes: dark (default), light, and auto (follows OS preference). Added WCAG AA compliant focus indicators on all interactive elements.

### Theme Toggle Buttons
- **Light** (sun icon) - switches to light theme with warm cream/white palette
- **Dark** (moon icon) - switches to dark theme with current dark values
- **Auto** (gear icon) - follows system `prefers-color-scheme` setting

### CSS Architecture
- `[data-theme="dark"]` block with explicit dark values
- `[data-theme="light"]` block with light cream/white values
- `[data-theme="auto"]` block + `@media (prefers-color-scheme: light)` nested block
- All 16+ CSS custom properties overridden per theme

### WCAG AA Focus Indicators
- `:focus-visible` with 2px solid var(--accent) and 2px offset
- Applies to buttons, inputs, selects, textareas, links, [role="button"], [tabindex]
- `:focus:not(:focus-visible)` removes default ring (replaced by custom)

### Theme Persistence
- Theme preference saved to state and persisted to localStorage
- Applied before first paint in boot() to avoid flash
- System preference change listener for auto mode updates immediately

## Deviations from Plan

None — plan executed exactly as written.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Add light theme CSS overrides to base.css | e7f3c56 |
| 2 | Add auto theme detection via prefers-color-scheme | e7f3c56 |
| 3 | Add WCAG AA focus indicators | e7f3c56 |
| 4 | Add theme toggle buttons to topbar HTML | e7f3c56 |
| 5 | Add theme toggle CSS styles | e7f3c56 |
| 6 | Wire theme toggle functionality in main.js | e7f3c56 |

## Self-Check

- [x] styles/base.css contains `[data-theme="light"]` block with light hex values
- [x] styles/base.css contains `[data-theme="dark"]` block with dark values (--bg: #0b0c0a, etc.)
- [x] All color variables overridden in both themes
- [x] styles/base.css contains `@media (prefers-color-scheme: light)` block
- [x] Inside that media query, `[data-theme="auto"]` has light color values
- [x] :focus-visible rule uses 2px solid var(--accent) with 2px offset
- [x] button, input, select, textarea all have focus-visible outlines
- [x] index.html contains `theme-toggle` container div with 3 buttons
- [x] Each button has inline SVG icon (sun, moon, gear)
- [x] Active theme button has .active class
- [x] topbar.css contains .theme-toggle with flex layout
- [x] .theme-btn with hover/active states using accent colors
- [x] main.js sets initial data-theme attribute before UI renders
- [x] Theme buttons have click handlers that update data-theme and save to state
- [x] Auto mode listens to system preference changes
- [x] Theme preference persists across page reloads

## Self-Check: PASSED
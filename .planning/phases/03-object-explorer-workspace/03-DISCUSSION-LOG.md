# Phase 3: Object Explorer & Workspace - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 03-object-explorer-workspace
**Areas discussed:** Layout & Navigation, Schema IntelliSense, Tab Workspace UX, Snippet Management, Connection Organization

---

## Layout & Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Left sidebar (below existing tabs) | Keeps existing layout, familiar to SSMS users | ✓ |
| Modal overlay | Would cover editor, disruptive | |
| Separate floating panel | Extra window management complexity | |

**User's choice:** Left sidebar (below existing sidebar tabs)
**Notes:** Continues existing three-column layout pattern from Phase 2. Object explorer panel added below existing History/Resources tabs.

---

## Schema IntelliSense

| Option | Description | Selected |
|--------|-------------|----------|
| After connected — completions match selected database schema | Natural flow, avoids showing all server objects | ✓ |
| Always show all objects on server | Overwhelming for large servers, noisy | |
| Manual trigger only | Extra step for every query | |

**User's choice:** After connected — completions match selected database schema
**Notes:** Schema completions only available when connected and database context is known. Natural UX flow.

---

## Tab Workspace UX

| Option | Description | Selected |
|--------|-------------|----------|
| Top of editor area | Standard IDE pattern, keeps results below | ✓ |
| Bottom (below results) | Non-standard, awkward for widescreen | |
| Floating windows | Would require window management, out of scope | |

**User's choice:** Top of editor area
**Notes:** Standard VS Code/SSMS pattern. Results panel below each tab.

---

## Snippet Management

| Option | Description | Selected |
|--------|-------------|----------|
| Right panel tab (with History, Resources) | Avoids modal, consistent with existing sidebar pattern | ✓ |
| Modal dialog | Blocks editor, different interaction pattern | |
| Separate floating panel | Would require window management | |

**User's choice:** Right panel tab (with History, Resources)
**Notes:** Single sidebar pattern, snippets alongside history/resources.

---

## Connection Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped in object explorer tree | Single tree, no separate dropdown | ✓ |
| Separate dropdown above explorer | Extra UI element, less integrated | |
| Tabs within explorer | Would make tree more complex | |

**User's choice:** Grouped in object explorer tree
**Notes:** Connections and server objects in single unified tree. Favorites/pinned connections shown at top.

---

## Agent's Discretion

- Tree node expand animation (simple vs elaborate) — agent decides
- Specific context menu actions per node type — agent decides
- Tab close button placement (on tab vs hover) — agent decides
- Snippet insert behavior (replace selection vs at cursor) — agent decides

## Deferred Ideas

None — discussion stayed within phase scope.
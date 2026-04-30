# Phase 6: Query Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 6-query-tools
**Areas discussed:** Visual Query Builder UI, Chart Type & Integration, Chart Placement, Optimization Feedback Display, Missing Index Presentation

---

## Visual Query Builder UI

| Option | Description | Selected |
|--------|-------------|----------|
| Canvas-based | Visual canvas where users drag tables and columns, auto-arranged with dagre. Existing ER diagram panel can be repurposed. | ✓ |
| Panel-based | List of available tables → click to add, click columns to SELECT. Simpler but less visual. | |

**User's choice:** Canvas-based (Recommended)
**Notes:** User said "do whats best" and confirmed recommended options across all areas.

---

## Chart Type & Integration

| Option | Description | Selected |
|--------|-------------|----------|
| D3.js | D3.js already selected in Phase 5 for ER diagrams and execution plans. Unified rendering stack. | ✓ |
| Chart.js | Simpler API for standard charts, but adds another dependency. | |

**User's choice:** D3.js (Recommended)

---

## Chart Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Below results grid | Chart renders below/beside the results table in the same panel. Standard IDE pattern. | ✓ |
| Full results panel | Chart takes over the entire results panel, with toggle to switch back. | |

**User's choice:** Below results grid (Recommended)

---

## Optimization Feedback Display

| Option | Description | Selected |
|--------|-------------|----------|
| Inline editor highlights | Suggestions appear as inline highlights directly in the editor, similar to linting. Less disruptive. | ✓ |
| Side panel | Suggestions appear in a dedicated side panel next to results. More space but requires panel switching. | |

**User's choice:** Inline editor highlights (Recommended)

---

## Missing Index Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in execution plan | Missing index info shown as clickable callouts on relevant operators in the execution plan view (Phase 5). | ✓ |
| Separate panel | Missing indexes listed in a separate tab or panel with estimated impact numbers. | |

**User's choice:** Inline in execution plan (Recommended)

---

## Agent's Discretion

- Exact highlight styling (color, underline style, hover behavior)
- Chart dimensions and responsive behavior
- Popover/tooltip positioning and animation
- How to handle multi-result-set queries for charting (chart first result set vs dropdown)
- JOIN line routing and styling on query builder canvas

---

## Deferred Ideas

None — discussion stayed within phase scope.
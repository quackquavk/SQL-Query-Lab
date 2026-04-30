# Plan 06-04: Backend + Missing Index Detection - SUMMARY

**Phase:** 06-query-tools
**Plan:** 04
**Status:** Complete
**Date:** 2026-04-30

---

## What Was Built

### Backend Optimization Endpoint

`POST /api/optimize` - Analyzes SQL queries using SQL Server's `SET SHOWPLAN_XML ON` and returns structured optimization suggestions.

### Missing Index Detection

Execution plan viewer now displays missing index callouts:
- **List in panel** showing all detected missing indexes
- **Impact percentage** per index
- **Copy CREATE INDEX** button to copy statement to clipboard

### Files Created

| File | Purpose |
|------|---------|
| `backend/routes/optimize.js` | POST /api/optimize endpoint |

### Files Modified

| File | Changes |
|------|---------|
| `backend/server.js` | Registered /api/optimize route |
| `scripts/apiClient.js` | Added fetchOptimizationSuggestions() and fetchMissingIndexes() |
| `scripts/execPlanViewer.js` | Extended parseShowplanXml to return missingIndexes, render callouts |
| `styles/exec-plan.css` | Added missing-index-* styles |

---

## Key Functions

```javascript
// apiClient.js
export async function fetchOptimizationSuggestions(sql, database)
export async function fetchMissingIndexes(query, database)

// execPlanViewer.js
export function parseShowplanXml(xmlString)  // Returns { operators, missingIndexes }
export function initExecPlanViewer(svgElement, { operators, missingIndexes })
function renderMissingIndexBadges(panel, missingIndexes)
```

---

## Design Decisions

- **Regex-based XML parsing** for Node.js compatibility (no DOMParser in server runtime)
- **Backward compatible**: parseShowplanXml still works with old `operators[]` format
- **initExecPlanViewer** accepts both old and new data formats
- **Missing index list** renders below the SVG execution plan
- **CREATE INDEX statements** include full 3-part naming: [db].[schema].[table]
- **Impact percentage** displayed prominently per D-14

---

## Backend Endpoint

```javascript
// POST /api/optimize
// Headers: X-User-Id, X-Server, X-Auth-Type, X-Credentials, X-Database
// Body: { sql: string }
// Returns: { suggestions: [...] }
```

Regex patterns for XML analysis:
- `<MissingIndexGroup[^>]*Impact="([^"]*)"` - Extract impact
- `<MissingIndex[^>]*Object="([^"]*)"` - Extract table
- `<Column Name="([^"]*)"` - Extract column names

---

## Verification

- [x] backend/routes/optimize.js exists with POST /api/optimize
- [x] backend/index.js registers /api/optimize route
- [x] apiClient.js has fetchOptimizationSuggestions and fetchMissingIndexes
- [x] execPlanViewer.js parses and displays missing indexes
- [x] exec-plan.css has missing index styles
- [x] Missing index callouts appear in execution plan view

---

*Plan: 06-04-SUMMARY.md*
*Generated: 2026-04-30*
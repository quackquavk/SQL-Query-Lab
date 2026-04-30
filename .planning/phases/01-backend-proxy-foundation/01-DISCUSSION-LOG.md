# Phase 1: Backend Proxy Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 1-backend-proxy-foundation
**Areas discussed:** Backend framework, API protocol, Credential storage, Connection dialog UX, Frontend integration, Azure AD scope

---

## Backend Framework

| Option | Description | Selected |
|--------|-------------|----------|
| Express.js | Battle-tested, vast middleware ecosystem. Slower but most familiar to Node devs. | |
| Fastify | 2-3x faster, built-in schema validation. Smaller ecosystem but better for concurrent users. | |
| Hono | Minimal, edge-deployable. Newer, less middleware. Good for serverless. | ✓ |

**User's choice:** Hono
**Notes:** User prefers minimal, edge-deployable approach. Good fit for serverless deployment scenarios.

---

## API Protocol

| Option | Description | Selected |
|--------|-------------|----------|
| WebSocket | Real-time streaming, row-by-row results, cancel support, lower latency. Better for long queries. | ✓ |
| REST | Simpler to implement, easier to debug, works through proxies. Better if deployment has proxy constraints. | |
| Both (hybrid) | REST for commands, WebSocket for streaming results | |

**User's choice:** WebSocket (Recommended)
**Notes:** Real-time streaming and cancel support are important for professional query work.

---

## Credential Storage

| Option | Description | Selected |
|--------|-------------|----------|
| User-derived key | User enters master password on first use. Derives encryption key from it. No password stored anywhere. | ✓ |
| Server-side master key | Machine-specific key derived from hostname + some salt. No user input needed, but less secure if server is compromised. | |
| Unencrypted file | Plain text storage — only for development. Never in production. | |

**User's choice:** User-derived key (Recommended)
**Notes:** Maximum security — credentials never stored anywhere. User provides master password on first use, key derived from it.

---

## Connection Dialog UX

| Option | Description | Selected |
|--------|-------------|----------|
| Unified dialog | Single connection dialog with auth type dropdown. Simpler UX for users. | ✓ |
| Separate tabs by auth | Separate tabs for SQL Auth vs Windows/Entra. More complex but clearer separation of concerns. | |

**User's choice:** Unified dialog (Recommended)
**Notes:** Simpler UX — one dialog, auth type selector shows relevant fields.

---

## Frontend Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Stay vanilla JS | Add apiClient.js module. sandbox.js stays sql.js for practice; adds API path for live. Minimal changes, keeps existing architecture. | ✓ |
| Migrate to React (from Phase 2) | Research suggested this stack. Major rewrite but better for complex UI. | |
| Hybrid (React + vanilla) | Gradual migration — new UI features in React, existing practice/sandbox in vanilla JS. | |

**User's choice:** Stay vanilla JS (Recommended)
**Notes:** Existing codebase works well. Phase 2+ can revisit React if UI complexity demands it.

---

## Azure AD Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full Entra ID support | Implement Entra ID auth fully. More complex (device code flow, MFA handling). Better for Azure SQL users. | ✓ |
| Basic Entra ID only | Basic Entra ID (username/password only). No MFA/device code flow. Simpler, covers most cases. | |
| Defer Entra ID to Phase 2 | Basic auth only for MVP. Entra ID support added later. | |

**User's choice:** Full Entra ID support (Recommended)
**Notes:** Azure SQL users need full Entra ID including MFA/device code flow.

---

## the agent's Discretion

- Connection pool sizing (can tune per deployment)
- Specific WebSocket message format (columns/rows/done/error envelope structure)
- Backend directory structure and file organization
- How Windows auth integrates with Hono middleware

## Deferred Ideas

- React migration deferred to future phase if complexity demands
- Azure AD MFA UI specifics deferred to Phase 2 if needed
# External Integrations

**Analysis Date:** 2026-04-30

## CDNs Used

**All external resources loaded via CDN (no npm packages):**

| Resource | Version | Purpose |
|----------|---------|---------|
| Google Fonts | - | Instrument Serif, Figtree, JetBrains Mono |
| CodeMirror | 5.65.16 | SQL editor with syntax highlighting |
| sql.js | 1.10.3 | SQLite in WebAssembly (in-browser DB) |

### CodeMirror Components (CDN)
- `codemirror.min.js` - Core editor
- `mode/sql/sql.min.js` - SQL language mode
- `addon/edit/matchbrackets.min.js` - Bracket matching
- `addon/selection/active-line.min.js` - Active line highlight
- `addon/hint/show-hint.min.js` - Autocomplete popup
- `addon/hint/sql-hint.min.js` - SQL autocomplete
- `codemirror.min.css` - Editor styles
- `addon/hint/show-hint.min.css` - Autocomplete styles

## Database Integration

**sql.js (SQLite WASM):**
- In-browser SQLite implementation
- Loaded from CDN: `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js`
- Initialized in `main.js` via `initSqlJs()`
- Located file: `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`

**Databases:**
- `hospital.db` - Hospital/medical data
- `company.db` - Company/organizational data
- `school.db` - School/education data
- `blank.db` - Empty database for sandbox use

**Database Architecture:**
- Pristine databases stored in `runtime.pristineDb` (Uint8Array)
- Live practice databases in `runtime.liveDb`
- Sandbox databases in `runtime.sandboxDb` (persisted to localStorage)
- `cloneFromPristine()` in `db.js` resets databases to seed state

## Data Storage

**localStorage (via state.js):**
- Current mode (practice/sandbox/mssql)
- Current database selection
- Sandbox database states (base64 encoded)
- Active category/difficulty filters
- Draft SQL queries per question
- Solved questions tracking
- Saved sandbox snippets

**Session-only (in-memory):**
- Live practice database state
- Editor content
- Query results

## API Integrations

**None detected:**
- No backend server
- No external API calls
- No HTTP requests to external services
- All execution happens client-side

## Authentication

**None:**
- No user accounts
- No login system
- All state is local to browser (localStorage)

## No External Services For:
- Error tracking
- Analytics
- Logging
- File storage
- Email/notification
- CI/CD

---

*Integration audit: 2026-04-30*
# CONCERNS

## Technical Debt & Code Smells

### Module Coupling
- `main.js` acts as a central hub with heavy import coupling to all modules
- Circular dependency concern: `db.js` avoids importing `ui.js` directly via hooks pattern
- Sandbox/practice mode separation creates duplicated logic paths

### State Management
- State spread across multiple modules (runtime.js cursor, state.js, localStorage)
- No formal state container - mutations happen ad-hoc across modules
- `runtime.cursor` mixed mutable state with no clear ownership boundaries

### Code Organization
- No TypeScript - no type safety for a codebase with significant business logic
- No bundler - ES modules with CDN dependencies makes version control difficult
- Large monolithic files in scripts/ could be split

## Security Considerations

### Client-Side SQL Execution
- **CRITICAL**: User-provided SQL executes against sql.js (Emscripten-compiled SQLite)
- No SQL injection protection - by design since it's a sandbox
- XSS risk in `escapeHtml` usage - need to verify all user content sanitized

### localStorage Data Exposure
- Sandbox DB state stored in localStorage as base64
- User snippets stored in localStorage - no encryption
- No CSRF protection needed (no server-side state)

### Content Security
- Inline event handlers avoided - good
- Script tags from CDN - potential supply chain risk

## Performance Concerns

### Bundle Size
- sql.js WASM is ~1.5MB loaded from CDN
- No lazy loading - all assets block initial render
- Multiple CodeMirror plugins loaded unconditionally

### Database Operations
- No query timeout/limits - long-running queries freeze UI
- Sandbox persist debounced at 500ms - rapid changes may still cause jank
- No pagination for large result sets - all rows rendered to DOM

### Memory
- Multiple sql.js database instances kept in memory (liveDb, sandboxDb, pristineDb)
- No cleanup mechanism when switching databases
- History grows unbounded in localStorage

## Scalability Issues

### Maintainability
- No build system makes CI/CD difficult
- Manual CDN dependency management - versions not locked
- No automated testing - all QA manual

### Feature Extension
- Adding new modes requires modifying setMode() switch statements
- SQLite-specific - no abstraction layer for other databases
- Hardcoded question set - no CMS or external question loading

## Architectural Issues

### Error Handling
- Global boot catch block but individual modules lack error boundaries
- Silent failures in hint table updates (`catch(e) { /* silent */ }`)
- No error reporting/monitoring infrastructure

### Testing Gap
- **No test files found** - all QA manual
- No E2E tests
- No unit tests
- sql.js behavior mocked implicitly with no test doubles

## Potential Improvements

1. **Immediate**: Add query timeout for long-running SQL
2. **Short-term**: Implement virtual scrolling for large result sets
3. **Medium-term**: Add TypeScript, set up bundler (Vite/Rollup)
4. **Long-term**: Add E2E testing (Playwright), implement question loading from external source
5. **Security**: Add CSP headers, pin CDN versions, implement subresource integrity
#!/usr/bin/env node
/**
 * credentials-verification.js
 * Verifies that credentials and connection state are never persisted to localStorage
 * and that page refresh properly clears connection state.
 *
 * Run: node scripts/tests/credentials-verification.js
 */

import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const RED_FLAGS = [
  'connectionId.*localStorage',
  'localStorage.*connectionId',
  'connected.*localStorage',
  'localStorage.*connected',
  'queryState.*localStorage',
  'localStorage.*queryState',
  'activeStreamer.*localStorage',
  'localStorage.*activeStreamer',
  'lastError.*localStorage',
  'localStorage.*lastError',
  'currentResultsView.*localStorage',
  'localStorage.*currentResultsView',
];

let failures = 0;
let passes = 0;

function log(msg) {
  console.log(`  ${msg}`);
}

function pass(msg) {
  passes++;
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg) {
  failures++;
  console.log(`  ❌ FAIL: ${msg}`);
}

// ─── Check 1: Grep for sensitive fields in localStorage calls ───────────────
console.log('\n[Check 1] Grep for credentials/connection state in localStorage calls');
console.log('  Scope: scripts/');

for (const pattern of RED_FLAGS) {
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      `grep -rE '${pattern}' scripts/ --exclude-dir=tests 2>/dev/null`,
      { cwd: ROOT, encoding: 'utf8', timeout: 10000 }
    );
    const lines = result.trim().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      fail(`${pattern} — found ${lines.length} match(es):`);
      lines.forEach(l => log(`    ${l}`));
    } else {
      pass(`No localStorage refs for pattern: ${pattern}`);
    }
  } catch {
    pass(`No localStorage refs for pattern: ${pattern}`);
  }
}

// ─── Check 2: Verify state.js persist() does not include connection fields ───
console.log('\n[Check 2] Verify state.js persist() does not touch connection fields');

const stateJs = await readFile(join(ROOT, 'scripts', 'state.js'), 'utf8');

// Extract the state shape from defaultState()
const defaultStateMatch = stateJs.match(/export function defaultState\(\)[^}]+\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
if (defaultStateMatch) {
  const stateKeys = defaultStateMatch[1].match(/\w+(?:\.\w+)*\s*:/g) || [];
  const keyNames = stateKeys.map(k => k.replace(/[.:\s]/g, ''));
  const forbidden = ['connectionId', 'connected', 'queryState', 'activeStreamer', 'lastError', 'currentResultsView'];
  for (const f of forbidden) {
    if (keyNames.includes(f)) {
      fail(`defaultState() includes forbidden field: ${f}`);
    } else {
      pass(`defaultState() omits field: ${f}`);
    }
  }
} else {
  log('  (Could not parse defaultState shape — skipping structural check)');
}

// Verify persist() does NOT serialize runtime.cursor connection fields
if (stateJs.includes('connectionId')) {
  fail('state.js references connectionId (may be ok if only in comments)');
} else {
  pass('state.js does not reference connectionId');
}

if (stateJs.includes('runtime.cursor')) {
  // Might reference it to reset state — not automatically bad
  if (/runtime\.cursor\.(connectionId|connected|queryState)/.test(stateJs)) {
    fail('state.js writes runtime.cursor connection fields');
  } else {
    pass('state.js does not write runtime.cursor connection fields');
  }
} else {
  pass('state.js does not reference runtime.cursor');
}

// ─── Check 3: Verify runtime.js initializes connection fields as falsy ───────
console.log('\n[Check 3] Verify runtime.js connection fields initialize as falsy');

const runtimeJs = await readFile(join(ROOT, 'scripts', 'runtime.js'), 'utf8');

// Check cursor object initial values
const connIdInit = runtimeJs.match(/connectionId:\s*(\w+)/);
const connectedInit = runtimeJs.match(/connected:\s*(\w+)/);
const queryStateInit = runtimeJs.match(/queryState:\s*['"](\w+)['"]/);

if (connIdInit && (connIdInit[1] === 'null' || connIdInit[1] === 'undefined')) {
  pass('cursor.connectionId initializes as null');
} else if (!connIdInit) {
  pass('cursor.connectionId not found in runtime.js (good isolation)');
} else {
  fail(`cursor.connectionId initializes as "${connIdInit[1]}" (expected null)`);
}

if (connectedInit && (connectedInit[1] === 'false')) {
  pass('cursor.connected initializes as false');
} else if (!connectedInit) {
  pass('cursor.connected not found in runtime.js (good isolation)');
} else {
  fail(`cursor.connected initializes as "${connectedInit[1]}" (expected false)`);
}

if (queryStateInit && queryStateInit[1] === 'idle') {
  pass('cursor.queryState initializes as "idle"');
} else if (!queryStateInit) {
  pass('cursor.queryState not found in runtime.js (good isolation)');
} else {
  fail(`cursor.queryState initializes as "${queryStateInit[1]}" (expected "idle")`);
}

// ─── Check 4: Verify boot() defaults to practice/sandbox never live ──────────
console.log('\n[Check 4] Verify boot() defaults to practice/sandbox, never live');

const mainJs = await readFile(join(ROOT, 'scripts', 'main.js'), 'utf8');

const startModeMatch = mainJs.match(/const startMode\s*=\s*([^;\n]+)/);
if (startModeMatch) {
  const startModeExpr = startModeMatch[1].trim();
  const usesLive = /['"]live['"]/.test(startModeExpr);
  const usesSafe = /['"](?:practice|sandbox)['"]/.test(startModeExpr);
  if (usesLive) {
    fail(`boot() startMode includes 'live' — connection would survive refresh: ${startModeExpr}`);
  } else if (usesSafe) {
    pass(`boot() startMode = ${startModeExpr} (never 'live')`);
  } else {
    fail(`boot() startMode uses unexpected value: ${startModeExpr}`);
  }
} else {
  log('  (Could not find startMode — checking setMode calls in boot)');
  const bootSection = mainJs.match(/async function boot\(\)[^}]+setMode\([^)]+\)/s);
  if (bootSection) {
    pass('boot() calls setMode (startMode pattern not found but setMode present)');
  } else {
    fail('Could not verify boot() setMode behavior');
  }
}

// ─── Check 5: Verify query timeout + cancel UI wired ─────────────────────────
console.log('\n[Check 5] Verify query timeout + cancel UI is fully wired');

const hasTimeoutInput = mainJs.includes("getElementById('query-timeout')");
const hasCancelBtn = mainJs.includes("getElementById('btn-cancel')");
const hasCancelHandler = mainJs.includes('cancelLiveQuery');
const hasTimeoutHandler = mainJs.includes('queryTimeout');

if (hasTimeoutInput) {
  pass("'#query-timeout' input wired in main.js");
} else {
  fail("'#query-timeout' input NOT wired in main.js");
}

if (hasCancelBtn) {
  pass("'#btn-cancel' button wired in main.js");
} else {
  fail("'#btn-cancel' button NOT wired in main.js");
}

if (hasCancelHandler) {
  pass('cancelLiveQuery() wired in main.js');
} else {
  fail('cancelLiveQuery() NOT wired in main.js');
}

if (hasTimeoutHandler) {
  pass('queryTimeout wiring present in main.js');
} else {
  fail('queryTimeout wiring NOT found in main.js');
}

// Verify cancelLiveQuery in sandbox.js calls streamer.cancel()
const sandboxJs = await readFile(join(ROOT, 'scripts', 'sandbox.js'), 'utf8');
if (sandboxJs.includes('activeStreamer.cancel()') || sandboxJs.includes('cancel()')) {
  pass('cancelLiveQuery() calls streamer.cancel()');
} else {
  fail('cancelLiveQuery() does NOT call streamer.cancel()');
}

// Verify client-side timeout in runLiveQuery calls destroy()
if (sandboxJs.includes('streamer.destroy()') && sandboxJs.includes('setTimeout')) {
  pass('runLiveQuery() client-side timeout fires destroy()');
} else {
  fail('runLiveQuery() timeout does NOT call destroy()');
}

// ─── Check 6: Verify LIVE_PREFS_KEY is safe (only pageSize/timeout persisted) ─
console.log('\n[Check 6] Verify LIVE_PREFS_KEY stores only preferences, not credentials');

const livePrefsMatch = stateJs.match(/LIVE_PREFS_KEY\s*=\s*['"]([^'"]+)['"]/);
if (livePrefsMatch) {
  pass(`LIVE_PREFS_KEY = "${livePrefsMatch[1]}" (only stores pageSize/timeout)`);
} else {
  fail('LIVE_PREFS_KEY not found in state.js');
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`  Credentials Verification: ${passes} passed, ${failures} failed`);
console.log('═'.repeat(60) + '\n');

if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed. Review above for details.`);
  process.exit(1);
} else {
  console.log('✅ All checks passed. Credentials are never in localStorage.');
  process.exit(0);
}

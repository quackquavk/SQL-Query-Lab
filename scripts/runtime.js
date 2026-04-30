// Runtime singletons mutated during the session lifecycle.
// Other modules read/mutate these via the setter helpers below.

export let SQL = null;
export let editor = null;
export const liveDb = {};
export const pristineDb = {};
export const sandboxDb = {};

// Multi-tab workspace state
export let openTabs = [];      // Array of { id, title, sql, database, connectionId, dirty }
export let activeTabId = null; // Currently active tab ID
export let tabCounter = 0;      // Auto-increment tab ID counter

export const cursor = {
  currentDbName: 'hospital',
  currentQuestionId: 1,
  currentMode: 'practice',
  activeCategoryFilter: 'ALL',
  activeDifficultyFilter: 'ALL',
  editorLoading: false,
  lastUserResult: null,
  lastExpectedResult: null,
  lastMessage: null,
  connectionId: null,
  connectionName: null,
  connected: false,
  lastError: null,
};

export const sandboxDirty = {
  hospital: false, company: false, school: false
};

export function setSQL(v) { SQL = v; }
export function setEditor(v) { editor = v; }

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

// Object explorer tree state
export const objectTree = {};  // { connectionId: { databases: [...] } }

// Tab management API (initialized in sandbox.js)
let _tabApi = null;

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
  erDiagram: { selectedTable: null, zoomLevel: 1, panOffset: { x: 0, y: 0 } },
  execPlan: { xml: null, operators: [], costThreshold: 0 },
  spEditor: { isOpen: false, targetSp: null, dirty: false },
};

export const sandboxDirty = {
  hospital: false, company: false, school: false
};

export function setSQL(v) { SQL = v; }
export function setEditor(v) { editor = v; }
export function getTabApi() { return _tabApi; }
export function setTabApi(api) { _tabApi = api; }
let _editorQueryExecutor = null;
export function setEditorQueryExecutor(fn) { _editorQueryExecutor = fn; }
export function getEditorQueryExecutor() { return _editorQueryExecutor; }

// Setters for primitives / reassignable exports (ES module bindings are read-only externally)
export function setOpenTabs(v) { openTabs = v; }
export function setActiveTabId(v) { activeTabId = v; }
export function setTabCounter(v) { tabCounter = v; }
export function incTabCounter() { return ++tabCounter; }
export function assignObjectTree(data) { Object.keys(objectTree).forEach(k => delete objectTree[k]); Object.assign(objectTree, data); }

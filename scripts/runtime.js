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
  lastQueryTableName: null, // Table name extracted from most recent SELECT statement
  queryState: 'idle',        // 'idle'|'running'|'done'|'error'|'timeout'|'cancelled'
  currentResultsView: null,  // Streaming results view object returned by renderResultsStreaming
  currentResultSetIndex: 0, // Index of current result set in resultSets array
  livePageSize: 100,        // Rows per page in live mode results grid
  livePage: 1,              // Current page number in live results
  liveSort: null,           // { col: number, dir: 'asc'|'desc' } for live results sort
  lastExecutionTime: null,  // Last query execution time in ms (live mode)
  lastRowCount: 0,          // Last query row count (live mode)
  activeStreamer: null,     // Current query streamer object (for cancel)
  erDiagram: { selectedTable: null, zoomLevel: 1, panOffset: { x: 0, y: 0 } },
  execPlan: { xml: null, operators: [], costThreshold: 0 },
  spEditor: { isOpen: false, targetSp: null, dirty: false },
  queryBuilder: { isOpen: false, tables: [], selectedColumns: {}, joins: [], whereConditions: [] },
  originalResult: null,            // Deep-copy of first query result; never mutated
  filterSortState: { searchText: '', sortCol: null, sortDir: 'asc' },
  profileVisible: false,         // Column profile panel toggle state
  diffResult: null,              // Result of compareResultsets()
  diffReference: null,           // Reference result set for diff comparison
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
export function assignObjectTree(data) { Object.assign(objectTree, data); }
export function getObjectTree(connectionId) { return objectTree[connectionId] || null; }
export function clearObjectTree(connectionId) { if (connectionId && objectTree[connectionId]) delete objectTree[connectionId]; }

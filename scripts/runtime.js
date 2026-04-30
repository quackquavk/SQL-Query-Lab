// Runtime singletons mutated during the session lifecycle.
// Other modules read/mutate these via the setter helpers below.

export let SQL = null;
export let editor = null;
export const liveDb = {};
export const pristineDb = {};
export const sandboxDb = {};

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
};

export const sandboxDirty = {
  hospital: false, company: false, school: false
};

export function setSQL(v) { SQL = v; }
export function setEditor(v) { editor = v; }

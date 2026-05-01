/**
 * verify-inline-edit.js
 *
 * Manual test checklist for the inline cell editing feature (T04).
 * Open index.html, run a local server, and follow the steps below.
 *
 * Usage:
 *   python3 -m http.server 8765
 *   # open http://localhost:8765 in your browser
 *
 * Each section maps to one acceptance criterion.
 * Mark each step as PASS or FAIL in the browser console.
 */

(function () {
  'use strict';

  const STEPS = [
    {
      id: 'V1',
      description: 'Sandbox-only enforcement: double-click a cell in Practice mode',
      instructions: [
        '1. Click "Practice" mode in the top bar.',
        '2. Run: SELECT * FROM patients LIMIT 1',
        '3. Double-click any cell in the result grid.',
        '4. Expected: no input appears. Double-click is ignored (no error message either is fine).',
      ],
      check: function () {
        const input = document.querySelector('.inline-edit-input');
        const result = !input;
        console.log(`[V1] Sandbox-only enforcement: ${result ? 'PASS' : 'FAIL'}`);
        console.log(`  Input visible: ${!!input}`);
        return result;
      },
    },
    {
      id: 'V2',
      description: 'PK column missing — error feedback',
      instructions: [
        '1. Click "Sandbox" mode.',
        '2. Run: SELECT name, age FROM patients LIMIT 3',
        '   (note: patient_id PK is NOT in the SELECT)',
        '3. Double-click the "name" cell.',
        '4. Expected: showFeedback error — "Result set must include primary key column(s) for UPDATE. Missing: patient_id"',
        '5. No input should appear.',
      ],
      check: function () {
        // Check the feedback panel.
        const feedback = document.querySelector('.feedback');
        const feedbackText = feedback ? feedback.textContent : '';
        const passed = feedbackText.includes('patient_id') || feedbackText.includes('primary key');
        console.log(`[V2] PK missing error: ${passed ? 'PASS' : 'FAIL'}`);
        console.log(`  Feedback: ${feedbackText.substring(0, 120)}`);
        return passed;
      },
    },
    {
      id: 'V3',
      description: 'Type validation — invalid value rejected',
      instructions: [
        '1. Run: SELECT * FROM patients LIMIT 3',
        '2. Double-click the "name" (TEXT) column.',
        '3. Type a number, e.g.: 12345',
        '4. Press Enter.',
        '5. Expected: showFeedback error about invalid value (type mismatch).',
        '   Input stays focused (cell-invalid class added).',
      ],
      check: function () {
        const feedback = document.querySelector('.feedback');
        const feedbackText = feedback ? feedback.textContent : '';
        const input = document.querySelector('.inline-edit-input');
        const hasInvalidClass = input && input.classList.contains('cell-invalid');
        const passed = (feedbackText.includes('Invalid') || feedbackText.includes('type')) && hasInvalidClass;
        console.log(`[V3] Type validation: ${passed ? 'PASS' : 'FAIL'}`);
        console.log(`  Feedback: ${feedbackText.substring(0, 120)}`);
        console.log(`  cell-invalid class: ${hasInvalidClass}`);
        return passed;
      },
    },
    {
      id: 'V4',
      description: 'Valid UPDATE commits successfully',
      instructions: [
        '1. Run: SELECT * FROM patients LIMIT 3',
        '2. Double-click the "name" cell of row 0.',
        '3. Change the name (e.g., append " edited").',
        '4. Press Enter.',
        '5. Expected: showFeedback success — "Updated name = <new value> in patients".',
        '6. Cell shows the new value immediately.',
        '7. A brief .cell-modified yellow flash is visible (~200ms).',
      ],
      check: function () {
        const feedback = document.querySelector('.feedback');
        const feedbackText = feedback ? feedback.textContent : '';
        const passed = feedbackText.includes('Updated') && feedbackText.includes('patients');
        console.log(`[V4] Valid UPDATE: ${passed ? 'PASS' : 'FAIL'}`);
        console.log(`  Feedback: ${feedbackText.substring(0, 120)}`);
        return passed;
      },
    },
    {
      id: 'V5',
      description: 'SQL error — constraint violation restores cell',
      instructions: [
        '1. Run: SELECT * FROM patients LIMIT 1',
        '2. Double-click the patient_id cell.',
        '3. Change the ID to something that might violate a constraint.',
        '4. Press Enter.',
        '5. Expected: showFeedback error with SQLite error message.',
        '6. Cell value is restored to its original value (not the bad input).',
      ],
      check: function () {
        const feedback = document.querySelector('.feedback');
        const feedbackText = feedback ? feedback.textContent : '';
        const passed = feedbackText.includes('UPDATE failed') || feedbackText.includes('constraint');
        console.log(`[V5] SQL error handling: ${passed ? 'PASS' : 'FAIL'}`);
        console.log(`  Feedback: ${feedbackText.substring(0, 120)}`);
        return passed;
      },
    },
    {
      id: 'V6',
      description: 'Escape cancels edit, restores original value',
      instructions: [
        '1. Run: SELECT * FROM patients LIMIT 1',
        '2. Double-click a name cell.',
        '3. Type a new value.',
        '4. Press Escape.',
        '5. Expected: input disappears, original value is restored.',
      ],
      check: function () {
        const input = document.querySelector('.inline-edit-input');
        const passed = !input;
        console.log(`[V6] Escape cancels: ${passed ? 'PASS' : 'FAIL'}`);
        return passed;
      },
    },
    {
      id: 'V7',
      description: 'Tab advances to next cell after successful commit',
      instructions: [
        '1. Run: SELECT * FROM patients LIMIT 2',
        '2. Double-click the first data cell (first column, first row).',
        '3. Change the value.',
        '4. Press Tab.',
        '5. Expected: input moves to the next cell in the row.',
        '6. Previous cell shows the committed value.',
      ],
      check: function () {
        const input = document.querySelector('.inline-edit-input');
        const passed = !!input;
        console.log(`[V7] Tab navigation: ${passed ? 'PASS' : 'FAIL'}`);
        return passed;
      },
    },
    {
      id: 'V8',
      description: 'Sandbox state persists after edit (localStorage)',
      instructions: [
        '1. Make a successful edit (from V4).',
        '2. Refresh the browser page.',
        '3. Run the same SELECT query.',
        '4. Expected: the edited value is still there (DB was saved).',
      ],
      check: function () {
        // Can't reliably check localStorage from here; rely on manual check.
        console.log('[V8] Persistence: MANUAL — refresh page and re-run query.');
        return null;
      },
    },
  ];

  // Export for browser console access.
  window._verifyInlineEdit = {
    run: function (filter) {
      let toRun = STEPS;
      if (filter) {
        toRun = STEPS.filter(s => s.id === filter || s.id.startsWith(filter));
      }
      toRun.forEach(step => {
        console.log('\n--- ' + step.id + ': ' + step.description + ' ---');
        step.instructions.forEach(i => console.log('  ' + i));
        step.check();
      });
    },
    list: function () {
      STEPS.forEach(s => console.log(`[${s.id}] ${s.description}`));
    },
  };

  console.log('verify-inline-edit.js loaded.');
  console.log('Run: _verifyInlineEdit.list()  to see all checks.');
  console.log('Run: _verifyInlineEdit.run()    to run all checks.');
  console.log('Run: _verifyInlineEdit.run("V1")  to run one check.');
})();
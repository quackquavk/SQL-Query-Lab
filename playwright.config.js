const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './scripts/tests',
  testMatch: [
    '**/object-explorer-test.js',
    '**/er-diagram-test.js',
    '**/live-mode-e2e.spec.js',
  ],
  use: {
    headless: true,
  },
  reporter: 'list',
});
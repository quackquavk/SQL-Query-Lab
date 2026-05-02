const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './scripts/tests',
  testMatch: [
    '**/object-explorer-test.js',
    '**/er-diagram-test.js',
  ],
  use: {
    headless: true,
  },
  reporter: 'list',
});
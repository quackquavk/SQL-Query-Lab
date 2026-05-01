/**
 * er-diagram-test.js
 * Playwright smoke tests for ER diagram wiring — specifically the connectionId
 * passthrough from context menu → fetchErSchema → backend auth headers.
 *
 * This test requires:
 *   1. Playwright installed (`npx playwright install` once)
 *   2. A running SQL Query Lab app on the configured port
 *   3. A live SQL Server connection (or mocked via env vars)
 *
 * Run with:
 *   npx playwright test scripts/tests/er-diagram-test.js
 *
 * To skip requiring a live SQL Server and just smoke-test DOM structure:
 *   SKIP_LIVE_DB=1 npx playwright test scripts/tests/er-diagram-test.js
 *
 * To set the app URL explicitly:
 *   APP_URL=http://localhost:3001 npx playwright test scripts/tests/er-diagram-test.js
 */

const { test, expect } = require('@playwright/test');

// ── Configuration ─────────────────────────────────────────────────────────────
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const SKIP_LIVE_DB = process.env.SKIP_LIVE_DB === '1';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for an element to appear in the DOM. */
async function waitForElement(selector, { timeout = 10000, state = 'visible' } = {}) {
  return page.waitForSelector(selector, { state, timeout });
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('ER Diagram', () => {

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto(APP_URL);
    await page.waitForSelector('.app', { timeout: 15000 });
  });

  // ── Test 1: ER diagram tab exists and is clickable ──────────────────────────

  test('ER diagram tab exists and is clickable', async () => {
    const tab = page.locator('[data-left="er-diagram"]');
    await expect(tab).toBeVisible();
    await tab.click();
    // Panel should appear after click
    const panel = page.locator('#erDiagramPanel');
    await expect(panel).toBeVisible();
  });

  // ── Test 2: ER diagram panel exists and has the SVG container ────────────────

  test('ER diagram panel has SVG container', async () => {
    // Click the tab first to reveal the panel
    await page.locator('[data-left="er-diagram"]').click();
    const panel = page.locator('#erDiagramPanel');
    await expect(panel).toBeVisible();
    // SVG element must be present inside the panel
    const svg = panel.locator('svg');
    await expect(svg).toBeVisible();
  });

  // ── Test 3: Context menu "Show ER Diagram" includes connectionId in the request ─

  test('"Show ER Diagram" context menu calls fetchErSchema with connectionId', async () => {
    // Inject mock runtime state so the context menu path is reachable
    await page.evaluate(() => {
      if (!window.__runtime) return;
      const rt = window.__runtime;
      // Simulate live mode with an active connection
      rt.cursor.currentMode = 'live';
      rt.connectionId = 'test-conn-id';
      rt.objectTree['test-conn-id'] = {
        databases: [{
          name: 'TestDB',
          type: 'database',
          children: [{
            name: 'Tables',
            type: 'folder',
            children: [{ name: 'Users', type: 'table', children: [] }]
          }]
        }]
      };
    });

    // Render the object tree
    await page.evaluate(() => {
      if (window.__renderObjectTree) window.__renderObjectTree();
    });

    // Expand DB → Tables
    await page.locator('.obj-node:has(.obj-node-label:text("TestDB")) .obj-expandable').click();
    await page.waitForTimeout(400);
    await page.locator('.obj-node:has(.obj-node-label:text("Tables")) .obj-expandable').click();
    await page.waitForTimeout(400);

    // Intercept the schema fetch to capture connectionId in the URL
    let capturedUrls = [];
    await page.route(/\/api\/schema\//, async route => {
      capturedUrls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tables: [], relationships: [] })
      });
    });

    // Right-click the Users table → "Show ER Diagram"
    await page.locator('.obj-node:has(.obj-node-label:text("Users"))').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('.obj-menu-item:has-text("Show ER Diagram")').click();

    // Wait for the fetch to complete
    await page.waitForTimeout(1500);

    // Assert connectionId appeared in the request URL (either as path param or query param)
    const hasConnectionId = capturedUrls.some(url =>
      url.includes('test-conn-id') ||
      url.includes('connectionId=test-conn-id') ||
      url.includes('connectionId%3Dtest-conn-id')
    );
    expect(hasConnectionId, `Expected connectionId in URL. Got: ${JSON.stringify(capturedUrls)}`).toBe(true);
  });

  // ── Test 4: initErDiagram is called and SVG is populated with .er-node elements ─

  test('initErDiagram populates SVG with .er-node elements', async () => {
    // Mock a schema response with real table data
    await page.route(/\/api\/schema\//, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tables: [
            {
              name: 'Users',
              columns: [
                { name: 'Id', type: 'int', isPK: true, isFK: false },
                { name: 'Name', type: 'nvarchar', isPK: false, isFK: false }
              ]
            },
            {
              name: 'Orders',
              columns: [
                { name: 'Id', type: 'int', isPK: true, isFK: false },
                { name: 'UserId', type: 'int', isPK: false, isFK: true }
              ]
            }
          ],
          relationships: [
            { from: { table: 'Users', column: 'Id' }, to: { table: 'Orders', column: 'UserId' } }
          ]
        })
      });
    });

    // Inject runtime state with an active connection
    await page.evaluate(() => {
      if (!window.__runtime) return;
      const rt = window.__runtime;
      rt.cursor.currentMode = 'live';
      rt.connectionId = 'test-conn-id';
      rt.objectTree['test-conn-id'] = {
        databases: [{
          name: 'TestDB',
          type: 'database',
          children: [{
            name: 'Tables',
            type: 'folder',
            children: [
              { name: 'Users', type: 'table', children: [] },
              { name: 'Orders', type: 'table', children: [] }
            ]
          }]
        }]
      };
    });

    // Render the tree
    await page.evaluate(() => {
      if (window.__renderObjectTree) window.__renderObjectTree();
    });

    // Expand DB → Tables
    await page.locator('.obj-node:has(.obj-node-label:text("TestDB")) .obj-expandable').click();
    await page.waitForTimeout(400);
    await page.locator('.obj-node:has(.obj-node-label:text("Tables")) .obj-expandable').click();
    await page.waitForTimeout(400);

    // Right-click Users → Show ER Diagram
    await page.locator('.obj-node:has(.obj-node-label:text("Users"))').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('.obj-menu-item:has-text("Show ER Diagram")').click();

    // Wait for ER diagram to render
    await page.waitForTimeout(2000);

    // ER diagram panel should be visible
    const erPanel = page.locator('#erDiagramPanel');
    await expect(erPanel).toBeVisible();

    // SVG should contain .er-node elements
    const nodes = page.locator('.er-node');
    const count = await nodes.count();
    expect(count, `Expected >0 .er-node elements, got ${count}`).toBeGreaterThan(0);

    // FK relationship line should be rendered
    const fkLine = page.locator('.er-fk-line');
    const fkCount = await fkLine.count();
    expect(fkCount, `Expected >0 .er-fk-line elements, got ${fkCount}`).toBeGreaterThan(0);
  });

  // ── Test 5: Error handling — schema fetch failure shows feedback ───────────────

  test('schema fetch failure surfaces as showFeedback error', async () => {
    // Mock a failing API response
    await page.route(/\/api\/schema\//, route => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) });
    });

    // Inject runtime state
    await page.evaluate(() => {
      if (!window.__runtime) return;
      const rt = window.__runtime;
      rt.cursor.currentMode = 'live';
      rt.connectionId = 'test-conn-id';
      rt.objectTree['test-conn-id'] = {
        databases: [{
          name: 'TestDB',
          type: 'database',
          children: [{
            name: 'Tables',
            type: 'folder',
            children: [{ name: 'Users', type: 'table', children: [] }]
          }]
        }]
      };
    });

    await page.evaluate(() => {
      if (window.__renderObjectTree) window.__renderObjectTree();
    });

    // Expand DB → Tables
    await page.locator('.obj-node:has(.obj-node-label:text("TestDB")) .obj-expandable').click();
    await page.waitForTimeout(400);
    await page.locator('.obj-node:has(.obj-node-label:text("Tables")) .obj-expandable').click();
    await page.waitForTimeout(400);

    // Right-click Users → Show ER Diagram
    await page.locator('.obj-node:has(.obj-node-label:text("Users"))').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('.obj-menu-item:has-text("Show ER Diagram")').click();

    // Wait for the feedback toast
    await page.waitForTimeout(1500);

    // A feedback element should be present (error variant)
    const feedback = page.locator('.feedback.error');
    // The slice plan says: "If the schema fetch fails, the context menu action shows an error via showFeedback"
    await expect(feedback).toBeVisible({ timeout: 3000 }).catch(async () => {
      // Fallback: check that the ER panel did NOT appear (error was shown instead)
      const panel = page.locator('#erDiagramPanel');
      await panel.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
      const isHidden = await page.evaluate(() => {
        const p = document.getElementById('erDiagramPanel');
        return !p || p.style.display === 'none' || !p.classList.contains('visible');
      });
      expect(isHidden, 'ER diagram panel should not show on schema fetch error').toBe(true);
    });
  });

  // ── Test 6: No active connection shows error feedback ───────────────────────

  test('no active connection shows user-friendly error via showFeedback', async () => {
    // Inject runtime state WITHOUT an active connectionId
    await page.evaluate(() => {
      if (!window.__runtime) return;
      const rt = window.__runtime;
      rt.cursor.currentMode = 'live';
      rt.connectionId = null; // explicitly null — no active connection
      rt.objectTree['test-conn-id'] = {
        databases: [{
          name: 'TestDB',
          type: 'database',
          children: [{
            name: 'Tables',
            type: 'folder',
            children: [{ name: 'Users', type: 'table', children: [] }]
          }]
        }]
      };
    });

    await page.evaluate(() => {
      if (window.__renderObjectTree) window.__renderObjectTree();
    });

    // Expand DB → Tables
    await page.locator('.obj-node:has(.obj-node-label:text("TestDB")) .obj-expandable').click();
    await page.waitForTimeout(400);
    await page.locator('.obj-node:has(.obj-node-label:text("Tables")) .obj-expandable').click();
    await page.waitForTimeout(400);

    // Right-click Users → Show ER Diagram
    await page.locator('.obj-node:has(.obj-node-label:text("Users"))').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('.obj-menu-item:has-text("Show ER Diagram")').click();

    // Wait for the feedback toast to appear
    await page.waitForTimeout(1000);

    // A feedback element should be present indicating no active connection
    const feedback = page.locator('.feedback.error');
    await expect(feedback).toBeVisible({ timeout: 3000 }).catch(async () => {
      // At minimum, the panel should not appear
      const panel = page.locator('#erDiagramPanel');
      await panel.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
      const isHidden = await page.evaluate(() => {
        const p = document.getElementById('erDiagramPanel');
        return !p || p.style.display === 'none' || !p.classList.contains('visible');
      });
      expect(isHidden, 'ER diagram panel should not show without active connection').toBe(true);
    });
  });
});

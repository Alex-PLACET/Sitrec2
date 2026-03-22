import {expect, test} from '@playwright/test';
import {takeScreenshotOrCompare} from './snapshot-utils.js';

/**
 * Docker smoke tests — verify the Docker image starts correctly and the app
 * loads and renders in a browser. Run against a live Docker container in CI.
 *
 * Uses a separate config: npx playwright test --config=playwright.docker.config.js
 *
 * NOTE: We cannot wait for "No pending actions" because the Docker container
 * has no map tile API keys, so hasPendingTiles() never clears. Instead we
 * wait for the node graph to initialize (Globals.pendingActions === 0) and
 * then let the scene stabilize for a few seconds before screenshotting.
 *
 * First CI run creates the linux baseline snapshot (uploaded as artifact).
 * Download and commit it to enable visual regression on subsequent runs:
 *   tests_regression/docker-smoke.test.js-snapshots/docker-smoke-snapshot-chromium-linux.png
 */

test.describe('Docker Smoke Tests', () => {
    test('app loads and renders without errors', async ({page}, testInfo) => {
        test.setTimeout(120000);
        await page.setViewportSize({width: 1280, height: 720});

        const errors = [];

        page.on('console', msg => {
            if (msg.text().includes('ASSERT:')) {
                errors.push(`ASSERTION: ${msg.text()}`);
            }
        });

        page.on('pageerror', err => {
            errors.push(`PAGE ERROR: ${err.message}`);
        });

        // Load a fresh default sitch — requires no external data or API keys
        const response = await page.goto('?action=new&frame=10&ignoreunload=1&regression=1', {
            waitUntil: 'load',
            timeout: 30000,
        });

        // Verify HTTP 200
        expect(response.status()).toBe(200);

        // Wait for the app's node graph to initialize.
        // We check for Globals.pendingActions === 0 which means the core setup
        // is done, even if map tiles are still loading (they'll hang without API keys).
        await page.waitForFunction(
            () => window.Globals && window.NodeMan && window.NodeMan.list
                && Object.keys(window.NodeMan.list).length > 0
                && window.Globals.pendingActions === 0,
            {timeout: 60000}
        );

        // Let the scene render and stabilize for a few seconds
        await page.waitForTimeout(5000);

        // Verify at least one WebGL canvas was created (3D scene rendered)
        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);

        // No assertion failures or uncaught errors during initialization
        expect(errors).toEqual([]);

        // Visual regression screenshot.
        // First run: creates baseline (test passes).
        // Subsequent runs: compares against committed baseline.
        await takeScreenshotOrCompare(page, 'docker-smoke-snapshot', testInfo, {
            maxDiffPixels: 50000,
            threshold: 0.3,
        });
    });
});

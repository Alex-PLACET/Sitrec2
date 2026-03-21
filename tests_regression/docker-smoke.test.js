import {expect, test} from '@playwright/test';
import {takeScreenshotOrCompare} from './snapshot-utils.js';

/**
 * Docker smoke tests — verify the Docker image starts correctly and the app
 * loads and renders in a browser. Run against a live Docker container in CI.
 *
 * Uses a separate config: npx playwright test --config=playwright.docker.config.js
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

        // Set up a promise that resolves when the app signals initialization is complete.
        // Must be created before page.goto so we don't miss the console message.
        const initPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error('Timed out after 90s waiting for "No pending actions"')),
                90000
            );
            page.on('console', msg => {
                if (msg.text().includes('No pending actions')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        // Load a fresh default sitch — requires no external data or API keys
        const response = await page.goto('?action=new&frame=10&ignoreunload=1&regression=1', {
            waitUntil: 'load',
            timeout: 30000,
        });

        // Verify HTTP 200
        expect(response.status()).toBe(200);

        // Wait for the node graph to finish initializing
        await initPromise;

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

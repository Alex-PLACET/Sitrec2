import {defineConfig, devices} from '@playwright/test';

/**
 * Playwright config for Docker smoke tests.
 * Separate from the main playwright.config.js because:
 *   - Docker serves the app at "/" (not "/sitrec")
 *   - Only runs docker-smoke.test.js
 *   - Single worker (one container)
 *
 * Usage: npx playwright test --config=playwright.docker.config.js
 */

const baseURL = process.env.DOCKER_SMOKE_URL || 'http://localhost:8080';

export default defineConfig({
    testDir: './tests_regression',
    testMatch: ['**/docker-smoke.test.js'],
    timeout: 120000,
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: 'list',

    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        headless: true,
        ignoreHTTPSErrors: true,
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: [
                        '--use-angle=swiftshader',
                        '--ignore-gpu-blocklist',
                        '--enable-webgl',
                        '--enable-unsafe-swiftshader',
                    ],
                },
            },
        },
    ],
});

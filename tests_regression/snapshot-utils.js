import {expect} from '@playwright/test';
import {copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'fs';
import {basename, dirname, join} from 'path';
import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';

export async function takeScreenshotOrCompare(page, snapshotName, testInfo, options = {}) {
    const snapshotPath = testInfo.snapshotPath(`${snapshotName}.png`);
    const snapshotExists = existsSync(snapshotPath);
    
    const defaultOptions = {
        fullPage: true,
        threshold: 0.02,
        maxDiffPixels: 20000,
        timeout: 30000,
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    if (!snapshotExists) {
        console.log(`Creating new baseline snapshot: ${snapshotName} at ${snapshotPath}`);
        
        mkdirSync(dirname(snapshotPath), { recursive: true });
        await page.screenshot({ 
            path: snapshotPath,
            fullPage: mergedOptions.fullPage,
            timeout: mergedOptions.timeout
        });
        console.log(`✓ Created baseline snapshot: ${snapshotName}`);
    } else {
        const actualBuffer = await page.screenshot({
            fullPage: mergedOptions.fullPage,
            timeout: mergedOptions.timeout
        });
        
        const snapshotDir = dirname(snapshotPath);
        const baseName = basename(snapshotPath, '.png');
        const goodPath = join(snapshotDir, `${baseName}_Good.png`);
        const badPath = join(snapshotDir, `${baseName}_Bad.png`);
        
        const expectedPng = PNG.sync.read(readFileSync(snapshotPath));
        const actualPng = PNG.sync.read(actualBuffer);
        
        let hasDiff = false;
        if (expectedPng.width === actualPng.width && expectedPng.height === actualPng.height) {
            const diffPng = new PNG({width: expectedPng.width, height: expectedPng.height});
            const numDiffPixels = pixelmatch(
                expectedPng.data,
                actualPng.data,
                diffPng.data,
                expectedPng.width,
                expectedPng.height,
                {threshold: mergedOptions.threshold}
            );
            hasDiff = numDiffPixels > 0;
        } else {
            hasDiff = true;
        }
        
        if (hasDiff) {
            copyFileSync(snapshotPath, goodPath);
            writeFileSync(badPath, actualBuffer);
            console.log(`Diff detected - saved ${baseName}_Good.png and ${baseName}_Bad.png`);
        } else {
            if (existsSync(badPath)) {
                unlinkSync(badPath);
            }
            if (existsSync(goodPath)) {
                unlinkSync(goodPath);
            }
        }
        
        await expect(page).toHaveScreenshot(`${snapshotName}.png`, mergedOptions);
    }
}

import {expect, test} from '@playwright/test';

async function waitForFrames(page, count = 10) {
    await page.evaluate(({ frameCount }) => {
        return new Promise((resolve) => {
            let frames = 0;
            function wait() {
                frames++;
                if (frames < frameCount) {
                    requestAnimationFrame(wait);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(wait);
        });
    }, { frameCount: count });
}

async function clickMenuTitle(page, menuName) {
    const result = await page.evaluate(({ name }) => {
        const titles = document.querySelectorAll('.lil-gui .title');
        const titleTexts = Array.from(titles).map(t => t.textContent.trim());
        for (const title of titles) {
            if (title.textContent.trim() === name) {
                title.click();
                return { success: true, found: titleTexts };
            }
        }
        return { success: false, found: titleTexts };
    }, { name: menuName });
    
    if (!result.success) {
        throw new Error(`Could not find ${menuName} menu. Available: ${result.found.join(', ')}`);
    }
}

async function setCheckboxValue(page, folderName, checkboxName, value) {
    const result = await page.evaluate(({ folder, checkbox, val }) => {
        const guiFolder = Array.from(document.querySelectorAll('.lil-gui')).find(gui => {
            const title = gui.querySelector(':scope > .title');
            return title && title.textContent.trim() === folder;
        });
        
        if (!guiFolder) {
            return { success: false, error: `${folder} folder not found` };
        }
        
        const controllers = guiFolder.querySelectorAll('.controller');
        for (const controller of controllers) {
            const name = controller.querySelector('.name');
            if (name && name.textContent.trim() === checkbox) {
                const input = controller.querySelector('input[type="checkbox"]');
                if (input) {
                    if (input.checked !== val) {
                        input.click();
                    }
                    return { success: true };
                }
            }
        }
        return { success: false, error: `${checkbox} controller not found in ${folder}` };
    }, { folder: folderName, checkbox: checkboxName, val: value });
    
    if (!result.success) {
        throw new Error(result.error);
    }
}

async function waitForSatelliteData(page, timeoutMs = 60000) {
    await page.waitForFunction(() => {
        const nightSky = window.NodeMan?.get('NightSkyNode', false);
        return nightSky?.satellites?.TLEData?.satData?.length > 0;
    }, { timeout: timeoutMs });
}

test.describe.serial('Satellite Label Visibility Tests', () => {
    let sharedPage;
    let workerIndex;

    test.beforeAll(async ({ browser }, testInfo) => {
        workerIndex = testInfo.workerIndex;
        sharedPage = await browser.newPage();
        
        sharedPage.on('console', msg => {
            console.log(`[WORKER-${workerIndex}] PAGE CONSOLE [${msg.type()}]: ${msg.text()}`);
        });
        
        await sharedPage.goto('?sitch=nightsky&ignoreunload=1&regression=1');
        
        await sharedPage.waitForFunction(() => {
            return document.querySelector('.lil-gui') !== null;
        }, { timeout: 30000 });
        
        await sharedPage.evaluate(() => {
            window.__consoleLogs = [];
            const originalLog = console.log;
            console.log = function(...args) {
                window.__consoleLogs.push(args.join(' '));
                originalLog.apply(console, args);
            };
        });
        
        await sharedPage.waitForFunction(() => {
            return window.__consoleLogs?.some(log => log.includes('No pending actions'));
        }, { timeout: 60000 }).catch(() => {
            console.log('Warning: Did not detect "No pending actions" message');
        });
        
        await sharedPage.waitForTimeout(5000);
    });

    test.afterAll(async () => {
        await sharedPage.close();
    });

    test('Label Look Visible Only should only show labels for satellites inside look view frustum', async () => {
        console.log('[TEST:satellite:STARTED]');
        try {
            test.setTimeout(120000);
            
            await waitForSatelliteData(sharedPage);
        
        await clickMenuTitle(sharedPage, 'Satellites');
        await sharedPage.waitForTimeout(200);

        await setCheckboxValue(sharedPage, 'Satellites', 'Satellite Labels (Look View)', true);
        await setCheckboxValue(sharedPage, 'Satellites', 'Satellite Labels (Main View)', true);
        await setCheckboxValue(sharedPage, 'Satellites', 'Label Look Visible Only', true);
        
        await sharedPage.waitForTimeout(500);
        await waitForFrames(sharedPage, 30);

        const result = await sharedPage.evaluate(() => {
            const nightSky = window.NodeMan?.get('NightSkyNode', false);
            if (!nightSky?.satellites?.TLEData?.satData) {
                return { error: 'No satellite data available' };
            }

            const satData = nightSky.satellites.TLEData.satData;
            const visibleInLookCount = satData.filter(s => s.visibleInLook).length;
            const totalVisible = satData.filter(s => s.visible && !s.invalidPosition).length;

            const lookCamera = window.NodeMan?.get('lookCamera', false)?._object;
            if (!lookCamera) {
                return { error: 'Look camera not found' };
            }

            let insideFrustumCount = 0;
            let outsideFrustumButMarkedVisible = 0;
            
            for (const sat of satData) {
                if (!sat.visible || sat.invalidPosition || !sat.eus) continue;
                
                const viewPos = sat.eus.clone().applyMatrix4(lookCamera.matrixWorldInverse);
                if (viewPos.z >= 0) continue;
                
                const screenPos = sat.eus.clone().project(lookCamera);
                const isInsideFrustum = screenPos.x >= -1 && screenPos.x <= 1 &&
                    screenPos.y >= -1 && screenPos.y <= 1;
                
                if (isInsideFrustum) {
                    insideFrustumCount++;
                }
                
                if (sat.visibleInLook && !isInsideFrustum) {
                    outsideFrustumButMarkedVisible++;
                }
            }

            return {
                visibleInLookCount,
                totalVisible,
                insideFrustumCount,
                outsideFrustumButMarkedVisible
            };
        });

        console.log('Satellite visibility test results:', result);

        if (result.error) {
            throw new Error(result.error);
        }

        expect(result.outsideFrustumButMarkedVisible).toBe(0);
        
        expect(result.visibleInLookCount).toBeLessThanOrEqual(result.insideFrustumCount + 5);
            console.log('[TEST:satellite:PASSED]');
        } catch (error) {
            console.log('[TEST:satellite:FAILED]');
            throw error;
        }
    });
});

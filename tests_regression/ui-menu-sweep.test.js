import {test} from '@playwright/test';

const TEST_ID = 'ui-menu-sweep';
const START_URL = '?action=new&frame=10&ignoreunload=1&regression=1&mapType=Local&elevationType=Local';

function folderEntries(folders) {
    if (!folders) return [];
    return Array.isArray(folders) ? folders : Object.values(folders);
}

function collectControls(folder, type, prefix = '') {
    const results = [];

    for (const control of folder.controls || []) {
        if (control.type === type) {
            results.push({
                path: prefix ? `${prefix}/${control.name}` : control.name,
                name: control.name,
                currentValue: control.currentValue,
                min: control.min,
                max: control.max,
                step: control.step,
            });
        }
    }

    for (const child of folderEntries(folder.folders)) {
        const childName = child.name || child.title || child.id || 'folder';
        const nextPrefix = prefix ? `${prefix}/${childName}` : childName;
        results.push(...collectControls(child, type, nextPrefix));
    }

    return results;
}

function normalizeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
    let out = value;
    if (Number.isFinite(min)) out = Math.max(min, out);
    if (Number.isFinite(max)) out = Math.min(max, out);
    return out;
}

function alignToStep(value, min, step) {
    if (!Number.isFinite(step) || step <= 0) return value;
    const base = Number.isFinite(min) ? min : 0;
    const units = Math.round((value - base) / step);
    return base + units * step;
}

function approximatelyEqual(a, b, step) {
    const epsilon = Number.isFinite(step) && step > 0
        ? Math.max(step / 1000, 1e-9)
        : 1e-6;
    return Math.abs(a - b) <= epsilon;
}

function pickNumericTarget(before, control) {
    const min = normalizeNumber(control.min);
    const max = normalizeNumber(control.max);
    const step = Math.abs(normalizeNumber(control.step) ?? 0);

    let delta;
    if (step > 0) {
        delta = step;
    } else if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
        delta = (max - min) / 20;
    } else {
        delta = Math.max(Math.abs(before) * 0.05, 1);
    }

    if (!Number.isFinite(delta) || delta === 0) {
        delta = 1;
    }

    const candidates = [
        before + delta,
        before - delta,
        max,
        min,
    ];

    for (const rawCandidate of candidates) {
        if (!Number.isFinite(rawCandidate)) continue;
        let candidate = clamp(rawCandidate, min, max);
        candidate = alignToStep(candidate, min, step);
        candidate = clamp(candidate, min, max);
        if (!approximatelyEqual(candidate, before, step)) {
            return {target: candidate, step};
        }
    }

    return null;
}

async function waitForFrames(page, count = 2, maxWaitMs = 5000) {
    const targetMs = Math.max(1, count) * 16;
    await page.waitForTimeout(Math.min(maxWaitMs, targetMs));
}

async function waitForAppToSettle(page, timeoutMs = 60000) {
    const startMs = Date.now();
    let stableCount = 0;

    while (Date.now() - startMs < timeoutMs) {
        const state = await page.evaluate(() => {
            const globals = window.Globals;
            const loadingDiv = document.getElementById('loadingIndicator');
            return {
                ready: !!window.sitrecAPI && !!document.querySelector('.lil-gui') && !!globals,
                pendingActions: globals?.pendingActions ?? 0,
                deserializing: !!globals?.deserializing,
                parsing: globals?.parsing ?? 0,
                loadingVisible: !!loadingDiv
                    && loadingDiv.style.display !== 'none'
                    && (loadingDiv.textContent || '').includes('Loading'),
            };
        });

        const settled = state.ready
            && state.pendingActions === 0
            && state.deserializing === false
            && state.parsing === 0
            && state.loadingVisible === false;

        if (settled) {
            stableCount += 1;
            if (stableCount >= 10) {
                return;
            }
        } else {
            stableCount = 0;
        }

        await page.waitForTimeout(150);
    }

    throw new Error(`Timed out waiting for Sitrec to settle after ${timeoutMs}ms`);
}

async function callSitrecAPI(page, fn, args = {}) {
    const response = await page.evaluate(async ({apiFn, apiArgs}) => {
        return await window.sitrecAPI?.call(apiFn, apiArgs);
    }, {apiFn: fn, apiArgs: args});

    if (!response) {
        throw new Error(`sitrecAPI.call('${fn}') returned no response`);
    }

    if (response.success === false) {
        throw new Error(response.error || `sitrecAPI.call('${fn}') failed`);
    }

    if (response.result?.success === false) {
        throw new Error(response.result.error || `${fn} returned an unsuccessful result`);
    }

    return response.result;
}

function createErrorTracker(page, workerIndex) {
    const entries = [];

    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') {
            entries.push({source: 'console', text});
        }
        if (type === 'error' || type === 'warning') {
            console.log(`[WORKER-${workerIndex}] PAGE CONSOLE [${type}]: ${text}`);
        }
    });

    page.on('pageerror', error => {
        entries.push({source: 'pageerror', text: error.message});
        console.log(`[WORKER-${workerIndex}] PAGE ERROR: ${error.message}`);
    });

    return {
        clear() {
            entries.length = 0;
        },
        mark() {
            return entries.length;
        },
        assertNoNewErrors(mark, context) {
            const newErrors = entries.slice(mark);
            if (newErrors.length === 0) return;
            const summary = newErrors
                .slice(0, 5)
                .map(entry => `${entry.source}: ${entry.text}`)
                .join(' | ');
            throw new Error(`${context} emitted ${newErrors.length} error message(s): ${summary}`);
        },
    };
}

test('should complete menu control smoke sweep without error messages', async ({page}, testInfo) => {
    console.log(`[TEST:${TEST_ID}:STARTED]`);

    try {
        test.setTimeout(600000);

        const errorTracker = createErrorTracker(page, testInfo.workerIndex);

        await page.goto(START_URL);
        await waitForAppToSettle(page);
        await page.waitForTimeout(1000);

        errorTracker.clear();

        const menus = await callSitrecAPI(page, 'listMenus');
        const booleanControls = [];
        const numericControls = [];

        for (const menu of menus) {
            const menuDoc = await callSitrecAPI(page, 'listMenuControls', {menu});
            booleanControls.push(...collectControls(menuDoc, 'boolean').map(control => ({...control, menu})));
            numericControls.push(...collectControls(menuDoc, 'number').map(control => ({...control, menu})));
        }

        if (booleanControls.length <= 40) {
            throw new Error(`Expected to find many checkbox controls, found ${booleanControls.length}`);
        }

        if (numericControls.length <= 60) {
            throw new Error(`Expected to find many numeric controls, found ${numericControls.length}`);
        }

        console.log(`[${TEST_ID}] Sweeping ${booleanControls.length} checkboxes and ${numericControls.length} sliders`);

        let toggledCheckboxes = 0;
        for (const control of booleanControls) {
            try {
                const beforeMark = errorTracker.mark();
                const beforeValue = await callSitrecAPI(page, 'getMenuValue', {menu: control.menu, path: control.path});
                const before = Boolean(beforeValue.value);
                const toggled = !before;

                await callSitrecAPI(page, 'setMenuValue', {menu: control.menu, path: control.path, value: toggled});
                await waitForFrames(page, 2);
                errorTracker.assertNoNewErrors(beforeMark, `Checkbox ${control.menu} -> ${control.path} first toggle`);

                await callSitrecAPI(page, 'setMenuValue', {menu: control.menu, path: control.path, value: before});
                await waitForFrames(page, 2);
                errorTracker.assertNoNewErrors(beforeMark, `Checkbox ${control.menu} -> ${control.path}`);
                toggledCheckboxes += 1;
            } catch (error) {
                throw new Error(`Checkbox ${control.menu} -> ${control.path}: ${error.message}`);
            }
        }

        let jiggledSliders = 0;
        for (const control of numericControls) {
            try {
                const beforeMark = errorTracker.mark();
                const beforeValue = await callSitrecAPI(page, 'getMenuValue', {menu: control.menu, path: control.path});
                const before = normalizeNumber(beforeValue.value);

                if (!Number.isFinite(before)) {
                    throw new Error('Slider value was not numeric');
                }

                const targetInfo = pickNumericTarget(before, control);
                if (!targetInfo) {
                    continue;
                }

                await callSitrecAPI(page, 'setMenuValue', {menu: control.menu, path: control.path, value: targetInfo.target});
                await waitForFrames(page, 2);
                errorTracker.assertNoNewErrors(beforeMark, `Slider ${control.menu} -> ${control.path} jiggle`);

                await callSitrecAPI(page, 'setMenuValue', {menu: control.menu, path: control.path, value: before});
                await waitForFrames(page, 2);
                errorTracker.assertNoNewErrors(beforeMark, `Slider ${control.menu} -> ${control.path}`);
                jiggledSliders += 1;
            } catch (error) {
                throw new Error(`Slider ${control.menu} -> ${control.path}: ${error.message}`);
            }
        }

        if (toggledCheckboxes <= 40) {
            throw new Error(`Expected to exercise many checkboxes, toggled ${toggledCheckboxes}`);
        }

        if (jiggledSliders <= 60) {
            throw new Error(`Expected to exercise many sliders, jiggled ${jiggledSliders}`);
        }

        await waitForFrames(page, 10);
        await page.waitForTimeout(500);
        errorTracker.assertNoNewErrors(0, 'Menu control smoke sweep');

        console.log(`[${TEST_ID}] Completed ${toggledCheckboxes} checkbox toggles and ${jiggledSliders} slider jiggles`);
        console.log(`[TEST:${TEST_ID}:PASSED]`);
    } catch (error) {
        console.log(`[TEST:${TEST_ID}:FAILED]`);
        throw error;
    }
});

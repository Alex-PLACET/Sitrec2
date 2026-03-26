import fs from "fs";
import path from "path";
import {expect, test} from "@playwright/test";

const CUSTOM_URL = "?custom=99999999/splat%20bounding%20box/20260317_032018.js&ignoreunload=1&regression=1";
const OUTPUT_DIR = path.resolve(__dirname, "../../test-results/gaussian-splat-bounding-box");

function ensureOutputDir() {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}

async function waitForGaussianSplatScene(page) {
    await page.goto(CUSTOM_URL, {
        waitUntil: "load",
        timeout: 120000,
    });

    await page.waitForFunction(() => !!window.NodeMan?.get?.("mainView"), null, {
        timeout: 30000,
    });

    await page.waitForFunction(() => {
        return Object.values(window.NodeMan?.list ?? {}).some((entry) => {
            let found = false;
            entry?.data?.model?.traverse?.((child) => {
                if (child?.userData?.sitrecGaussianSplat) {
                    found = true;
                }
            });
            return found;
        });
    }, null, {timeout: 30000});

    await page.evaluate(() => {
        window.setRenderOne?.(true);
    });
    await page.waitForTimeout(5000);
}

async function collectDiagnostics(page) {
    return page.evaluate(() => {
        const gaussianNodes = [];

        for (const entry of Object.values(window.NodeMan?.list ?? {})) {
            const node = entry?.data;
            if (!node?.model || !node?.group) {
                continue;
            }

            node.model.updateMatrixWorld(true);
            node.group.updateMatrixWorld(true);

            node.model.traverse((child) => {
                if (!child?.userData?.sitrecGaussianSplat) {
                    return;
                }

                const geometryBounds = child.geometry?.boundingBox?.clone();
                const modelBounds = geometryBounds?.clone()?.applyMatrix4(child.matrixWorld) ?? null;

                gaussianNodes.push({
                    nodeId: node.id ?? "",
                    meshName: child.name ?? "",
                    cachedModelLength: Number(node.cachedModelLength ?? 0),
                    geometryBounds: geometryBounds ? {
                        min: geometryBounds.min.toArray(),
                        max: geometryBounds.max.toArray(),
                        size: geometryBounds.max.clone().sub(geometryBounds.min).toArray(),
                    } : null,
                    modelBounds: modelBounds ? {
                        min: modelBounds.min.toArray(),
                        max: modelBounds.max.toArray(),
                        size: modelBounds.max.clone().sub(modelBounds.min).toArray(),
                    } : null,
                });
            });
        }

        return {gaussianNodes};
    });
}

test("captures gaussian splat bounding-box regression scene", async ({page}) => {
    ensureOutputDir();

    await waitForGaussianSplatScene(page);

    const diagnostics = await collectDiagnostics(page);
    expect(diagnostics.gaussianNodes.length).toBeGreaterThan(0);

    for (const node of diagnostics.gaussianNodes) {
        expect(node.geometryBounds).not.toBeNull();
        expect(node.modelBounds).not.toBeNull();
        expect(node.geometryBounds.size[2]).toBeGreaterThan(0.01);
        expect(node.modelBounds.size[1]).toBeGreaterThan(0.01);
        expect(node.cachedModelLength).toBeGreaterThan(0.01);
        expect(Math.abs(node.cachedModelLength - node.modelBounds.size[2])).toBeLessThan(0.01);
    }

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "diagnostics.json"),
        `${JSON.stringify(diagnostics, null, 2)}\n`,
        "utf8",
    );

    await page.screenshot({
        path: path.join(OUTPUT_DIR, "gaussian-splat-bounding-box.png"),
        fullPage: true,
    });
});

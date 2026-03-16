import fs from 'fs';
import path from 'path';
import {expect, test} from '@playwright/test';

const CUSTOM_URL = '?custom=99999999/Model%20Viewing/20260315_235824.js&ignoreunload=1&regression=1';
const OUTPUT_DIR = '/Users/mick/Dropbox/sitrec-dev/sitrec/test-results/model-viewing';

function ensureOutputDir() {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}

async function waitForModelViewingScene(page) {
    await page.goto(CUSTOM_URL, {
        waitUntil: 'load',
        timeout: 120000,
    });

    await page.waitForFunction(() => {
        return !!window.NodeMan && !!window.NodeMan.list && !!window.NodeMan.get('mainView');
    }, null, {timeout: 30000});

    await page.waitForTimeout(12000);
}

async function setLightingState(page, updates) {
    await page.evaluate((next) => {
        const lighting = window.NodeMan.get('lighting')
            ?? Object.values(window.NodeMan.list)
                .map(entry => entry?.data)
                .find(node => node?.constructor?.name === 'CNodeLighting');

        if (!lighting) {
            throw new Error('Could not find lighting node');
        }

        for (const [key, value] of Object.entries(next)) {
            lighting[key] = value;
        }

        lighting.recalculate?.();
        window.setRenderOne?.(true);
    }, updates);

    await page.waitForTimeout(2500);
}

async function collectDiagnostics(page) {
    return page.evaluate(() => {
        const camera = window.NodeMan.get('mainView').camera;
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix?.();

        const vectorFactory = () => camera.position.clone();

        const toScreenPoint = (worldPos) => {
            const projected = worldPos.clone().project(camera);
            return {
                ndc: {x: projected.x, y: projected.y, z: projected.z},
                screen: {
                    x: (projected.x * 0.5 + 0.5) * window.innerWidth,
                    y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
                },
            };
        };

        const summarizeMaterial = (mat) => ({
            type: mat.type,
            name: mat.name ?? '',
            color: mat.color?.getHexString?.(),
            emissive: mat.emissive?.getHexString?.(),
            emissiveIntensity: mat.emissiveIntensity ?? null,
            metalness: mat.metalness ?? null,
            roughness: mat.roughness ?? null,
            envMapIntensity: mat.envMapIntensity ?? null,
            aoMapIntensity: mat.aoMapIntensity ?? null,
            mapColorSpace: mat.map?.colorSpace ?? null,
            emissiveMapColorSpace: mat.emissiveMap?.colorSpace ?? null,
            hasMap: !!mat.map,
            hasEmissiveMap: !!mat.emissiveMap,
            hasNormalMap: !!mat.normalMap,
            hasAoMap: !!mat.aoMap,
            hasMetalnessMap: !!mat.metalnessMap,
            hasRoughnessMap: !!mat.roughnessMap,
            hasEnvMap: !!mat.envMap,
            lights: mat.lights ?? null,
            transparent: mat.transparent ?? false,
            opacity: mat.opacity ?? 1,
            side: mat.side ?? null,
            vertexColors: !!mat.vertexColors,
            flatShading: !!mat.flatShading,
            unlitExtension: !!mat.userData?.gltfExtensions?.KHR_materials_unlit,
        });

        const objects = [];
        for (const [key, entry] of Object.entries(window.NodeMan.list)) {
            const node = entry?.data;
            if (node?.constructor?.name !== 'CNode3DObject') {
                continue;
            }

            const objectInfo = {
                id: key,
                model: node.selectModel,
                applyMaterial: !!node.common?.applyMaterial,
                materialOverrideType: node.common?.material ?? null,
                modelOrGeometry: node.modelOrGeometry,
                worldCenter: null,
                screenCenter: null,
                totalMeshes: 0,
                materialTypes: [],
                materials: [],
                aggregate: {
                    unlitExtensionCount: 0,
                    aoMappedMeshes: 0,
                    envMappedMeshes: 0,
                    metalness: {count: 0, min: null, max: null, avg: null},
                    roughness: {count: 0, min: null, max: null, avg: null},
                },
            };

            const worldCenter = vectorFactory().set(0, 0, 0);
            node.group.getWorldPosition(worldCenter);
            objectInfo.worldCenter = {x: worldCenter.x, y: worldCenter.y, z: worldCenter.z};
            objectInfo.screenCenter = toScreenPoint(worldCenter);

            const materialTypes = new Set();
            let metalnessSum = 0;
            let roughnessSum = 0;

            if (node.model) {
                node.model.traverse((child) => {
                    if (!child.isMesh) {
                        return;
                    }

                    objectInfo.totalMeshes++;
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    for (const mat of materials) {
                        if (!mat) continue;

                        const summary = summarizeMaterial(mat);
                        summary.meshName = child.name ?? '';
                        objectInfo.materials.push(summary);
                        materialTypes.add(summary.type);

                        if (summary.unlitExtension) {
                            objectInfo.aggregate.unlitExtensionCount++;
                        }
                        if (summary.hasAoMap) {
                            objectInfo.aggregate.aoMappedMeshes++;
                        }
                        if (summary.hasEnvMap) {
                            objectInfo.aggregate.envMappedMeshes++;
                        }
                        if (typeof summary.metalness === 'number') {
                            objectInfo.aggregate.metalness.count++;
                            objectInfo.aggregate.metalness.min = objectInfo.aggregate.metalness.min === null
                                ? summary.metalness
                                : Math.min(objectInfo.aggregate.metalness.min, summary.metalness);
                            objectInfo.aggregate.metalness.max = objectInfo.aggregate.metalness.max === null
                                ? summary.metalness
                                : Math.max(objectInfo.aggregate.metalness.max, summary.metalness);
                            metalnessSum += summary.metalness;
                        }
                        if (typeof summary.roughness === 'number') {
                            objectInfo.aggregate.roughness.count++;
                            objectInfo.aggregate.roughness.min = objectInfo.aggregate.roughness.min === null
                                ? summary.roughness
                                : Math.min(objectInfo.aggregate.roughness.min, summary.roughness);
                            objectInfo.aggregate.roughness.max = objectInfo.aggregate.roughness.max === null
                                ? summary.roughness
                                : Math.max(objectInfo.aggregate.roughness.max, summary.roughness);
                            roughnessSum += summary.roughness;
                        }
                    }
                });
            }

            objectInfo.materialTypes = Array.from(materialTypes);
            if (objectInfo.aggregate.metalness.count > 0) {
                objectInfo.aggregate.metalness.avg = metalnessSum / objectInfo.aggregate.metalness.count;
            }
            if (objectInfo.aggregate.roughness.count > 0) {
                objectInfo.aggregate.roughness.avg = roughnessSum / objectInfo.aggregate.roughness.count;
            }

            objects.push(objectInfo);
        }

        const lighting = window.NodeMan.get('lighting')
            ?? Object.values(window.NodeMan.list)
                .map(entry => entry?.data)
                .find(node => node?.constructor?.name === 'CNodeLighting');

        return {
            lighting: lighting ? {
                ambientIntensity: lighting.ambientIntensity,
                ambientOnly: lighting.ambientOnly,
                sunIntensity: lighting.sunIntensity,
                sunScattering: lighting.sunScattering,
            } : null,
            globals: {
                pendingActions: window.Globals?.pendingActions ?? null,
                ambientLightIntensity: window.Globals?.ambientLight?.intensity ?? null,
            },
            objects,
        };
    });
}

test('model viewing diagnostic captures AI model lighting response', async ({page}) => {
    ensureOutputDir();

    await waitForModelViewingScene(page);

    const initialDiagnostics = await collectDiagnostics(page);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'diagnostics-initial.json'),
        JSON.stringify(initialDiagnostics, null, 2),
    );

    await page.screenshot({
        path: path.join(OUTPUT_DIR, 'model-viewing-normal.png'),
        fullPage: true,
    });

    await setLightingState(page, {
        ambientOnly: true,
        ambientIntensity: 0.05,
    });

    const ambientLowDiagnostics = await collectDiagnostics(page);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'diagnostics-ambient-low.json'),
        JSON.stringify(ambientLowDiagnostics, null, 2),
    );

    await page.screenshot({
        path: path.join(OUTPUT_DIR, 'model-viewing-ambient-low.png'),
        fullPage: true,
    });

    await setLightingState(page, {
        ambientOnly: true,
        ambientIntensity: 2,
    });

    const ambientHighDiagnostics = await collectDiagnostics(page);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'diagnostics-ambient-high.json'),
        JSON.stringify(ambientHighDiagnostics, null, 2),
    );

    await page.screenshot({
        path: path.join(OUTPUT_DIR, 'model-viewing-ambient-high.png'),
        fullPage: true,
    });

    const droppedPA28 = initialDiagnostics.objects.find((object) => object.model === 'Model PA28.glb');
    const builtInPA28 = initialDiagnostics.objects.find((object) => object.model === 'PA-28-181');

    expect(initialDiagnostics.objects.length).toBeGreaterThan(0);
    expect(droppedPA28).toBeTruthy();
    expect(builtInPA28).toBeTruthy();
    expect(droppedPA28.aggregate.metalness.avg).toBeCloseTo(0, 6);
    expect(builtInPA28.aggregate.metalness.avg).toBeCloseTo(0, 6);
    expect(ambientHighDiagnostics.lighting?.ambientOnly).toBe(true);
    expect(ambientHighDiagnostics.lighting?.ambientIntensity).toBe(2);
});

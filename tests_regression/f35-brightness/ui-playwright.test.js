import fs from "fs";
import path from "path";
import {expect, test} from "@playwright/test";
import {PNG} from "pngjs";

const CUSTOM_URL = "?custom=99999999/PLY%20vs.%20GLB%20F35%20Brighness/20260317_235655.js&ignoreunload=1&regression=1";
const REFERENCE_CUSTOM_URL = "?custom=99999999/PLY%20vs.%20GLB%20F35%20Brighness/20260318_002315.js&ignoreunload=1&regression=1";
const OUTPUT_DIR = "/Users/mick/Dropbox/sitrec-dev/sitrec/test-results/f35-brightness";

function ensureOutputDir() {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}

async function waitForScene(page) {
    await page.goto(CUSTOM_URL, {
        waitUntil: "load",
        timeout: 120000,
    });

    await page.waitForFunction(() => !!window.NodeMan?.get?.("mainView"), null, {
        timeout: 30000,
    });

    await page.waitForFunction(() => {
        let modelNodeCount = 0;
        for (const entry of Object.values(window.NodeMan?.list ?? {})) {
            if (entry?.data?.model) {
                modelNodeCount++;
            }
        }
        return modelNodeCount >= 2;
    }, null, {timeout: 30000});

    await page.evaluate(() => {
        window.setRenderOne?.(true);
    });
    await page.waitForTimeout(8000);
}

async function waitForSpecificScene(page, url) {
    await page.goto(url, {
        waitUntil: "load",
        timeout: 120000,
    });

    await page.waitForFunction(() => !!window.NodeMan?.get?.("mainView"), null, {
        timeout: 30000,
    });

    await page.waitForFunction(() => {
        let modelNodeCount = 0;
        for (const entry of Object.values(window.NodeMan?.list ?? {})) {
            if (entry?.data?.model) {
                modelNodeCount++;
            }
        }
        return modelNodeCount >= 2;
    }, null, {timeout: 30000});

    await page.evaluate(() => {
        window.setRenderOne?.(true);
    });
    await page.waitForTimeout(8000);
}

async function collectDiagnostics(page) {
    return page.evaluate(() => {
        function sampleVisibleTexture(mesh, camera) {
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const mapImage = material?.map?.image;
            const geometry = mesh.geometry;
            const position = geometry?.attributes?.position;
            const uv = geometry?.attributes?.uv;
            if (!mapImage || !position || !uv) {
                return null;
            }

            const canvas = document.createElement("canvas");
            canvas.width = mapImage.width;
            canvas.height = mapImage.height;
            const ctx = canvas.getContext("2d", {willReadFrequently: true});
            ctx.drawImage(mapImage, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const index = geometry.index?.array ?? null;
            const Vec3 = camera.position.constructor;
            const worldA = new Vec3();
            const worldB = new Vec3();
            const worldC = new Vec3();
            const edgeAB = new Vec3();
            const edgeAC = new Vec3();
            const faceNormal = new Vec3();
            const center = new Vec3();
            const viewDir = new Vec3();
            const projected = new Vec3();

            const sum = {r: 0, g: 0, b: 0};
            const topSum = {r: 0, g: 0, b: 0};
            let count = 0;
            let topCount = 0;
            let darkCount = 0;
            const triangleCount = index ? index.length / 3 : position.count / 3;

            function samplePixel(u, v) {
                const x = Math.max(0, Math.min(canvas.width - 1, Math.round(u * (canvas.width - 1))));
                const y = Math.max(0, Math.min(canvas.height - 1, Math.round((1 - v) * (canvas.height - 1))));
                const offset = (y * canvas.width + x) * 4;
                return {
                    r: imageData[offset],
                    g: imageData[offset + 1],
                    b: imageData[offset + 2],
                };
            }

            for (let i = 0; i < triangleCount; i++) {
                const ia = index ? index[i * 3] : i * 3;
                const ib = index ? index[i * 3 + 1] : i * 3 + 1;
                const ic = index ? index[i * 3 + 2] : i * 3 + 2;

                worldA.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
                worldB.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
                worldC.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);

                edgeAB.subVectors(worldB, worldA);
                edgeAC.subVectors(worldC, worldA);
                faceNormal.crossVectors(edgeAB, edgeAC).normalize();

                center.copy(worldA).add(worldB).add(worldC).multiplyScalar(1 / 3);
                viewDir.subVectors(camera.position, center).normalize();
                if (faceNormal.dot(viewDir) <= 0) {
                    continue;
                }

                projected.copy(center).project(camera);
                if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || projected.z < -1 || projected.z > 1) {
                    continue;
                }

                const u = (uv.getX(ia) + uv.getX(ib) + uv.getX(ic)) / 3;
                const v = (uv.getY(ia) + uv.getY(ib) + uv.getY(ic)) / 3;
                const pixel = samplePixel(u, v);
                const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;

                sum.r += pixel.r;
                sum.g += pixel.g;
                sum.b += pixel.b;
                count++;

                if (luma < 64) {
                    darkCount++;
                }

                if (faceNormal.y > 0.35) {
                    topSum.r += pixel.r;
                    topSum.g += pixel.g;
                    topSum.b += pixel.b;
                    topCount++;
                }
            }

            const meanRgb = count > 0 ? {
                r: sum.r / count,
                g: sum.g / count,
                b: sum.b / count,
            } : null;
            const topMeanRgb = topCount > 0 ? {
                r: topSum.r / topCount,
                g: topSum.g / topCount,
                b: topSum.b / topCount,
            } : null;

            return {
                visibleTriangleCount: count,
                upwardVisibleTriangleCount: topCount,
                darkVisibleFraction: count > 0 ? darkCount / count : null,
                meanRgb,
                topMeanRgb,
            };
        }

        const diagnostics = {
            renderer: null,
            lights: null,
            scene: null,
            modelNodes: [],
        };

        const mainView = window.NodeMan?.get?.("mainView");
        const renderer = mainView?.renderer;
        diagnostics.renderer = renderer ? {
            outputColorSpace: renderer.outputColorSpace ?? null,
            colorSpace: renderer.colorSpace ?? null,
            toneMapping: renderer.toneMapping ?? null,
            toneMappingExposure: renderer.toneMappingExposure ?? null,
        } : null;
        diagnostics.scene = mainView?.scene ? {
            hasEnvironment: !!mainView.scene.environment,
            hasBackground: !!mainView.scene.background,
            hasFog: !!mainView.scene.fog,
        } : null;

        diagnostics.lights = {
            ambient: window.Globals?.ambientLight ? {
                intensity: window.Globals.ambientLight.intensity,
                visible: window.Globals.ambientLight.visible,
                color: window.Globals.ambientLight.color.getHexString(),
            } : null,
            sun: window.Globals?.sunLight ? {
                intensity: window.Globals.sunLight.intensity,
                visible: window.Globals.sunLight.visible,
                color: window.Globals.sunLight.color.getHexString(),
                position: window.Globals.sunLight.position.toArray(),
            } : null,
        };

        for (const entry of Object.values(window.NodeMan?.list ?? {})) {
            const node = entry?.data;
            if (!node?.model) {
                continue;
            }

            const modelNode = {
                id: node.id ?? "",
                filenameParameters: node.model?.userData?.sitrecFilenameParameters ?? null,
                rootChildren: [],
            };

            node.model.updateMatrixWorld?.(true);
            node.model.traverse((child) => {
                if (!child?.isMesh && !child?.isPoints) {
                    return;
                }

                const materials = child.isPoints
                    ? [child.material]
                    : (Array.isArray(child.material) ? child.material : [child.material]);

                modelNode.rootChildren.push({
                    name: child.name ?? "",
                    kind: child.isPoints ? "points" : "mesh",
                    geometryType: child.geometry?.type ?? null,
                    vertexCount: child.geometry?.attributes?.position?.count ?? null,
                    normalCount: child.geometry?.attributes?.normal?.count ?? null,
                    uvCount: child.geometry?.attributes?.uv?.count ?? null,
                    uv2Count: child.geometry?.attributes?.uv2?.count ?? null,
                    colorCount: child.geometry?.attributes?.color?.count ?? null,
                    rotation: child.rotation?.toArray?.() ?? null,
                    scale: child.scale?.toArray?.() ?? null,
                    userData: {
                        sitrecGaussianSplat: child.userData?.sitrecGaussianSplat ?? false,
                        sitrecPLYPointCloud: child.userData?.sitrecPLYPointCloud ?? false,
                        sitrecModelFormat: child.userData?.sitrecModelFormat ?? null,
                    },
                    visibleTextureSample: child.isMesh ? sampleVisibleTexture(child, mainView.camera) : null,
                    materials: materials.map((material) => ({
                        type: material?.type ?? null,
                        name: material?.name ?? null,
                        color: material?.color?.getHexString?.() ?? null,
                        vertexColors: material?.vertexColors ?? null,
                        metalness: material?.metalness ?? null,
                        roughness: material?.roughness ?? null,
                        transparent: material?.transparent ?? null,
                        opacity: material?.opacity ?? null,
                        emissive: material?.emissive?.getHexString?.() ?? null,
                        emissiveIntensity: material?.emissiveIntensity ?? null,
                        envMapIntensity: material?.envMapIntensity ?? null,
                        hasEnvMap: !!material?.envMap,
                        side: material?.side ?? null,
                        hasMap: !!material?.map,
                        mapColorSpace: material?.map?.colorSpace ?? null,
                        mapFlipY: material?.map?.flipY ?? null,
                        hasNormalMap: !!material?.normalMap,
                        hasMetalnessMap: !!material?.metalnessMap,
                        hasRoughnessMap: !!material?.roughnessMap,
                        hasAoMap: !!material?.aoMap,
                        hasEmissiveMap: !!material?.emissiveMap,
                        gltfUnlit: !!material?.userData?.gltfExtensions?.KHR_materials_unlit,
                        sitrecDroppedModelMaterialFix: material?.userData?.sitrecDroppedModelMaterialFix ?? null,
                    })),
                });
            });

            if (modelNode.rootChildren.length > 0) {
                diagnostics.modelNodes.push(modelNode);
            }
        }

        return diagnostics;
    });
}

function meanLuma(imagePath) {
    const png = PNG.sync.read(fs.readFileSync(imagePath));
    let sum = 0;

    for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    return sum / (png.width * png.height);
}

function nonBackgroundMeanLuma(imagePath, background = 128, tolerance = 6) {
    const png = PNG.sync.read(fs.readFileSync(imagePath));
    let sum = 0;
    let count = 0;

    for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];

        const looksLikeBackground =
            Math.abs(r - background) <= tolerance
            && Math.abs(g - background) <= tolerance
            && Math.abs(b - background) <= tolerance;

        if (looksLikeBackground) {
            continue;
        }

        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        count++;
    }

    return {
        mean: count > 0 ? sum / count : null,
        count,
    };
}

function readPixel(imagePath, x, y) {
    const png = PNG.sync.read(fs.readFileSync(imagePath));
    const clampedX = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const clampedY = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    const i = (clampedY * png.width + clampedX) * 4;
    return {
        r: png.data[i],
        g: png.data[i + 1],
        b: png.data[i + 2],
        a: png.data[i + 3],
        luma: 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2],
    };
}

async function captureGLBVariant(page, label, variant) {
    const captureInfo = await page.evaluate((variant) => {
        const lighting = window.NodeMan.get("lighting");
        lighting.ambientIntensity = variant.ambientIntensity;
        lighting.sunIntensity = variant.sunIntensity;
        lighting.recalculate(false);

        const mainView = window.NodeMan.get("mainView");
        const scene = mainView.scene;
        const Vec3 = mainView.camera.position.constructor;
        const ColorCtor = window.Globals.ambientLight.color.constructor;

        scene.fog = null;
        scene.background = new ColorCtor(variant.backgroundHex ?? 0x808080);
        if (variant.clearEnvironment) {
            scene.environment = null;
        }

        let mesh = null;
        let glbRoot = null;
        for (const entry of Object.values(window.NodeMan?.list ?? {})) {
            const modelRoot = entry?.data?.model;
            if (!modelRoot) {
                continue;
            }

            modelRoot.visible = true;
            entry?.data?.model?.traverse?.((child) => {
                if (!mesh && child?.isMesh && child.name === "geometry_0") {
                    mesh = child;
                    glbRoot = modelRoot;
                }
            });
        }

        if (!mesh) {
            return null;
        }

        for (const entry of Object.values(window.NodeMan?.list ?? {})) {
            const modelRoot = entry?.data?.model;
            if (modelRoot && modelRoot !== glbRoot) {
                modelRoot.visible = false;
            }
        }

        mesh.castShadow = !variant.disableShadows;
        mesh.receiveShadow = !variant.disableShadows;

        const originalMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const newMaterials = originalMaterials.map((material) => {
            const activeMaterial = material.clone();

            if (variant.flatGray) {
                const canvas = document.createElement("canvas");
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "rgb(128,128,128)";
                ctx.fillRect(0, 0, 1, 1);
                const texture = material.map?.clone?.() ?? activeMaterial.map?.clone?.();
                texture.image = canvas;
                texture.colorSpace = material.map?.colorSpace ?? activeMaterial.map?.colorSpace ?? "srgb";
                texture.needsUpdate = true;
                activeMaterial.map = texture;
            }

            if (variant.mapFlipY !== undefined && activeMaterial.map) {
                activeMaterial.map.flipY = variant.mapFlipY;
                activeMaterial.map.needsUpdate = true;
            }

            if (variant.removeMap) {
                activeMaterial.map = null;
            }

            if (variant.diffuseHex !== undefined && activeMaterial.color) {
                activeMaterial.color.setHex(variant.diffuseHex);
            }

            if (variant.emissiveHex !== undefined && activeMaterial.emissive) {
                activeMaterial.emissive.setHex(variant.emissiveHex);
            }

            if (variant.emissiveIntensity !== undefined) {
                activeMaterial.emissiveIntensity = variant.emissiveIntensity;
            }

            if (variant.emissiveMapMode === "original") {
                activeMaterial.emissiveMap = material.map ?? null;
            } else if (variant.emissiveMapMode === "activeMap") {
                activeMaterial.emissiveMap = activeMaterial.map ?? null;
            } else if (variant.emissiveMapMode === "none") {
                activeMaterial.emissiveMap = null;
            }

            if (variant.mapFlipY !== undefined && activeMaterial.emissiveMap) {
                activeMaterial.emissiveMap.flipY = variant.mapFlipY;
                activeMaterial.emissiveMap.needsUpdate = true;
            }

            if (variant.envMapIntensity !== undefined) {
                activeMaterial.envMapIntensity = variant.envMapIntensity;
            }

            if (variant.metalness !== undefined && activeMaterial.metalness !== undefined) {
                activeMaterial.metalness = variant.metalness;
            }

            if (variant.roughness !== undefined && activeMaterial.roughness !== undefined) {
                activeMaterial.roughness = variant.roughness;
            }

            if (variant.side !== undefined) {
                activeMaterial.side = variant.side;
            }

            activeMaterial.needsUpdate = true;
            return activeMaterial;
        });

        mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
        window.setRenderOne?.(true);

        const camera = mainView.camera;
        mesh.updateMatrixWorld(true);
        mesh.geometry.computeBoundingBox();

        const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        const center = bounds.getCenter(new Vec3());
        const size = bounds.getSize(new Vec3());
        const radius = Math.max(size.x, size.y, size.z) * 0.5;

        camera.position.copy(center.clone().add(new Vec3(radius * 1.6, radius * 0.9, radius * 2.4)));
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const corners = [];
        for (const x of [bounds.min.x, bounds.max.x]) {
            for (const y of [bounds.min.y, bounds.max.y]) {
                for (const z of [bounds.min.z, bounds.max.z]) {
                    corners.push(new Vec3(x, y, z));
                }
            }
        }

        const projected = corners.map((corner) => corner.project(camera));
        const width = window.innerWidth;
        const height = window.innerHeight;
        const xs = projected.map((point) => (point.x * 0.5 + 0.5) * width);
        const ys = projected.map((point) => (-point.y * 0.5 + 0.5) * height);
        const padding = Math.max(16, Math.round(radius * 4));
        const x0 = Math.max(0, Math.floor(Math.min(...xs)) - padding);
        const y0 = Math.max(0, Math.floor(Math.min(...ys)) - padding);
        const x1 = Math.min(width, Math.ceil(Math.max(...xs)) + padding);
        const y1 = Math.min(height, Math.ceil(Math.max(...ys)) + padding);

        return {
            clip: {
                x: x0,
                y: y0,
                width: Math.max(1, x1 - x0),
                height: Math.max(1, y1 - y0),
            },
            scene: {
                hasEnvironment: !!scene.environment,
                hasBackground: !!scene.background,
                hasFog: !!scene.fog,
            },
            geometry: {
                normalCount: mesh.geometry.attributes.normal?.count ?? null,
                uvCount: mesh.geometry.attributes.uv?.count ?? null,
                colorCount: mesh.geometry.attributes.color?.count ?? null,
            },
            materialInfo: newMaterials.map((material) => ({
                type: material.type,
                color: material.color?.getHexString?.() ?? null,
                emissive: material.emissive?.getHexString?.() ?? null,
                emissiveIntensity: material.emissiveIntensity ?? null,
                hasMap: !!material.map,
                hasEmissiveMap: !!material.emissiveMap,
                hasEnvMap: !!material.envMap,
                envMapIntensity: material.envMapIntensity ?? null,
                mapColorSpace: material.map?.colorSpace ?? null,
                metalness: material.metalness ?? null,
                roughness: material.roughness ?? null,
                side: material.side ?? null,
                vertexColors: material.vertexColors ?? null,
            })),
        };
    }, variant);

    await page.waitForTimeout(1200);

    const imagePath = path.join(OUTPUT_DIR, `${label}.png`);
    await page.screenshot({
        path: imagePath,
        clip: captureInfo.clip,
    });

    const nonBackground = nonBackgroundMeanLuma(imagePath);

    return {
        label,
        imagePath,
        luma: meanLuma(imagePath),
        nonBackgroundLuma: nonBackground.mean,
        nonBackgroundPixelCount: nonBackground.count,
        ...captureInfo,
    };
}

test("captures GLB vs PLY brightness diagnostics", async ({page}) => {
    ensureOutputDir();
    await waitForScene(page);

    const diagnostics = await collectDiagnostics(page);
    const droppedGLBMesh = diagnostics.modelNodes
        .flatMap((node) => node.rootChildren)
        .find((child) =>
            child.kind === "mesh"
            && child.materials.some((material) =>
                material.sitrecDroppedModelMaterialFix === "demetalized-for-ambient",
            ),
        );

    expect(diagnostics.modelNodes.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.modelNodes.some((node) =>
        node.rootChildren.some((child) => child.userData.sitrecGaussianSplat),
    )).toBe(true);
    expect(droppedGLBMesh).toBeDefined();
    expect(droppedGLBMesh.normalCount).toBeGreaterThan(0);
    expect(droppedGLBMesh.materials.some((material) => material.type === "MeshStandardMaterial")).toBe(true);

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "diagnostics.json"),
        `${JSON.stringify(diagnostics, null, 2)}\n`,
        "utf8",
    );

    await page.screenshot({
        path: path.join(OUTPUT_DIR, "scene.png"),
        fullPage: true,
    });
});

test("analyzes GLB lighting path with controlled material variants", async ({page}) => {
    ensureOutputDir();

    const variants = [
        {
            label: "neutral-standard-original-lit",
            options: {
                ambientIntensity: 2.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                removeMap: false,
                diffuseHex: 0xffffff,
                emissiveHex: 0x000000,
                emissiveIntensity: 1,
                emissiveMapMode: "none",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-standard-flat-diffuse-lit",
            options: {
                ambientIntensity: 2.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                removeMap: true,
                diffuseHex: 0x808080,
                emissiveHex: 0x000000,
                emissiveIntensity: 1,
                emissiveMapMode: "none",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-standard-original-lit-flipy",
            options: {
                ambientIntensity: 2.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                mapFlipY: true,
                removeMap: false,
                diffuseHex: 0xffffff,
                emissiveHex: 0x000000,
                emissiveIntensity: 1,
                emissiveMapMode: "none",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-standard-original-unlit-check",
            options: {
                ambientIntensity: 0.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: false,
                backgroundHex: 0x808080,
                flatGray: false,
                removeMap: false,
                diffuseHex: 0xffffff,
                emissiveHex: 0x000000,
                emissiveIntensity: 1,
                emissiveMapMode: "none",
                envMapIntensity: 1,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-standard-original-unlit-no-env",
            options: {
                ambientIntensity: 0.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                removeMap: false,
                diffuseHex: 0xffffff,
                emissiveHex: 0x000000,
                emissiveIntensity: 1,
                emissiveMapMode: "none",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-emissive-original-texture",
            options: {
                ambientIntensity: 0.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                removeMap: true,
                diffuseHex: 0x000000,
                emissiveHex: 0xffffff,
                emissiveIntensity: 1,
                emissiveMapMode: "original",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-emissive-original-texture-flipy",
            options: {
                ambientIntensity: 0.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                mapFlipY: true,
                removeMap: true,
                diffuseHex: 0x000000,
                emissiveHex: 0xffffff,
                emissiveIntensity: 1,
                emissiveMapMode: "original",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
        {
            label: "neutral-emissive-flat-gray",
            options: {
                ambientIntensity: 0.0,
                sunIntensity: 0.0,
                disableShadows: true,
                clearEnvironment: true,
                backgroundHex: 0x808080,
                flatGray: false,
                removeMap: true,
                diffuseHex: 0x000000,
                emissiveHex: 0x808080,
                emissiveIntensity: 1,
                emissiveMapMode: "none",
                envMapIntensity: 0,
                metalness: 0,
                roughness: 1,
            },
        },
    ];

    const captures = [];

    for (const variant of variants) {
        await waitForScene(page);
        captures.push(await captureGLBVariant(page, variant.label, variant.options));
    }

    const summary = {
        captures,
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "lighting-variants.json"),
        `${JSON.stringify(summary, null, 2)}\n`,
        "utf8",
    );

    expect(captures).toHaveLength(8);
});

test("traces a bright wing texel through GLB shading in the reference sitch", async ({page}) => {
    test.setTimeout(300000);
    ensureOutputDir();
    await waitForSpecificScene(page, REFERENCE_CUSTOM_URL);

    const probe = await page.evaluate(() => {
        function findPlaneMaterialConstructor(rootEntries) {
            for (const entry of rootEntries) {
                const modelRoot = entry?.data?.model;
                let ctor = null;
                modelRoot?.traverse?.((child) => {
                    if (ctor || !child?.isMesh) {
                        return;
                    }
                    if (child.geometry?.type === "PlaneGeometry" && child.material?.type === "MeshBasicMaterial") {
                        ctor = child.material.constructor;
                    }
                });
                if (ctor) {
                    return ctor;
                }
            }

            return null;
        }

        function findReferencePlaneInfo(rootEntries) {
            let best = null;

            for (const entry of rootEntries) {
                const modelRoot = entry?.data?.model;
                modelRoot?.traverse?.((child) => {
                    if (!child?.isMesh || child.name === "geometry_0") {
                        return;
                    }

                    const material = Array.isArray(child.material) ? child.material[0] : child.material;
                    if (!material?.map) {
                        return;
                    }

                    const vertexCount = child.geometry?.attributes?.position?.count ?? 0;
                    const candidate = {
                        name: child.name ?? "",
                        geometryType: child.geometry?.type ?? null,
                        vertexCount,
                        materialType: material.type,
                        mapColorSpace: material.map?.colorSpace ?? null,
                    };

                    if (!best || vertexCount > best.vertexCount) {
                        best = candidate;
                    }
                });
            }

            return best;
        }

        function chooseWingPoint(mesh, camera, raycaster) {
            const geometry = mesh.geometry;
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const image = material.map?.image;
            if (!geometry.attributes.uv || !image) {
                return null;
            }

            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d", {willReadFrequently: true});
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const Vec3 = camera.position.constructor;
            const boundsCenter = mesh.geometry.boundingBox
                .clone()
                .getCenter(new Vec3())
                .applyMatrix4(mesh.matrixWorld)
                .project(camera);
            const modelCenterX = (boundsCenter.x * 0.5 + 0.5) * window.innerWidth;

            const boundsPoints = [];
            const worldBounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
            for (const x of [worldBounds.min.x, worldBounds.max.x]) {
                for (const y of [worldBounds.min.y, worldBounds.max.y]) {
                    for (const z of [worldBounds.min.z, worldBounds.max.z]) {
                        boundsPoints.push(new Vec3(x, y, z).project(camera));
                    }
                }
            }
            const xs = boundsPoints.map((point) => (point.x * 0.5 + 0.5) * window.innerWidth);
            const ys = boundsPoints.map((point) => (-point.y * 0.5 + 0.5) * window.innerHeight);
            const minX = Math.max(0, Math.floor(Math.min(...xs)));
            const maxX = Math.min(window.innerWidth - 1, Math.ceil(Math.max(...xs)));
            const minY = Math.max(0, Math.floor(Math.min(...ys)));
            const maxY = Math.min(window.innerHeight - 1, Math.ceil(Math.max(...ys)));
            const viewDir = new Vec3();
            const worldNormal = new Vec3();

            function samplePixel(u, v) {
                const x = Math.max(0, Math.min(canvas.width - 1, Math.round(u * (canvas.width - 1))));
                const y = Math.max(0, Math.min(canvas.height - 1, Math.round((1 - v) * (canvas.height - 1))));
                const offset = (y * canvas.width + x) * 4;
                return {
                    x,
                    y,
                    r: imageData[offset],
                    g: imageData[offset + 1],
                    b: imageData[offset + 2],
                };
            }

            let best = null;
            const ndc = {x: 0, y: 0};
            for (let screenY = minY; screenY <= maxY; screenY += 6) {
                for (let screenX = Math.max(minX, Math.floor(modelCenterX) + 1); screenX <= maxX; screenX += 6) {
                    ndc.x = (screenX / window.innerWidth) * 2 - 1;
                    ndc.y = -(screenY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(ndc, camera);
                    const hit = raycaster.intersectObject(mesh, false)[0];
                    if (!hit?.uv || !hit?.face?.normal) {
                        continue;
                    }

                    worldNormal.copy(hit.face.normal).transformDirection(mesh.matrixWorld).normalize();
                    viewDir.subVectors(camera.position, hit.point).normalize();
                    if (worldNormal.dot(viewDir) <= 0 || worldNormal.y <= 0.2) {
                        continue;
                    }

                    const texel = samplePixel(hit.uv.x, hit.uv.y);
                    const luma = 0.2126 * texel.r + 0.7152 * texel.g + 0.0722 * texel.b;
                    if (luma < 85 || luma > 150) {
                        continue;
                    }

                    const score = screenX + worldNormal.y * 100 + luma;
                    if (!best || score > best.score) {
                        best = {
                            score,
                            screen: {x: screenX, y: screenY},
                            uv: {u: hit.uv.x, v: hit.uv.y},
                            texel,
                            faceNormal: {x: worldNormal.x, y: worldNormal.y, z: worldNormal.z},
                            centroid: {x: hit.point.x, y: hit.point.y, z: hit.point.z},
                        };
                    }
                }
            }

            return best;
        }

        const entries = Object.values(window.NodeMan?.list ?? {});
        const mainView = window.NodeMan.get("mainView");
        const lighting = window.NodeMan.get("lighting");
        lighting.ambientIntensity = 2.0;
        lighting.sunIntensity = 0.0;
        lighting.recalculate(false);

        let mesh = null;
        for (const entry of entries) {
            entry?.data?.model?.traverse?.((child) => {
                if (!mesh && child?.isMesh && child.name === "geometry_0") {
                    mesh = child;
                }
            });
        }

        if (!mesh) {
            return null;
        }

        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.geometry.computeBoundingBox();
        mesh.updateMatrixWorld(true);
        mesh.userData.sitrecProbeOriginalMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

        const probePoint = chooseWingPoint(mesh, mainView.camera, mainView.raycaster);
        return {
            probePoint,
            renderer: {
                colorSpace: mainView.renderer.colorSpace ?? null,
                outputColorSpace: mainView.renderer.outputColorSpace ?? null,
            },
            originalMaterialType: (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).type,
            planeBasicAvailable: !!findPlaneMaterialConstructor(entries),
            referencePlane: findReferencePlaneInfo(entries),
        };
    });

    expect(probe?.probePoint).toBeDefined();

    async function captureReferenceVariant(label, variant) {
        const variantProbe = await page.evaluate((variant) => {
            function findPlaneBasicMaterial(rootEntries) {
                for (const entry of rootEntries) {
                    const modelRoot = entry?.data?.model;
                    let material = null;
                    modelRoot?.traverse?.((child) => {
                        if (material || !child?.isMesh) {
                            return;
                        }
                        if (child.geometry?.type === "PlaneGeometry" && child.material?.type === "MeshBasicMaterial") {
                            material = child.material;
                        }
                    });
                    if (material) {
                        return material;
                    }
                }

                return null;
            }

            const entries = Object.values(window.NodeMan?.list ?? {});
            const lighting = window.NodeMan.get("lighting");
            const mainView = window.NodeMan.get("mainView");
            lighting.ambientIntensity = variant.ambientIntensity;
            lighting.sunIntensity = variant.sunIntensity;
            lighting.recalculate(false);

            let mesh = null;
            let owningNode = null;
            for (const entry of entries) {
                entry?.data?.model?.traverse?.((child) => {
                    if (!mesh && child?.isMesh && child.name === "geometry_0") {
                        mesh = child;
                        owningNode = entry.data;
                    }
                });
            }

            if ((variant.materialMode === "node-debug-texture"
                || variant.materialMode === "node-debug-texture-mipped"
                || variant.materialMode === "node-lighting-only") && owningNode) {
                owningNode.common.modelDisplayMode = variant.materialMode === "node-lighting-only"
                    ? "lightingOnly"
                    : (variant.materialMode === "node-debug-texture-mipped" ? "rawTextureMipped" : "rawTexture");
                owningNode.common.debugTextureOnly = true;
                owningNode.common.applyMaterial = false;
                owningNode.rebuild();
                mesh = null;
                owningNode.model?.traverse?.((child) => {
                    if (!mesh && child?.isMesh && child.name === "geometry_0") {
                        mesh = child;
                    }
                });
            }

            const originalMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const probeOriginalMaterial = mesh.userData.sitrecProbeOriginalMaterial ?? originalMaterial;
            const sourceMap = probeOriginalMaterial.map;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const planeBasicMaterial = findPlaneBasicMaterial(entries);

            mesh.castShadow = false;
            mesh.receiveShadow = false;

            if (variant.materialMode === "node-debug-texture"
                || variant.materialMode === "node-debug-texture-mipped"
                || variant.materialMode === "node-lighting-only") {
                window.setRenderOne?.(true);

                return {
                    screen: variant.probePoint.screen,
                    uv: variant.probePoint.uv,
                    texel: variant.probePoint.texel,
                    faceNormal: variant.probePoint.faceNormal,
                    materialTypes: materials.map((material) => material.type),
                    materialInfo: materials.map((material) => ({
                        type: material.type,
                        mapColorSpace: material.map?.colorSpace ?? null,
                        emissiveMapColorSpace: material.emissiveMap?.colorSpace ?? null,
                        metalness: material.metalness ?? null,
                        roughness: material.roughness ?? null,
                        envMapIntensity: material.envMapIntensity ?? null,
                        emissive: material.emissive?.getHexString?.() ?? null,
                        vertexColors: material.vertexColors ?? null,
                        toneMapped: material.toneMapped ?? null,
                        debugTextureMode: material.userData?.sitrecDebugTextureMode ?? null,
                        hasMap: !!material.map,
                        hasEmissiveMap: !!material.emissiveMap,
                    })),
                };
            }

            const newMaterials = materials.map((material) => {
                let activeMaterial = probeOriginalMaterial.clone();

                if (variant.materialMode === "basic-from-plane" && planeBasicMaterial) {
                    activeMaterial = planeBasicMaterial.clone();
                    activeMaterial.map = sourceMap;
                }

                if (variant.materialMode === "emissive-only") {
                    activeMaterial = probeOriginalMaterial.clone();
                    activeMaterial.map = null;
                    activeMaterial.color?.setHex?.(0x000000);
                    activeMaterial.emissive?.setHex?.(0xffffff);
                    activeMaterial.emissiveIntensity = 1;
                    activeMaterial.emissiveMap = sourceMap;
                    if (activeMaterial.emissiveMap) {
                        activeMaterial.emissiveMap.colorSpace = sourceMap?.colorSpace ?? activeMaterial.emissiveMap.colorSpace;
                        activeMaterial.emissiveMap.needsUpdate = true;
                    }
                }

                if (variant.matchPlaneMapColorSpace !== undefined && sourceMap) {
                    activeMaterial.map = sourceMap.clone();
                    activeMaterial.map.image = sourceMap.image;
                    activeMaterial.map.colorSpace = variant.matchPlaneMapColorSpace;
                    activeMaterial.map.needsUpdate = true;
                }

                if (variant.emissiveMapColorSpace !== undefined && activeMaterial.emissiveMap) {
                    activeMaterial.emissiveMap = sourceMap.clone();
                    activeMaterial.emissiveMap.image = sourceMap.image;
                    activeMaterial.emissiveMap.colorSpace = variant.emissiveMapColorSpace;
                    activeMaterial.emissiveMap.needsUpdate = true;
                }

                if (variant.envMapIntensity !== undefined && activeMaterial.envMapIntensity !== undefined) {
                    activeMaterial.envMapIntensity = variant.envMapIntensity;
                }

                if (variant.metalness !== undefined && activeMaterial.metalness !== undefined) {
                    activeMaterial.metalness = variant.metalness;
                }

                if (variant.roughness !== undefined && activeMaterial.roughness !== undefined) {
                    activeMaterial.roughness = variant.roughness;
                }

                activeMaterial.needsUpdate = true;
                return activeMaterial;
            });

            mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
            window.setRenderOne?.(true);

            return {
                screen: variant.probePoint.screen,
                uv: variant.probePoint.uv,
                texel: variant.probePoint.texel,
                faceNormal: variant.probePoint.faceNormal,
                materialTypes: newMaterials.map((material) => material.type),
                materialInfo: newMaterials.map((material) => ({
                    type: material.type,
                    mapColorSpace: material.map?.colorSpace ?? null,
                    emissiveMapColorSpace: material.emissiveMap?.colorSpace ?? null,
                    metalness: material.metalness ?? null,
                    roughness: material.roughness ?? null,
                    envMapIntensity: material.envMapIntensity ?? null,
                    emissive: material.emissive?.getHexString?.() ?? null,
                    vertexColors: material.vertexColors ?? null,
                    toneMapped: material.toneMapped ?? null,
                    hasMap: !!material.map,
                    hasEmissiveMap: !!material.emissiveMap,
                })),
            };
        }, {...variant, probePoint: probe.probePoint});

        await page.waitForTimeout(1500);

        const imagePath = path.join(OUTPUT_DIR, `${label}.png`);
        await page.screenshot({
            path: imagePath,
        });

        return {
            label,
            imagePath,
            texel: variantProbe.texel,
            screen: variantProbe.screen,
            faceNormal: variantProbe.faceNormal,
            materialTypes: variantProbe.materialTypes,
            materialInfo: variantProbe.materialInfo,
            renderedPixel: readPixel(imagePath, variantProbe.screen.x, variantProbe.screen.y),
        };
    }

    const captures = [];
    captures.push(await captureReferenceVariant("reference-standard-ambient2", {
        ambientIntensity: 2.0,
        sunIntensity: 0.0,
        materialMode: "standard",
        envMapIntensity: 0,
        metalness: 0,
        roughness: 1,
    }));
    captures.push(await captureReferenceVariant("reference-standard-ambient2pi", {
        ambientIntensity: Math.PI * 2.0,
        sunIntensity: 0.0,
        materialMode: "standard",
        envMapIntensity: 0,
        metalness: 0,
        roughness: 1,
    }));
    captures.push(await captureReferenceVariant("reference-standard-no-colorspace", {
        ambientIntensity: 2.0,
        sunIntensity: 0.0,
        materialMode: "standard",
        matchPlaneMapColorSpace: "",
        envMapIntensity: 0,
        metalness: 0,
        roughness: 1,
    }));
    if (probe.referencePlane?.mapColorSpace !== undefined) {
        captures.push(await captureReferenceVariant("reference-standard-plane-colorspace", {
            ambientIntensity: 2.0,
            sunIntensity: 0.0,
            materialMode: "standard",
            matchPlaneMapColorSpace: probe.referencePlane.mapColorSpace,
            envMapIntensity: 0,
            metalness: 0,
            roughness: 1,
        }));
    }
    captures.push(await captureReferenceVariant("reference-basic-map", {
        ambientIntensity: 0.0,
        sunIntensity: 0.0,
        materialMode: "basic-from-plane",
    }));
    captures.push(await captureReferenceVariant("reference-emissive-map", {
        ambientIntensity: 0.0,
        sunIntensity: 0.0,
        materialMode: "emissive-only",
        envMapIntensity: 0,
        metalness: 0,
        roughness: 1,
    }));
    captures.push(await captureReferenceVariant("reference-emissive-map-no-colorspace", {
        ambientIntensity: 0.0,
        sunIntensity: 0.0,
        materialMode: "emissive-only",
        emissiveMapColorSpace: "",
        envMapIntensity: 0,
        metalness: 0,
        roughness: 1,
    }));
    captures.push(await captureReferenceVariant("reference-node-debug-texture", {
        ambientIntensity: 2.0,
        sunIntensity: 0.0,
        materialMode: "node-debug-texture",
    }));
    captures.push(await captureReferenceVariant("reference-node-debug-texture-mipped", {
        ambientIntensity: 2.0,
        sunIntensity: 0.0,
        materialMode: "node-debug-texture-mipped",
    }));
    captures.push(await captureReferenceVariant("reference-node-lighting-only", {
        ambientIntensity: 2.0,
        sunIntensity: 0.0,
        materialMode: "node-lighting-only",
    }));

    const summary = {
        probe,
        captures,
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "reference-wing-trace.json"),
        `${JSON.stringify(summary, null, 2)}\n`,
        "utf8",
    );

    const rawTextureCapture = captures.find((capture) => capture.label === "reference-node-debug-texture");
    expect(rawTextureCapture).toBeDefined();
    expect(rawTextureCapture.materialTypes.every((type) => type === "MeshBasicMaterial")).toBe(true);
    expect(rawTextureCapture.materialInfo.every((material) => material.vertexColors === false)).toBe(true);
    expect(rawTextureCapture.materialInfo.every((material) => material.toneMapped === false)).toBe(true);
    expect(rawTextureCapture.materialInfo.every((material) => material.debugTextureMode === "rawTexture")).toBe(true);
    expect(Math.abs(rawTextureCapture.renderedPixel.r - rawTextureCapture.texel.r)).toBeLessThanOrEqual(12);
    expect(Math.abs(rawTextureCapture.renderedPixel.g - rawTextureCapture.texel.g)).toBeLessThanOrEqual(12);
    expect(Math.abs(rawTextureCapture.renderedPixel.b - rawTextureCapture.texel.b)).toBeLessThanOrEqual(12);

    const rawTextureMippedCapture = captures.find((capture) => capture.label === "reference-node-debug-texture-mipped");
    expect(rawTextureMippedCapture).toBeDefined();
    expect(rawTextureMippedCapture.materialTypes.every((type) => type === "MeshBasicMaterial")).toBe(true);
    expect(rawTextureMippedCapture.materialInfo.every((material) => material.vertexColors === false)).toBe(true);
    expect(rawTextureMippedCapture.materialInfo.every((material) => material.toneMapped === false)).toBe(true);
    expect(rawTextureMippedCapture.materialInfo.every((material) => material.debugTextureMode === "rawTextureMipped")).toBe(true);

    const lightingOnlyCapture = captures.find((capture) => capture.label === "reference-node-lighting-only");
    expect(lightingOnlyCapture).toBeDefined();
    expect(lightingOnlyCapture.materialTypes.every((type) => type === "MeshLambertMaterial")).toBe(true);
    expect(lightingOnlyCapture.materialInfo.every((material) => material.vertexColors === false)).toBe(true);
    expect(lightingOnlyCapture.materialInfo.every((material) => material.toneMapped === false)).toBe(true);
    expect(lightingOnlyCapture.renderedPixel.luma).toBeLessThan(240);
    expect(lightingOnlyCapture.renderedPixel.luma).toBeGreaterThan(20);

    expect(captures.length).toBeGreaterThanOrEqual(4);
});

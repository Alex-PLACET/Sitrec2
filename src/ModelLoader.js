import {FileManager} from "./Globals";
import {getFileExtension, m2f, stripURLSuffixPreservingHashParameters} from "./utils";
import {sharedUniforms} from "./js/map33/material/SharedUniforms";
import {DRACOLoader} from "three/addons/loaders/DRACOLoader.js";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {PLYLoader} from "three/addons/loaders/PLYLoader.js";
import {
    BufferAttribute,
    Color,
    Group,
    Mesh,
    MeshStandardMaterial,
    NormalBlending,
    Points,
    PointsMaterial,
    ShaderMaterial,
} from "three";

const SUPPORTED_MODEL_EXTENSIONS = Object.freeze(["glb", "ply"]);
const supportedModelExtensions = new Set(SUPPORTED_MODEL_EXTENSIONS);
const SH_C0 = 0.28209479177387814;

function coerceArrayBuffer(data, filename) {
    if (data instanceof ArrayBuffer) {
        return data;
    }

    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }

    throw new Error(`Unsupported model data for "${filename}"`);
}

function getDisplayModelName(filename) {
    const cleanFilename = stripURLSuffixPreservingHashParameters(filename);
    return cleanFilename.replace(/\\/g, "/").split("/").pop() || cleanFilename;
}

const filenameParameterHandlers = Object.freeze({
    L: (parameters, value, units) => {
        const modelLengthFeet = parseFilenameModelLengthToFeet(value, units);
        if (modelLengthFeet !== null) {
            parameters.modelLength = modelLengthFeet;
        }
    },
});

function parseFilenameModelLengthToFeet(value, units) {
    const normalizedUnits = units?.toLowerCase() ?? "";

    switch (normalizedUnits) {
        case "":
        case "f":
        case "ft":
        case "feet":
            return value;

        case "m":
        case "meter":
        case "meters":
            return m2f(value);

        default:
            return null;
    }
}

export function extractModelFilenameParameters(filename) {
    const parameters = {};
    const displayName = getDisplayModelName(filename);

    for (const block of displayName.matchAll(/#([^#]+)#/g)) {
        const blockText = block[1];
        for (const match of blockText.matchAll(/([A-Za-z])\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*([A-Za-z]+)?/g)) {
            const key = match[1].toUpperCase();
            const value = Number.parseFloat(match[2]);
            const units = match[3];
            if (!Number.isFinite(value)) {
                continue;
            }

            const handler = filenameParameterHandlers[key];
            if (handler) {
                handler(parameters, value, units);
            }
        }
    }

    return parameters;
}

function attachFilenameParameters(modelAsset, filename) {
    const filenameParameters = extractModelFilenameParameters(filename);
    modelAsset.filenameParameters = filenameParameters;
    modelAsset.scene.userData ??= {};
    modelAsset.scene.userData.sitrecFilenameParameters = filenameParameters;
    return modelAsset;
}

function createDRACOLoader() {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("./libs/draco/");
    return dracoLoader;
}

function createGLTFLoader() {
    const loader = new GLTFLoader();
    const dracoLoader = createDRACOLoader();
    loader.setDRACOLoader(dracoLoader);
    return loader;
}

function checkModelHierarchy(gltf, filename) {
    const issues = [];
    const meshesWithArmature = [];

    gltf.scene.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        let current = node;
        let hasArmature = false;
        const path = [];

        while (current.parent && current.parent !== gltf.scene) {
            current = current.parent;
            const nodeName = current.name || "unnamed";
            path.unshift(nodeName);

            if (nodeName.toLowerCase().includes("armature")) {
                hasArmature = true;
            }
        }

        if (hasArmature) {
            meshesWithArmature.push({
                name: node.name || "unnamed mesh",
                path,
            });
        }
    });

    if (meshesWithArmature.length > 0) {
        issues.push("Meshes parented to Armature detected. This can cause vertex distortion when positioned far from origin. Consider flattening the hierarchy in Blender by unparenting meshes from the Armature (Select mesh -> Option+P -> Clear Parent, then delete the Armature node).");
    }

    if (issues.length > 0) {
        const message = `⚠️ Model Hierarchy Warning: ${filename}\n\n${issues.join("\n\n")}\n\nThe model will still load, but may exhibit visual artifacts at large distances from origin.`;
        console.warn(message);
        alert(message);
    }
}

function isDroppedModelFile(file) {
    return !String(file).startsWith("data/models/");
}

function shouldNormalizeDroppedModelMaterial(file, material) {
    if (!isDroppedModelFile(file)) {
        return false;
    }

    if (!(material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial)) {
        return false;
    }

    if (material.userData?.gltfExtensions?.KHR_materials_unlit) {
        return false;
    }

    if (!material.map || material.envMap || material.metalnessMap) {
        return false;
    }

    return (material.metalness ?? 0) >= 0.95;
}

function normalizeDroppedModelMaterials(scene, file) {
    scene.traverse((child) => {
        if (!child.isMesh) {
            return;
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
            if (!shouldNormalizeDroppedModelMaterial(file, material)) {
                continue;
            }

            material.metalness = 0;
            material.needsUpdate = true;
            material.userData ??= {};
            material.userData.sitrecDroppedModelMaterialFix = "demetalized-for-ambient";
        }
    });
}

function headerTextForPLY(data) {
    const buffer = coerceArrayBuffer(data, "PLY");
    const scanBytes = Math.min(buffer.byteLength, 65536);
    const headerProbe = new TextDecoder("utf-8").decode(buffer.slice(0, scanBytes));
    const headerMatch = headerProbe.match(/^([\s\S]*?end_header(?:\r\n|\r|\n))/i);
    return headerMatch ? headerMatch[1] : headerProbe;
}

function plyHasFaces(data) {
    const headerText = headerTextForPLY(data);
    const faceMatch = headerText.match(/element\s+face\s+(\d+)/i);
    return faceMatch ? Number(faceMatch[1]) > 0 : false;
}

function setPLYCustomPropertyMappings(loader) {
    loader.setCustomPropertyNameMapping({
        splatColorDc: ["f_dc_0", "f_dc_1", "f_dc_2"],
        splatScale: ["scale_0", "scale_1", "scale_2"],
        splatRotation: ["rot_0", "rot_1", "rot_2", "rot_3"],
        splatOpacity: ["opacity"],
    });
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
}

function ensurePLYPointColors(geometry) {
    if (geometry.getAttribute("color")) {
        return geometry.getAttribute("color");
    }

    const splatColorDc = geometry.getAttribute("splatColorDc");
    if (!splatColorDc) {
        return null;
    }

    const colors = new Float32Array(splatColorDc.count * 3);
    for (let i = 0; i < splatColorDc.count; i++) {
        const base = i * 3;
        colors[base] = clamp01(0.5 + SH_C0 * splatColorDc.array[base]);
        colors[base + 1] = clamp01(0.5 + SH_C0 * splatColorDc.array[base + 1]);
        colors[base + 2] = clamp01(0.5 + SH_C0 * splatColorDc.array[base + 2]);
    }

    const colorAttribute = new BufferAttribute(colors, 3);
    geometry.setAttribute("color", colorAttribute);
    return colorAttribute;
}

function ensurePLYPointOpacity(geometry) {
    const existing = geometry.getAttribute("splatOpacity");
    if (existing) {
        const normalized = new Float32Array(existing.count);
        for (let i = 0; i < existing.count; i++) {
            normalized[i] = clamp01(sigmoid(existing.array[i]));
        }
        const opacityAttribute = new BufferAttribute(normalized, 1);
        geometry.setAttribute("splatOpacity", opacityAttribute);
        return opacityAttribute;
    }

    const opacity = new Float32Array(geometry.getAttribute("position").count);
    opacity.fill(1);
    const opacityAttribute = new BufferAttribute(opacity, 1);
    geometry.setAttribute("splatOpacity", opacityAttribute);
    return opacityAttribute;
}

function ensurePLYPointSize(geometry) {
    const existing = geometry.getAttribute("splatSize");
    if (existing) {
        return existing;
    }

    const splatScale = geometry.getAttribute("splatScale");
    const sizes = new Float32Array(geometry.getAttribute("position").count);

    if (splatScale) {
        for (let i = 0; i < splatScale.count; i++) {
            const base = i * 3;
            const sx = Math.exp(splatScale.array[base]);
            const sy = Math.exp(splatScale.array[base + 1]);
            const sz = Math.exp(splatScale.array[base + 2]);
            sizes[i] = Math.max(sx, sy, sz) * 2.0;
        }
    } else {
        sizes.fill(1);
    }

    const sizeAttribute = new BufferAttribute(sizes, 1);
    geometry.setAttribute("splatSize", sizeAttribute);
    return sizeAttribute;
}

function createPLYPointCloudMaterial(geometry, filename) {
    const usesSplatAttributes = geometry.getAttribute("splatColorDc") !== undefined
        || geometry.getAttribute("splatScale") !== undefined
        || geometry.getAttribute("splatOpacity") !== undefined;
    const colorAttribute = ensurePLYPointColors(geometry);
    const opacityAttribute = ensurePLYPointOpacity(geometry);
    const sizeAttribute = ensurePLYPointSize(geometry);

    if (!usesSplatAttributes && !colorAttribute) {
        return new PointsMaterial({
            color: 0xbfbfbf,
            size: 2,
            sizeAttenuation: true,
        });
    }

    const fallbackColor = new Color(0xbfbfbf);
    const opaqueCutout = usesSplatAttributes;
    const vertexShader = `
        attribute float splatOpacity;
        attribute float splatSize;
        ${colorAttribute ? "attribute vec3 color;" : ""}

        uniform float viewportHeight;
        uniform float minPointSize;
        uniform float maxPointSize;
        uniform float sizeMultiplier;
        uniform vec3 fallbackColor;

        varying vec3 vColor;
        varying float vOpacity;
        varying float vDepth;

        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

            float modelScaleX = length(modelMatrix[0].xyz);
            float modelScaleY = length(modelMatrix[1].xyz);
            float modelScaleZ = length(modelMatrix[2].xyz);
            float modelScale = max(modelScaleX, max(modelScaleY, modelScaleZ));
            float worldSize = max(0.0001, splatSize * modelScale * sizeMultiplier);
            float projectedSize = worldSize * viewportHeight * projectionMatrix[1][1] / max(-mvPosition.z, 0.0001);

            gl_PointSize = clamp(projectedSize, minPointSize, maxPointSize);
            gl_Position = projectionMatrix * mvPosition;
            vDepth = gl_Position.w;

            vOpacity = splatOpacity;
            ${colorAttribute ? "vColor = color;" : "vColor = fallbackColor;"}
        }
    `;

    const fragmentShader = `
        uniform float nearPlane;
        uniform float farPlane;

        varying vec3 vColor;
        varying float vOpacity;
        varying float vDepth;

        void main() {
            vec2 centered = gl_PointCoord * 2.0 - 1.0;
            float radiusSquared = dot(centered, centered);
            if (radiusSquared > 1.0) {
                discard;
            }

            ${opaqueCutout ? `
            if (vOpacity < 0.02) {
                discard;
            }
            gl_FragColor = vec4(vColor, 1.0);
            ` : `
            float alpha = exp(-radiusSquared * 4.0) * vOpacity;
            if (alpha < 0.08) {
                discard;
            }
            gl_FragColor = vec4(vColor, alpha);
            `}

            float z = (log2(max(nearPlane, 1.0 + vDepth)) / log2(1.0 + farPlane)) * 2.0 - 1.0;
            gl_FragDepthEXT = z * 0.5 + 0.5;
        }
    `;

    const material = new ShaderMaterial({
        name: `${getDisplayModelName(filename)} PLY Point Cloud`,
        vertexShader,
        fragmentShader,
        uniforms: {
            viewportHeight: {value: 1080},
            minPointSize: {value: 2.0},
            maxPointSize: {value: usesSplatAttributes ? 96.0 : 24.0},
            sizeMultiplier: {value: usesSplatAttributes ? 1.5 : 1.0},
            fallbackColor: {value: fallbackColor},
            ...sharedUniforms,
        },
        transparent: !opaqueCutout,
        depthTest: true,
        depthWrite: true,
        blending: NormalBlending,
    });

    material.userData ??= {};
    material.userData.sitrecPLYPointCloud = true;
    material.userData.sitrecUsesSplatAttributes = usesSplatAttributes;
    material.userData.sitrecPointCount = opacityAttribute.count;
    sizeAttribute.needsUpdate = true;

    return material;
}

function createPLYModel(geometry, filename, sourceData) {
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const hasFaces = plyHasFaces(sourceData);
    const usesVertexColors = geometry.getAttribute("color") !== undefined;

    const root = new Group();
    root.name = getDisplayModelName(filename);
    root.userData.sitrecModelFormat = "ply";
    root.userData.sitrecPlyHasFaces = hasFaces;

    if (hasFaces && geometry.getAttribute("normal") === undefined) {
        geometry.computeVertexNormals();
    }

    if (hasFaces) {
        const material = new MeshStandardMaterial({
            color: usesVertexColors ? 0xffffff : 0xbfbfbf,
            vertexColors: usesVertexColors,
        });
        const mesh = new Mesh(geometry, material);
        mesh.name = root.name;
        // PLY exports commonly preserve Blender/Z-up coordinates.
        // Convert to Sitrec's Y-up convention while keeping the wrapper group unrotated.
        mesh.rotateX(-Math.PI / 2);
        mesh.updateMatrix();
        root.add(mesh);
    } else {
        const material = createPLYPointCloudMaterial(geometry, filename);
        const points = new Points(geometry, material);
        points.name = root.name;
        points.rotateX(-Math.PI / 2);
        points.updateMatrix();
        points.userData.sitrecPLYPointCloud = material.userData?.sitrecPLYPointCloud === true;
        root.add(points);
    }

    return {
        scene: root,
        format: "ply",
        source: geometry,
    };
}

function parseGLBModel(data, filename) {
    return new Promise((resolve, reject) => {
        const loader = createGLTFLoader();
        loader.parse(coerceArrayBuffer(data, filename), "", (gltf) => {
            checkModelHierarchy(gltf, filename);
            normalizeDroppedModelMaterials(gltf.scene, filename);

            resolve({
                scene: gltf.scene,
                format: "glb",
                source: gltf,
            });
        }, (error) => {
            reject(error);
        });
    });
}

function parsePLYModel(data, filename) {
    const loader = new PLYLoader();
    setPLYCustomPropertyMappings(loader);
    const geometry = loader.parse(coerceArrayBuffer(data, filename));
    return Promise.resolve(createPLYModel(geometry, filename, data));
}

const modelParsers = {
    glb: parseGLBModel,
    ply: parsePLYModel,
};

function attachCallbacks(promise, onLoad, onError) {
    if (onLoad || onError) {
        promise.then((result) => {
            if (onLoad) {
                onLoad(result);
            }
        }).catch((error) => {
            if (onError) {
                onError(error);
            }
        });
    }

    return promise;
}

export function getModelFileExtension(filename) {
    return getFileExtension(filename).toLowerCase();
}

export function isSupportedModelFile(filename) {
    return supportedModelExtensions.has(getModelFileExtension(filename));
}

export function getSupportedModelExtensions() {
    return [...SUPPORTED_MODEL_EXTENSIONS];
}

export function parseModelData(filename, data, onLoad, onError) {
    const extension = getModelFileExtension(filename);
    const parser = modelParsers[extension];

    const promise = parser
        ? parser(data, filename).then((modelAsset) => attachFilenameParameters(modelAsset, filename))
        : Promise.reject(new Error(`Unsupported model format "${extension}" for "${filename}"`));

    return attachCallbacks(promise, onLoad, onError);
}

export function loadModelAsset(filename, onLoad, onError) {
    const promise = FileManager.loadAsset(filename, filename).then((asset) => {
        if (!asset) {
            throw new Error(`No asset data returned for "${filename}"`);
        }
        // Use the actual filename stored in FileManager (with extension) if available,
        // since the key (e.g. "TargetObjectFile") may not have an extension.
        const actualFilename = FileManager.list[filename]?.filename ?? filename;
        return parseModelData(actualFilename, asset.parsed);
    });

    return attachCallbacks(promise, onLoad, onError);
}

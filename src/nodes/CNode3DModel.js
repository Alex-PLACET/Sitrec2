// CNode3DModel.js - CNode3DModel
// a 3D model node - a gltf model, with the model loaded from a file
import {CNode3DGroup} from "./CNode3DGroup";
import {FileManager} from "../Globals";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {DRACOLoader} from "three/addons/loaders/DRACOLoader.js";
import {disposeScene} from "../threeExt";

// Create and configure a DRACO loader
function createDRACOLoader() {
    const dracoLoader = new DRACOLoader();
    // Set the path to the DRACO decoder files (served locally)
    dracoLoader.setDecoderPath('./libs/draco/');
    return dracoLoader;
}

// Create and configure a GLTF loader with DRACO support
function createGLTFLoader() {
    const loader = new GLTFLoader();
    const dracoLoader = createDRACOLoader();
    loader.setDRACOLoader(dracoLoader);
    return loader;
}

// Check for hierarchy depth issues that can cause floating-point precision errors
function checkModelHierarchy(gltf, filename) {
    const issues = [];
    const meshesWithArmature = [];
    
    // Find all meshes parented to an Armature
    gltf.scene.traverse((node) => {
        if (node.isMesh) {
            let current = node;
            let hasArmature = false;
            const path = [];
            
            while (current.parent && current.parent !== gltf.scene) {
                current = current.parent;
                const nodeName = current.name || 'unnamed';
                path.unshift(nodeName);
                
                // Check if this node is an Armature (common Blender export pattern)
                if (nodeName.toLowerCase().includes('armature')) {
                    hasArmature = true;
                }
            }
            
            if (hasArmature) {
                meshesWithArmature.push({
                    name: node.name || 'unnamed mesh',
                    path: path
                });
            }
        }
    });
    
    // Check for meshes parented to Armatures (can cause precision issues with large translations)
    if (meshesWithArmature.length > 0) {
        issues.push(`Meshes parented to Armature detected. This can cause vertex distortion when positioned far from origin. Consider flattening the hierarchy in Blender by unparenting meshes from the Armature (Select mesh → Option+P → Clear Parent, then delete the Armature node).`);
    }
    
    if (issues.length > 0) {
        const message = `⚠️ Model Hierarchy Warning: ${filename}\n\n${issues.join('\n\n')}\n\nThe model will still load, but may exhibit visual artifacts at large distances from origin.`;
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

    // Fully metallic textured imports without IBL tend to render as black silhouettes
    // under ambient-only lighting, which is common with some AI-generated GLBs.
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

export function loadGLTFModel(file, callback, errorCallback) {

    console.log("Async Loading asset for", file);
    FileManager.loadAsset(file, file).then( (asset) => {
        const loader = createGLTFLoader()
        loader.parse(asset.parsed, "", gltf => {
            console.log("(after async) Parsed asset for", file, " now traversing...");

            // Check for hierarchy issues
            checkModelHierarchy(gltf, file);
            normalizeDroppedModelMaterials(gltf.scene, file);
            
            callback(gltf);
        }, (error) => {
            console.error("Error parsing GLTF model:", file, error);
            if (errorCallback) errorCallback(error);
        })
    }).catch((error) => {
        console.error("Error loading GLTF model asset:", file, error);
        if (errorCallback) errorCallback(error);
    })
}

export class CNode3DModel extends CNode3DGroup {
    constructor(v) {
        super(v);

        const data = FileManager.get(v.TargetObjectFile ?? "TargetObjectFile")
        const filename = v.TargetObjectFile ?? "TargetObjectFile"

        const loader = createGLTFLoader()
        loader.parse(data, "", (gltf2) => {
            // Check for hierarchy issues
            checkModelHierarchy(gltf2, filename);
            normalizeDroppedModelMaterials(gltf2.scene, filename);
            
            this.model = gltf2.scene //.getObjectByName('FA-18F')
            this.model.scale.setScalar(1);
            this.model.visible = true
            this.group.add(this.model)
        })

    }

    dispose()
    {
        this.group.remove(this.model)
        disposeScene(this.model)
        this.model = undefined
        super.dispose()
    }

    modSerialize() {
        return {
            ...super.modSerialize(),
            tiltType: this.tiltType,
        }
    }

    modDeserialize(v) {
        super.modDeserialize(v)
        this.tiltType = v.tiltType
    }

    update(f) {
        super.update(f)
        this.recalculate() // every frame so scale is correct after the jet loads

    }

    recalculate() {
        super.recalculate()
        this.propagateLayerMask()

    }

}

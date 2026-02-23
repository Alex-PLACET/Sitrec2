import {sharedUniforms} from "./js/map33/material/SharedUniforms";
import {wgs84} from "./LLA-ECEF-ENU";
import {Globals} from "./Globals";
import {Vector3} from "three";

// Plugin for 3d-tiles-renderer that injects day/night lighting into tile materials.
// Uses onBeforeCompile to patch the existing material shaders so the
// PBR textures and UVs are preserved while adding the same global sun-based
// illumination that TerrainDayNightMaterial provides to the terrain tiles.
export class TilesDayNightPlugin {

    constructor() {
        this._onLoadModel = null;
    }

    init(tiles) {
        this._onLoadModel = ({scene}) => {
            scene.traverse(child => {
                if (child.isMesh && child.material) {
                    this._patchMaterial(child.material);
                }
            });
        };

        tiles.addEventListener('load-model', this._onLoadModel);

        // Patch materials on any already-loaded tiles
        tiles.forEachLoadedModel((scene) => {
            scene.traverse(child => {
                if (child.isMesh && child.material) {
                    this._patchMaterial(child.material);
                }
            });
        });
    }

    _patchMaterial(material) {
        if (material._dayNightPatched) return;
        material._dayNightPatched = true;

        const hasNormals = material.isMeshStandardMaterial || material.isMeshPhongMaterial
            || material.isMeshLambertMaterial || material.isMeshPhysicalMaterial;

        // Store reference to shared uniforms so the shader stays in sync
        const extraUniforms = {
            sunDirection: {value: Globals.sunLight.position},
            earthCenter: {value: new Vector3(0, -wgs84.RADIUS, 0)},
            sunGlobalTotal: sharedUniforms.sunGlobalTotal,
            sunAmbientIntensity: sharedUniforms.sunAmbientIntensity,
            useDayNight: sharedUniforms.useDayNight,
            terrainShadingStrength: {value: 0.3},
        };

        const prevOnBeforeCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (prevOnBeforeCompile) prevOnBeforeCompile(shader);

            // Merge our uniforms into the shader
            Object.assign(shader.uniforms, extraUniforms);

            // --- Vertex shader ---
            // Declare varyings
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying vec3 vWorldPositionDN;
${hasNormals ? 'varying vec3 vWorldNormalDN;' : ''}`
            );

            // Compute world position (and normal if available).
            // For materials with #include <worldpos_vertex> we append there.
            // For MeshBasicMaterial etc. we append after #include <project_vertex>.
            const vertexInjection = hasNormals
                ? `vWorldPositionDN = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormalDN = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);`
                : `vWorldPositionDN = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

            if (shader.vertexShader.includes('#include <worldpos_vertex>')) {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    `#include <worldpos_vertex>
${vertexInjection}`
                );
            } else {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    `#include <project_vertex>
${vertexInjection}`
                );
            }

            // --- Fragment shader: apply day/night blend after standard lighting ---
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform vec3 sunDirection;
uniform vec3 earthCenter;
uniform float sunGlobalTotal;
uniform float sunAmbientIntensity;
uniform bool useDayNight;
uniform float terrainShadingStrength;
varying vec3 vWorldPositionDN;
${hasNormals ? 'varying vec3 vWorldNormalDN;' : ''}`
            );

            // Insert our day/night modulation right before the final output.
            // For materials with normals we use local terrain shading;
            // for MeshBasicMaterial we use only the global day/night blend.
            const fragmentInjection = hasNormals
                ? `if (useDayNight) {
    vec3 globalNormal = normalize(vWorldPositionDN - earthCenter);
    vec3 sunNorm = normalize(sunDirection);
    float globalIntensity = max(dot(globalNormal, sunNorm), -0.1);
    float blendFactor = smoothstep(-0.1, 0.1, globalIntensity);
    float localIntensity = dot(vWorldNormalDN, sunNorm);
    float terrainShading = mix(1.0 - terrainShadingStrength, 1.0, localIntensity * 0.5 + 0.5);
    vec3 dayColor = gl_FragColor.rgb * sunGlobalTotal * terrainShading;
    vec3 nightColor = gl_FragColor.rgb * sunAmbientIntensity;
    gl_FragColor.rgb = mix(nightColor, dayColor, blendFactor);
}`
                : `if (useDayNight) {
    vec3 globalNormal = normalize(vWorldPositionDN - earthCenter);
    vec3 sunNorm = normalize(sunDirection);
    float globalIntensity = max(dot(globalNormal, sunNorm), -0.1);
    float blendFactor = smoothstep(-0.1, 0.1, globalIntensity);
    vec3 dayColor = gl_FragColor.rgb * sunGlobalTotal;
    vec3 nightColor = gl_FragColor.rgb * sunAmbientIntensity;
    gl_FragColor.rgb = mix(nightColor, dayColor, blendFactor);
}`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
${fragmentInjection}`
            );
        };

        // Force recompilation
        material.needsUpdate = true;
    }

    dispose(tiles) {
        if (this._onLoadModel) {
            tiles.removeEventListener('load-model', this._onLoadModel);
        }
    }
}

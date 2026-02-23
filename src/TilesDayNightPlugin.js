import {sharedUniforms} from "./js/map33/material/SharedUniforms";
import {wgs84} from "./LLA-ECEF-ENU";
import {Globals} from "./Globals";
import {Vector3} from "three";

// Plugin for 3d-tiles-renderer that patches tile materials via onBeforeCompile
// to apply the same TerrainDayNightMaterial-style lighting as terrain tiles.
// This preserves the original material's texture pipeline (map, vertex colors,
// texture atlases, etc.) while replacing Three.js's standard lighting with the
// custom sun-based day/night system.
export class TilesDayNightPlugin {

    constructor() {
        this._onLoadModel = null;
        this._tiles = null;
    }

    init(tiles) {
        this._tiles = tiles;
        this._onLoadModel = ({scene}) => {
            scene.traverse(child => {
                if (child.isMesh && child.material) {
                    this._patchMaterial(child.material);
                }
            });
        };

        tiles.addEventListener('load-model', this._onLoadModel);

        // Patch any already-loaded tiles
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

        const extraUniforms = {
            sunDirection: {value: Globals.sunLight.position},
            earthCenter: {value: new Vector3(0, -wgs84.RADIUS, 0)},
            sunGlobalTotal: sharedUniforms.sunGlobalTotal,
            sunAmbientIntensity: sharedUniforms.sunAmbientIntensity,
            useDayNight: sharedUniforms.useDayNight,
            terrainShadingStrength: {value: 0.5},
            brightnessBoost: {value: 1.5},
        };

        const prevOnBeforeCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (prevOnBeforeCompile) prevOnBeforeCompile(shader);

            Object.assign(shader.uniforms, extraUniforms);

            // --- Vertex shader: pass world position (and normal if available) ---
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying vec3 vWorldPositionDN;
${hasNormals ? 'varying vec3 vWorldNormalDN;' : ''}`
            );

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

            // --- Fragment shader ---
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform vec3 sunDirection;
uniform vec3 earthCenter;
uniform float sunGlobalTotal;
uniform float sunAmbientIntensity;
uniform bool useDayNight;
uniform float terrainShadingStrength;
uniform float brightnessBoost;
varying vec3 vWorldPositionDN;
${hasNormals ? 'varying vec3 vWorldNormalDN;' : ''}`
            );

            // Replace Three.js lighting with terrain-style day/night lighting.
            // We inject after dithering so gl_FragColor has the fully-lit PBR result.
            // We treat gl_FragColor.rgb as the "texture color" (it already includes
            // the diffuse texture, vertex colors, etc. from the PBR pipeline) and
            // replace Three.js's lighting contribution with our own sun model.
            const fragmentInjection = hasNormals
                ? `if (useDayNight) {
    vec3 globalNormal = normalize(vWorldPositionDN - earthCenter);
    vec3 sunNorm = normalize(sunDirection);
    float globalIntensity = max(dot(globalNormal, sunNorm), -0.1);
    float blendFactor = smoothstep(-0.1, 0.1, globalIntensity);
    float localIntensity = dot(vWorldNormalDN, sunNorm);
    float terrainShading = mix(1.0 - terrainShadingStrength, 1.0, localIntensity * 0.5 + 0.5);
    vec3 dayColor = gl_FragColor.rgb * sunGlobalTotal * brightnessBoost * terrainShading;
    vec3 nightColor = gl_FragColor.rgb * sunAmbientIntensity;
    gl_FragColor.rgb = mix(nightColor, dayColor, blendFactor);
}`
                : `if (useDayNight) {
    vec3 globalNormal = normalize(vWorldPositionDN - earthCenter);
    vec3 sunNorm = normalize(sunDirection);
    float globalIntensity = max(dot(globalNormal, sunNorm), -0.1);
    float blendFactor = smoothstep(-0.1, 0.1, globalIntensity);
    vec3 dayColor = gl_FragColor.rgb * sunGlobalTotal * brightnessBoost;
    vec3 nightColor = gl_FragColor.rgb * sunAmbientIntensity;
    gl_FragColor.rgb = mix(nightColor, dayColor, blendFactor);
}`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
${fragmentInjection}`
            );
        };

        material.needsUpdate = true;
    }

    dispose() {
        if (this._onLoadModel && this._tiles) {
            this._tiles.removeEventListener('load-model', this._onLoadModel);
        }
        this._tiles = null;
    }
}

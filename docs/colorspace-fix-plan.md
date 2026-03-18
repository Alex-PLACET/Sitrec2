# Color Space Fix Plan

## Problem

The render pipeline had "accidental correctness" — no color management applied anywhere, so sRGB textures passed through untouched from source to screen. GLB textures broke because GLTFLoader properly tags them `SRGBColorSpace` (GPU linearizes), but the copy-to-screen shader never re-encoded to sRGB.

### What sRGB linearization means

sRGB values are perceptual — `0.5` (hex `#808080`) looks like "middle gray" but represents only ~21.6% of maximum light intensity. Monitors apply a gamma curve, giving more perceptual resolution in darks where eyes are sensitive.

When Three.js linearizes a texture (`colorSpace = SRGBColorSpace`), it converts from perceptual values to physical light intensity: sRGB `0.5` → linear `0.216`. All lighting math then happens on physical values (doubling light = doubling the number). At the end, the copy shader encodes linear `0.216` back to sRGB `0.5` for display.

### Key GLSL functions

- **`sRGBTransferEOTF(vec4)`** — Electro-Optical Transfer Function: sRGB → linear ("decode" stored values to physical light)
- **`sRGBTransferOETF(vec4)`** — Opto-Electronic Transfer Function: linear → sRGB ("encode" physical light to stored values)
- **`linearToOutputTexel(vec4)`** — same as OETF but respects renderer's output color space setting

## Architecture: `ColorManagement.enabled = false`

Three.js `ColorManagement` is **disabled** (`index.js`). This means:
- `new Color(0xFF0000)` stores raw sRGB values (NOT linearized)
- Standard material uniforms (color, emissive, etc.) are uploaded as raw sRGB
- Standard materials do lighting math in sRGB space (technically incorrect but historically tuned)
- `Color.convertSRGBToLinear()` still works (not gated by the flag)
- `ColorManagement.convert()` is a no-op when disabled

Enabling `ColorManagement` globally was attempted but caused widespread breakage because every `new Color()` call in the codebase (including third-party code) would be affected. The current approach handles linearization surgically per-material/shader.

## Current State (All phases complete)

### Phase 1 (Done): Renderer and render target fixes
- Fixed `renderer.colorSpace` → `renderer.outputColorSpace` (property name was wrong)
- Fixed render target `colorSpace` from `SRGBColorSpace` → `LinearSRGBColorSpace` (correctly labels what RTs contain)
- Added debug toggle: "sRGB Output Encoding" in Render Debug menu (default ON)

### Phase 2 (Done): Copy shader output encoding
- Copy shader (`CNodeView3D.js`) applies `linearToOutputTexel()` conditioned on the debug toggle
- Controlled by `Globals.renderDebugFlags.dbg_sRGBOutputEncoding` (default `true`)

### Phase 3 (Done): Custom ShaderMaterial fixes — sRGBTransferEOTF round-trip

Custom shaders that do lighting math in sRGB space add `sRGBTransferEOTF()` at the fragment output. This linearizes their sRGB output for the RT. The copy shader's sRGB encoding undoes it (round trip), preserving the original appearance.

| Shader | File | Fix |
|--------|------|-----|
| Terrain | `TerrainDayNightMaterial.js` | `sRGBTransferEOTF(finalColor)` at output |
| Globe | `Globe.js` | `sRGBTransferEOTF(gl_FragColor)` at output |
| Sky brightness | `CNodeView3D.js` | `sRGBTransferEOTF(vec4(color, opacity))` at output |
| Synth clouds | `CNodeSynthClouds.js` | `sRGBTransferEOTF(gl_FragColor)` at output |
| Gaussian splats | `ModelLoader.js` | `sRGBTransferEOTF` on `vColor` before output |
| PLY point clouds | `ModelLoader.js` | `sRGBTransferEOTF` on `vColor` before output |
| Moon | `CPlanets.js` | Moon texture tagged SRGBColorSpace (true linear workflow); `skyColor` linearized via `sRGBTransferEOTF` before blending |

### Phase 4 (Done): Standard material fixes — `patchMaterialForLinearOutput`

Standard materials (MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial) operate in sRGB space when `ColorManagement` is disabled. `patchMaterialForLinearOutput()` (`threeExt.js`) uses `onBeforeCompile` to inject `sRGBTransferEOTF()` after `#include <dithering_fragment>`, linearizing the sRGB output for the RT.

Applied to:
- **CNode3DObject.js** — all non-ShaderMaterial materials (basic, lambert, phong, physical, envMap, checkerboard, f35atlas)
- **CNodeDisplayTrack.js** — track wall `MeshPhongMaterial`
- **CNodeSynthBuilding.js** — all building material types
- **Clouds.js** — Gimbal cloud `MeshStandardMaterial`

**Note:** Textures on these materials must NOT be tagged `SRGBColorSpace` (the GPU would linearize them, changing the sRGB-space lighting result). Cloud and terrain textures have tags removed.

### Phase 5 (Done): LineMaterial (ShaderMaterial addon) fixes

`LineMaterial` is a ShaderMaterial — Three.js does not apply color management to its uniforms. Colors are pre-linearized in `makeMatLine()` (`MatLines.js`) via `Color.convertSRGBToLinear()` before passing to the material.

### Phase 6 (Done): Effect shader fixes

Effect shaders operate in the RT chain (RT→effect→RT→...→copy shader). They were designed for sRGB-space input. Each color-transforming effect now converts linear input to sRGB, processes, and converts output back to linear:
- **Input:** `sRGBTransferOETF(texture2D(tDiffuse, vUv))` — linear RT → sRGB
- **Effect math in sRGB** (as originally designed)
- **Output:** `sRGBTransferEOTF(gl_FragColor)` — sRGB → linear for RT

Between chained effects, the conversions cancel (EOTF at end + OETF at start = round trip).

| Shader | Fix type |
|--------|----------|
| FLIRShader | Input OETF + output EOTF |
| LevelsShader | Input OETF + output EOTF |
| GreyscaleShader | Input OETF + output EOTF |
| NVGShader | Output EOTF |
| InvertShader | Input OETF + output EOTF |
| CompressShader | Input OETF + output EOTF |
| StaticNoiseShader | Input OETF + output EOTF |
| ZoomShader | No fix needed (passthrough) |
| Pixelate2x2Shader | No fix needed (passthrough) |
| JPEGArtifactsShader | No fix needed (passthrough) |
| CopyShader | No fix needed (passthrough) |

### Phase 7 (Done): Other fixes

- **3D Tiles (Google Photorealistic):** `DEFAULT_GOOGLE_TILE_OUTPUT_GAMMA` changed from `0.50` to `1.0` in `TilesDayNightPlugin.js`. The old value was a manual gamma workaround; no longer needed with proper output encoding.
- **Moon day/night blending:** `CPlanets.js` moon shader uses `linearSky * skyOpacity` to match the sky background during transition, preventing visible dark disc. Moon attenuation (`moonAtten`) simulates shorter exposure in daylight.
- **Ground overlay:** `CNodeGroundOverlay.js` texture tagged `SRGBColorSpace` — passthrough shader outputs linear, copy shader encodes. Correct round-trip.
- **Video textures:** `CNodeDisplayCameraFrustum.js` textures tagged `SRGBColorSpace`.
- **Background clear color:** NOT linearized (sits outside material pipeline; needs further investigation for full correctness). Slight brightness shift accepted.

## How it works now

All render target content is in linear color space:

```
┌─────────────────────────────────────────────────────────────────┐
│ STANDARD MATERIALS (with ColorManagement disabled)              │
│ raw sRGB color → sRGB-space lighting → patchMaterialForLinear  │
│ → sRGBTransferEOTF → linear output to RT                      │
├─────────────────────────────────────────────────────────────────┤
│ CUSTOM SHADERS (terrain, globe, sky, splats, synth clouds)     │
│ untagged texture (raw sRGB) → sRGB-space lighting              │
│ → sRGBTransferEOTF → linear output to RT                      │
├─────────────────────────────────────────────────────────────────┤
│ GLB MODELS (MeshStandardMaterial via GLTFLoader)               │
│ SRGBColorSpace texture → GPU linearizes → PBR in linear        │
│ → linear output to RT (correct by design)                      │
├─────────────────────────────────────────────────────────────────┤
│ PASSTHROUGH SHADERS (ground overlay)                           │
│ SRGBColorSpace texture → GPU linearizes → passthrough          │
│ → linear output to RT                                          │
├─────────────────────────────────────────────────────────────────┤
│ EFFECT SHADERS (FLIR, Levels, etc.)                            │
│ linear RT → OETF (to sRGB) → effect math → EOTF (to linear)  │
│ → linear output to RT                                          │
├─────────────────────────────────────────────────────────────────┤
│ LINE MATERIALS (LOS, tracks)                                   │
│ pre-linearized color (convertSRGBToLinear in makeMatLine)      │
│ → linear output to RT                                          │
├─────────────────────────────────────────────────────────────────┤
│ COPY SHADER (final blit to screen)                             │
│ linear RT → linearToOutputTexel (sRGB encode) → display        │
└─────────────────────────────────────────────────────────────────┘
```

## Known limitations

### Alpha blending brightness shift
Alpha blending now happens in linear space (GPU blends after `sRGBTransferEOTF`). This produces slightly brighter results than the old sRGB-space blending due to Jensen's inequality on the concave sRGB encoding curve. Affects semi-transparent objects (track walls, line anti-aliasing). This is the physically correct behavior.

### Background clear color
`setClearColor` writes raw sRGB values to the RT. Linearizing the color before clearing produced unexpected results ("much darker"). Currently NOT linearized — the copy shader encoding makes it slightly brighter than the original. Needs further investigation.

### `ColorManagement.enabled = false`
The codebase relies on `ColorManagement` being disabled. Enabling it would be the proper long-term fix but requires auditing every `new Color()` call including third-party libraries.

## Remaining Future Work

### True linear workflow
Convert terrain/globe/sky shaders from the round-trip hack (sRGB math + EOTF) to genuine linear-space lighting:
1. Tag their textures with `SRGBColorSpace`
2. Remove `sRGBTransferEOTF()` from shader output
3. Re-tune lighting parameters for linear-space values
4. Enable `ColorManagement` globally
5. Remove all `patchMaterialForLinearOutput` calls

### Effect shader accuracy
The sRGB round-trip in effects introduces two `pow()` operations per effect. For maximum quality, effects could be redesigned to operate in linear space natively.

## Key Technical Details

- Three.js always uses `LinearSRGBColorSpace` when rendering to render targets (no output encoding applied by standard materials)
- ShaderMaterial does NOT auto-apply `linearToOutputTexel()` — the function is defined in the prefix but must be called manually
- Textures with `colorSpace = SRGBColorSpace` get GPU-level sRGB→linear decode on sampling via `GL_SRGB8_ALPHA8` internal format
- `patchMaterialForLinearOutput()` injects `gl_FragColor = sRGBTransferEOTF(gl_FragColor)` after `#include <dithering_fragment>` via `onBeforeCompile`
- `LineMaterial` color uniforms are NOT managed by Three.js ColorManagement — must be pre-linearized
- `setClearColor` internally calls `color.getRGB(target, getUnlitUniformColorSpace(renderer))` which is a no-op when ColorManagement is disabled

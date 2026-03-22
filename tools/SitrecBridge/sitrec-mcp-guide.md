# Sitrec MCP Agent Guide

Reference for AI agents interacting with Sitrec via the SitrecBridge MCP server.

## Architecture Overview

Sitrec is a 3D situation recreation app built with Three.js. It uses a **node-based computational graph** where everything — tracks, cameras, effects, UI — is a node.

**Message path:** MCP Client (stdio) -> MCP Server (WebSocket :9780) -> Chrome Extension (background.js) -> Content Script -> Page Bridge (page-bridge.js, main world) -> Sitrec globals.

## Key Globals (accessible via `sitrec_eval`)

| Global | Type | Description |
|--------|------|-------------|
| `NodeMan` | CNodeManager | All nodes. `get(id)`, `iterate((id, node) => {})` |
| `Sit` | CSituation | Current sitch config: `name`, `frames`, `fps`, `lat`, `lon`, `startTime` |
| `par` | object | Runtime state: `frame`, `paused`, `renderOne`, `speed` |
| `Globals` | object | Managers: `SitchMan`, `ViewMan`, `GPUMemoryMonitor` |
| `ViewMan` | CViewManager | View layout. `setVisibleByName(name, vis)`, `updateViewFromPreset()` |
| `LocalFrame` | object | ENU coordinate origin for the current sitch |
| `GlobalScene` | THREE.Scene | Main 3D scene |
| `sitrecAPI` | CSitrecAPI | Chatbot API. `call(fn, args)`, `handleAPICall({fn, args})` |
| `guiMenus` | object | All lil-gui menu folders, keyed by menu ID |

## Node System

### CNode Base

Every node has:
- `id` — unique string identifier
- `inputs` — dict of named input nodes
- `outputs` — array of output nodes
- `visible` — node-level visibility (NOT Three.js visibility)
- `getValue(frame)` — compute value at frame
- `simpleSerials` — array of property names for serialization

### Common Node Types (172 total)

**Data:** `CNodeConstant`, `CNodeArray`, `CNodeMISBDataTrack`, `CNodeDateTime`
**Tracks:** `CNodeSmoothedPositionTrack`, `CNodeJetTrack`, `CNodeSatelliteTrack`, `CNodeTrackFromMISB`
**Display:** `CNodeDisplayTrack`, `CNodeDisplayLOS`, `CNodeDisplayCameraFrustum`, `CNodeDisplayNightSky`
**Views:** `CNodeView3D`, `CNodeVideoWebCodecView`, `CNodeMirrorVideoView`, `CNodeViewDAG`, `CNodeViewChat`
**GUI:** `CNodeGUIValue`, `CNodeGUIFlag`, `CNodeGUIColor`, `CNodeTrackGUI`
**Controllers:** `CNodeControllerTrackPosition`, `CNodeControllerObjectTilt`, `CNodeControllerPTZUI`
**LOS:** `CNodeLOSFromCamera`, `CNodeLOSTraverse`, `CNodeLOSTraverseStraightLine`, `CNodeLOSTraverseWind`
**3D:** `CNode3DObject`, `CNode3DGroup`, `CNodeCamera`, `CNodeTerrain`
**Math:** `CNodeMunge`, `CNodeScale`, `CNodeMath`, `CNodeDerivative`
**Switches:** `CNodeSwitch` — selects between inputs by `choice` property

### Track Data Structure

Each imported aircraft creates ~6+ nodes:
- `TrackData_<ID>` (CNodeMISBDataTrack) — raw MISB data, `.misb` is array of rows
- `Track_<ID>_unsmoothed` (CNodeTrackFromMISB) — position track from MISB
- `Track_<ID>` (CNodeSmoothedPositionTrack) — smoothed track
- `<ID>_ob` (CNode3DObject) — 3D object at track position
- `<ID>_ob_ControllerTrackPosition` — moves object along track
- `Track_<ID>_GUI` (CNodeTrackGUI) — GUI controls

### CNodeTrackGUI

The GUI node for each track. Key properties:
- `metaTrack` — the CMetaTrack wrapper
- `metaTrack.guiFolder` — lil-gui folder with controllers

**Important controllers in `guiFolder.controllers`:**
- `visible` — show/hide track (the correct way to toggle visibility)
- `gotoTrack` — move mainCamera to track position
- `showTrackInLook` — show in look view
- `extendToGround` — draw line to ground
- `lineColor`, `polyColor` — track colors
- `contrail`, `contrailDuration`, `contrailWidth` — contrail settings

**To hide a track properly:**
```js
const gui = NodeMan.get("Track_<ID>_GUI");
gui.metaTrack.guiFolder.controllers.find(c => c.property === 'visible').setValue(false);
```
Setting `node.visible = false` or `container.visible = false` does NOT work — you must use the lil-gui controller's `setValue()` to trigger the full visibility chain (layer masks, display nodes, etc.).

### MISB Data Format

`CNodeMISBDataTrack.misb` is an array of rows (arrays). Key column indices:
- `[2]` — timestamp (ms since epoch)
- `[13]` — latitude (degrees)
- `[14]` — longitude (degrees)
- `[15]` — altitude

### Track getValue() Return Format

`CNodeSmoothedPositionTrack.getValue(frame)` returns:
```js
{
  position: Vector3,   // ENU coordinates (local frame)
  lla: [lat, lon, alt], // Note: may be in internal scaled units, not degrees
  misbRow: Array       // Raw MISB row (indices 13/14 = lat/lon in degrees)
}
```

### CNodeSwitch

Used for selecting between inputs. Key property: `choice` (string matching an input key).
Example: `zoomToTrack` node — set `choice` to a track name to make mainCamera follow it.

## Layer System

Visibility in 3D views is controlled by layer bit masks, not `node.visible`.

| Layer | Bit | Purpose |
|-------|-----|---------|
| WORLD | 0 | All normal 3D objects |
| LEFTEYE | 1 | VR left eye |
| RIGHTEYE | 2 | VR right eye |
| MAIN | 3 | Main camera only |
| LOOK | 4 | Look camera only |
| HELPERS | 5 | Debug lines (main view) |
| TARGET | 6 | Target objects |

**Composite masks:** `MASK_MAINRENDER = WORLD|MAIN|TARGET|HELPERS`, `MASK_LOOKRENDER = WORLD|LOOK|TARGET`

## Sitrec API (sitrecAPI)

64 functions accessible via `window.sitrecAPI.call(fn, args)`. Type coercion is automatic (strings -> numbers).

### Camera & Navigation
- `gotoLLA({lat, lon, alt})` — move camera position
- `setCameraAltitude({alt})` — altitude only
- `getCameraLLA()` — returns {lat, lon, alt}
- `pointCameraAtRaDec({ra, dec})` — point at sky coordinates
- `pointCameraAtNamedObject({object})` — point at planet/Moon/Sun

### Playback
- `getFrame()`, `setFrame({frame})`, `play()`, `pause()`, `togglePlayPause()`
- `getCurrentSimTime()`, `getRealTime()`, `setDateTime({dateTime})`

### Satellites
- `satellitesLoadLEO()`, `satellitesLoadCurrentStarlink()`
- `satellitesShow/HideStarlink()`, `Show/HideISS()`, `Show/HideBrightest()`, `Show/HideOther()`
- `satelliteLabelsOn/Off()`, `satelliteLookViewNamesOn/Off/Toggle()`
- `findSatellite({name})`, `listCelestialObjects()`
- `satellitesFlareRegionOn/Off()`

### 3D Objects
- `addObjectAtLLA({lat, lon, alt, name})`
- `listObjectFolders()`, `listAvailableModels()`, `listAvailableGeometries()`
- `setObjectModel({object, model})`, `setAllObjectsModel({model})`
- `setObjectGeometry({object, geometry})`, `setAllObjectsGeometry({geometry})`
- `setObjectDimensions({object, width, height, depth})`

### Menu Controls
- `listMenus()`, `listMenuControls({menu})`
- `setMenuValue({menu, path, value})`, `getMenuValue({menu, path})`
- `executeMenuButton({menu, path})`

Path can be nested with `/` separator. Matching is flexible (case-insensitive, substring).

### Views & Layout
- `listViews()`, `showView({view})`, `hideView({view})`
- `setViewPosition({view, left, top, width, height, visible})`
- `setLayout({template, views})` — templates: columns, rows, leftWide, rightWide, grid, single
- `hideMenu()`, `showMenu()`, `hideTimeline()`, `showTimeline()`
- `hideChrome()`, `showChrome()`, `toggleFullscreen()`

### Debug
- `debug({show})` — toggle debug mode

## View System

Common views: `mainView`, `lookView`, `video`, `mirrorVideo`, `chatView`, `debugView`, `dagView`, `notesView`

Views are positioned using fractional coordinates (0-1) for `left`, `top`, `width`, `height`.

**CNodeView3D** has:
- `renderer` — Three.js WebGLRenderer
- `camera` — PerspectiveCamera (the view's own camera, e.g., CNodeCamera)
- `renderSky()`, `renderCanvas()`, `renderTargetAndEffects()` — render pipeline

**Screenshot capture:** Must call render pipeline then `toDataURL()` synchronously (preserveDrawingBuffer is false).

## Camera System

Two main cameras:
- **`mainCamera`** (CNodeCamera) — orbital camera for the 3D globe/overview. `goToPoint(vec3)` to move.
- **`lookCamera`** (CNodeCamera) — the analysis camera. Controlled by `CameraLOSController` switch.

`fixedCameraPosition` (CNodePositionLLA) — the observer's geographic position. `gotoLLA()` changes this.

`zoomToTrack` (CNodeSwitch) — set `choice` to a track name to attach mainCamera to that track.

## MetaTrack (CMetaTrack)

Wrapper managing a complete track lifecycle:
- `trackNode` — position track
- `trackDataNode` — raw data
- `trackDisplayNode` / `trackDisplayDataNode` — renderers
- `displayTargetSphere` / `displayCenterSphere`
- `guiFolder` — lil-gui GUI folder (has `visible`, `gotoTrack`, etc.)
- `show(visible)` — toggle center/sphere display (NOT the track lines)
- `dispose()` — clean up all nodes

## par Object (Runtime State)

Key properties:
- `frame` (getter/setter) — current frame number
- `paused` — playback state
- `renderOne` — set `true` to force single frame render
- `speed` — playback speed multiplier
- `direction` — 1 or -1
- `showVideo`, `showGraphs`, `showJet` — visibility toggles
- `mainFOV` — main camera field of view
- `az`, `el` — azimuth/elevation angles
- `TAS` — true airspeed

## Sit Object (Situation Config)

- `name`, `menuName`, `isCustom`, `canMod`
- `frames`, `fps`, `startTime`
- `lat`, `lon`, `alt` — sitch center coordinates
- `mainFOV`, `lookFOV`, `nearClip`, `farClipLook`
- `startDistance`, `targetSpeed`
- `files` / `files2` — asset files
- `units` — "Nautical", "Metric", etc.
- `lighting` — `{ambientIntensity, sunIntensity, sunScattering, ambientOnly}`
- `nightSky`, `starScale`, `satScale`

## Common Patterns

### Iterating all nodes of a type
```js
NodeMan.iterate((id, node) => {
    if (node.constructor.name === 'CNodeMISBDataTrack') { ... }
});
```

### Getting a node value
```js
const track = NodeMan.get("Track_N117AN");
const val = track.getValue(par.frame); // {position: Vector3, lla, misbRow}
```

### Controlling a lil-gui controller
```js
const folder = NodeMan.get("Track_XXX_GUI").metaTrack.guiFolder;
const ctrl = folder.controllers.find(c => c.property === 'visible');
ctrl.setValue(false); // triggers onChange callbacks
```

### Haversine distance (for finding nearest tracks)
```js
function distKm(lat1, lon1, lat2, lon2) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```
Use `node.misb[row][13]` / `[14]` for lat/lon in degrees (not `getValue().lla` which may be scaled).

### Importing local files into Sitrec

Browser security prevents programmatic file picker dialogs (the `<input type="file">.click()` call is blocked without a real user gesture). To import a local file (KML, CSV, video, etc.) into Sitrec from the MCP:

1. **Spin up a one-shot Node.js HTTP server** on port 9781 that serves the file once then exits:
```bash
node -e "
const http = require('http');
const fs = require('fs');
const data = fs.readFileSync('/path/to/file.kml');
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/xml');
  res.end(data);
  server.close();
});
server.listen(9781, () => console.log('ready'));
"
```

2. **Fetch and parse in Sitrec** via `sitrec_eval`:
```js
(window._importResult = 'fetching',
 fetch('http://localhost:9781/file.kml')
   .then(r => r.arrayBuffer())
   .then(buf => FileManager.parseResult('file.kml', buf, null, {returnMeta: true}))
   .then(r => window._importResult = 'done')
   .catch(e => window._importResult = 'error: ' + e.message),
 'started')
```

3. **Check the result** with a follow-up eval: `window._importResult`

This works because `FileManager.parseResult()` is the same pipeline used by drag-and-drop. The one-shot server avoids browser CORS issues and closes itself after serving the file once.

### Reloading the Sitrec tab
To reload the page without triggering the browser's "Leave Site?" confirmation dialog, set `Globals.allowUnload = true` before calling `location.reload()`:
```js
(Globals.allowUnload = true, location.reload(), 'reloading')
```
Setting `window.onbeforeunload = null` does **not** work — the handler is registered via `addEventListener`, not as a property. `Globals.allowUnload` is the app's own escape hatch that causes the handler to return early.

### Generated track duration and start time
When generating track data (KML, CSV, etc.) for import into Sitrec, default to the sitch's existing duration and start time unless the user specifies otherwise:
- **Duration:** `Sit.frames / Sit.fps` (e.g., 900 / 30 = 30 seconds)
- **Start time:** `Sit.startTime`

Tracks are built at import time using the sitch's current frame count. Changing `Sit.frames` afterward does **not** rebuild existing tracks. If you need a longer sitch, set the frame count *before* importing any tracks.

## Debugging with MCP

MCP allows fully automated diagnosis and fix verification without manual browser interaction. Follow this cycle:

### 1. Query runtime state
Use `sitrec_eval` to inspect the live state of nodes, properties, scales, positions, etc:
```js
// Check a property
NodeMan.get("someNode").someProperty

// Inspect computed values
(function() {
    var view = NodeMan.get("mainView");
    return { heightPx: view.heightPx, fov: view.camera.fov };
})()
```

### 2. Test a hypothesis
Call methods directly to see if they fix the problem:
```js
// e.g. manually scale handles to see if the scaling code works
(function() {
    var se = NodeMan.get("lanternSplineEditor").splineEditor;
    var view = NodeMan.get("mainView");
    se.updateCubeScales(view);
    return "scaled";
})()
```

### 3. Take a screenshot to verify
Use `sitrec_screenshot` to capture the current state visually. Compare before/after to confirm the fix.

### 4. Build → Reload → Verify
Once you've identified the code fix:
```bash
npm run build          # Build the updated code
```
Then reload via eval:
```js
(Globals.allowUnload = true, location.reload(), 'reloading')
```
Wait for the page to load (check with `Sit.name`), re-enable the feature under test, and screenshot again to confirm.

### 5. Run tests
```bash
npm test               # Ensure nothing is broken
```

### Tips
- **Check all code paths.** A feature may have multiple enable paths (e.g., `Globals.editingTrack` vs. a sitch-specific GUI checkbox). A fix that only covers one path will miss the others.
- **Use `par.renderOne = true`** after making changes via eval to force a render frame, so screenshots capture the updated state.
- **Iterate fast.** The full cycle (eval diagnosis → code fix → build → reload → verify) can be done in under a minute without any manual browser interaction.

### safeSerialize gotcha
The page-bridge `safeSerialize` detects objects with `.lat`/`.lon` properties and converts them to `{_type:"LLA"}`, stripping other fields. To avoid this, return strings or use field names that don't include `lat`/`lon`.

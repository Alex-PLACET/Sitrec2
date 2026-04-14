/**
 * SitGimbalCustom — a custom-sitch-compatible recreation of the Gimbal scenario.
 *
 * This sitch uses the `gimbalSetup` property instead of an imperative `setup()` function,
 * proving that all Gimbal functionality is available to user-created custom sitches.
 *
 * The declarative node definitions (jetLat, jetLon, jetAltitude, jetOrigin, terrain, cameras,
 * views, files, etc.) are exactly what a custom sitch would specify.  The `gimbalSetup`
 * object triggers the full Gimbal analysis pipeline via GimbalCustomSetup.js.
 */

export const SitGimbalCustom = {
    name: "gimbalcustom",
    menuName: "Gimbal (Custom)",
    isTextable: false,
    isCustom: true,

    fps: 29.97,
    frames: 1031,
    aFrame: 0,
    bFrame: 1030,

    jetStuff: true,
    azSlider: {defer: true},

    lat: 28.5,
    lon: -79.5,

    jetLat:      {kind: "Constant", value: 28.5},
    jetLon:      {kind: "Constant", value: -79.5},
    jetAltitude: {kind: "inputFeet", value: 25000, desc: "Altitude", start: 24500, end: 25500, step: 1},

    jetOrigin: {kind: "TrackFromLLA", lat: "jetLat", lon: "jetLon", alt: "jetAltitude"},

    TerrainModel: {kind: "Terrain", lat: 34, lon: -118.3, zoom: 7, nTiles: 3, fullUI: true, dynamic: true},

    files: {
        FA18Model:       'models/FA-18F.glb',
        GimbalCSV:       'gimbal/GimbalData.csv',
        GimbalCSV2:      'gimbal/GimbalRotKeyframes.csv',
        GimbalCSV_Pip:   'gimbal/GimbalPIPKeyframes.csv',
        TargetObjectFile:'models/FA-18F.glb',
        ATFLIRModel:     'models/ATFLIR.glb',
    },

    mainCamera: {
        startCameraPositionLLA: [28.470586, -79.100902, 26132.346324],
        startCameraTargetLLA:   [28.470824, -79.110720, 25870.046771],
    },
    mainView: {left: 0.00, top: 0, width: 1, height: 1, fov: 10, background: '#000000'},

    videoFile: "../sitrec-videos/public/2 - Gimbal-WMV2PRORES-CROP-428x428.mp4",
    videoView: {left: 0.8250, top: 0.6666, width: -1, height: 0.3333, background: [1, 0, 0, 0]},

    lookCamera: {fov: 0.35},
    lookView: {
        left: 0.6656, top: 1 - 0.3333, width: -1, height: 0.333,
        draggable: true, resizable: true, shiftDrag: true, freeAspect: false, noOrbitControls: true,
    },
    syncVideoZoom: true,

    mirrorVideo: {transparency: 0.15, autoClear: true, autoFill: false},

    focusTracks: {
        "Default": "default",
        "Jet track": "jetTrack",
        "Traverse Path (UFO)": "LOSTraverseSelect",
    },

    lighting: {
        kind: "Lighting",
        ambientIntensity: 0.35,
        IRAmbientIntensity: 1.0,
        sunIntensity: 0.7,
        sunScattering: 0.6,
        ambientOnly: false,
    },

    include_JetLabels: true,
    include_Compasses: true,

    sprites: {
        kind: "FlowOrbs", nSprites: 1000, wind: "targetWind",
        colorMethod: "Hue From Altitude",
        hueAltitudeMax: 1400,
        camera: "lookCamera", visible: false,
        defer: true,
    },

    // ────────────────────────────────────────────
    // This is the key property: it triggers the full Gimbal analysis pipeline
    // without needing an imperative setup() function.
    // ────────────────────────────────────────────
    gimbalSetup: {
        showGlare: true,
        showATFLIR: true,

        cloudWindFrom: 240,
        cloudWindKnots: 17,
        targetWindFrom: 274,
        targetWindKnots: 65,
        localWindFrom: 270,
        localWindKnots: 120,

        startDistance: 32,
        targetSpeed: 340,
        defaultTraverse: "Const Air Spd",

        // Fleet formation parameters
        fleetTurnStart: 0,
        fleetTurnRate: 8,
        fleetAcceleration: 2,
        fleetSpacing: 0.7,
        fleetX: 20,
        fleetY: -5.27,
    },
};

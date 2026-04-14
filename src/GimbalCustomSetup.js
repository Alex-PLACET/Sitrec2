/**
 * GimbalCustomSetup.js — enables the full Gimbal analysis pipeline for custom sitches.
 *
 * When a sitch definition includes a `gimbalSetup` property, this module replicates
 * everything that SitGimbal's setup() does: CSV data processing, az/el/bank/glare
 * switches, jet track, winds, SA page, fleet objects, traverse nodes, graphs, and
 * air track.  The original SitGimbal is NOT touched — it keeps its own setup() path.
 *
 * Usage in a custom sitch definition:
 *   gimbalSetup: {
 *       showGlare: true,
 *       cloudWindFrom: 240, cloudWindKnots: 17,
 *       targetWindFrom: 274, targetWindKnots: 65,
 *       localWindFrom: 270, localWindKnots: 120,
 *       defaultTraverse: "Const Air Spd",
 *       // fleet parameters (optional)
 *       fleetTurnStart: 0, fleetTurnRate: 8, fleetAcceleration: 2,
 *       fleetSpacing: 0.7, fleetX: 20, fleetY: -5.27,
 *   }
 */

import {Color} from "three";
import {FileManager, gui, guiJetTweaks, guiTweaks, NodeMan, Sit} from "./Globals";
import {arrayColumn, ExpandKeyframes, scaleF2M} from "./utils";
import {RollingAverage} from "./smoothing";
import {par} from "./par";
import {SetupJetGUI} from "./JetGUI";
import {
    curveChanged,
    SetupCommon,
    SetupTrackLOSNodes,
    SetupTraverseNodes,
} from "./JetStuff";
import {SetupGimbal} from "./sitch/SitGimbal";
import {setupOpts} from "./JetChart";
import {SetupCloudNodes} from "./Clouds";
import {CNodeTrackAir} from "./nodes/CNodeTrackAir";
import {CNodeGUIValue} from "./nodes/CNodeGUIValue";
import {CNodeFleeter} from "./nodes/CNodeFleeter";
import {CNodeMunge, CNodeGForce} from "./nodes/CNodeMunge";
import {CNodeDisplayTrack} from "./nodes/CNodeDisplayTrack";
import {CNodeGraphSeries} from "./nodes/CNodeGraphSeries";
import {CNodeTraverseAngularSpeed} from "./nodes/CNodeTraverseAngularSpeed";
import {CNodeScale} from "./nodes/CNodeScale";
import {CNodeDisplayTargetSphere} from "./nodes/CNodeDisplayTargetSphere";
import {CNode3DObject, ModelFiles} from "./nodes/CNode3DObject";
import {AddGenericNodeGraph} from "./JetGraphs";
import {ViewMan} from "./CViewManager";
import * as LAYER from "./LayerMasks";


/**
 * Process Gimbal CSV data files and attach results to Sit.
 * This extracts the data loading logic that was in SitGimbal.setup().
 */
export function processGimbalCSVData() {
    Sit.CSV = FileManager.get("GimbalCSV");

    Sit.CSV2 = FileManager.get("GimbalCSV2");
    Sit.CSV2 = ExpandKeyframes(Sit.CSV2, Sit.frames);

    if (FileManager.exists("GimbalCSV_Pip")) {
        Sit.CSV_Pip = FileManager.get("GimbalCSV_Pip");
        Sit.CSV_Pip = ExpandKeyframes(Sit.CSV_Pip, Sit.frames, 0, 7);
        Sit.CSV_Pip = RollingAverage(Sit.CSV_Pip, 10);
    }

    Sit.glareAngleOriginal = arrayColumn(Sit.CSV, 1);
    Sit.glareAngleSmooth = RollingAverage(Sit.glareAngleOriginal, 6);
}


/**
 * Create fleet objects and their display tracks.
 * @param {object} config — gimbalSetup configuration
 */
function setupFleet(config) {
    new CNodeGUIValue({id: "fleetTurnStart", value: config.fleetTurnStart ?? 0, start: 0, end: 35, step: 0.1, desc: "Fleet Turn Start"}, guiTweaks);
    new CNodeGUIValue({id: "fleetTurnRate", value: config.fleetTurnRate ?? 8, start: 0, end: 50, step: 0.1, desc: "Fleet Turn Rate"}, guiTweaks);
    new CNodeGUIValue({id: "fleetAcceleration", value: config.fleetAcceleration ?? 2, start: 1, end: 50, step: 0.1, desc: "Fleet Acceleration"}, guiTweaks);
    new CNodeGUIValue({id: "fleetSpacing", value: config.fleetSpacing ?? 0.7, start: 0.01, end: 4, step: 0.01, desc: "Fleet Spacing"}, guiTweaks);
    new CNodeGUIValue({id: "fleetX", value: config.fleetX ?? 20, start: -10, end: 20, step: 0.01, desc: "Fleet X"}, guiTweaks);
    new CNodeGUIValue({id: "fleetY", value: config.fleetY ?? -5.27, start: -10, end: 10, step: 0.01, desc: "Fleet Y"}, guiTweaks);

    const fleetDefaults = {
        gimbal: "LOSTraverseSelect",
        turnRate: "fleetTurnRate",
        acc: "fleetAcceleration",
        spacing: "fleetSpacing",
        fleetX: "fleetX",
        fleetY: "fleetY",
    };

    const offsets = [
        {id: "01", off: [2.1, -2, 0, -1]},
        {id: "02", off: [1.2, -1, 0, -2]},
        {id: "03", off: [-1.2, 0, 0, -3]},
        {id: "04", off: [-2.1, 1, 0, -2]},
        {id: "05", off: [0, 2, 0, -1]},
    ];

    offsets.forEach(({id, off}) => {
        new CNodeFleeter({
            id: "fleeter" + id,
            ...fleetDefaults,
            turnFrame: new CNodeMunge({
                id: "tf" + id,
                inputs: {t: "fleetTurnStart"},
                frames: 0,
                munge: function (f) { return 30 * (this.in.t.v(0) + off[0]); }
            }),
            offX: off[1], offY: off[2], offZ: off[3],
        });
    });

    const fleetDisplayDefaults = {width: 1, autoSphere: 100, color: 0xc0c000};
    offsets.forEach(({id}) => {
        new CNodeDisplayTrack({
            ...fleetDisplayDefaults,
            id: "fleeter" + id + "Display",
            track: "fleeter" + id,
        });
    });
}


/**
 * Set up SA page HAFU symbols for target and fleet.
 */
function setupSAPageHAFU() {
    const SA = ViewMan.get("SAPage");
    SA.addHAFU(NodeMan.get("LOSTraverseSelect"), "Hostile", "Hostile", 0);
    SA.addHAFU(NodeMan.get("fleeter01"), "Friendly", "Friendly", 10);
    SA.addHAFU(NodeMan.get("fleeter02"), "Friendly", "Friendly", 10);
    SA.addHAFU(NodeMan.get("fleeter03"), "Friendly", "Friendly", 20);
    SA.addHAFU(NodeMan.get("fleeter04"), "Friendly", "Friendly", 15);
    SA.addHAFU(NodeMan.get("fleeter05"), "Friendly", "Friendly", 5);
}


/**
 * Set up gimbal-specific graphs (cloud speed comparisons, az comparisons, acceleration).
 */
function setupGimbalGraphs() {
    // Cloud speed graph overlay
    NodeMan.get("cloudSpeedEditor").editorView.addInput("compare",
        new CNodeGraphSeries({
            inputs: {
                source: new CNodeTraverseAngularSpeed({
                    id: "transverseAngularSpeed",
                    inputs: {
                        track: "jetTrack",
                        traverse: "LOSHorizonTrack",
                        wind: "cloudWind",
                    },
                })
            },
            name: "Cloud Speed",
            color: "green",
        })
    );

    NodeMan.get("cloudSpeedEditor").editorView.addInput("compare1",
        new CNodeGraphSeries({
            id: "SimTurnRate",
            inputs: {source: "turnRate"},
            name: "Sim Turn Rate",
            color: "#8080F0",
            min: -2.5, max: -1,
        })
    );
    NodeMan.get("cloudSpeedEditor").editorView.recalculate();

    // Az editor graph overlay
    const azEditorNode = NodeMan.get("azEditor");
    azEditorNode.editorView.addInput("compare",
        new CNodeGraphSeries({
            id: "azGraphSources",
            inputs: {
                source: new CNodeMunge({
                    id: "azSourcesMarkus",
                    inputs: {az: "azMarkus"},
                    munge: function (f) { return this.in.az.getValueFrame(f); }
                })
            },
            name: "Markus Az",
            color: "#008000",
        })
    );
    azEditorNode.editorView.addInput("compare1",
        new CNodeGraphSeries({
            id: "azSources1",
            inputs: {source: "azSources"},
            name: "Selected Az",
            color: "#8080F0",
        })
    );
    azEditorNode.editorView.addInput("compare2",
        new CNodeGraphSeries({
            id: "azSources2",
            inputs: {
                source: new CNodeMunge({
                    id: "azSourcesMunge",
                    inputs: {az: "azSources"},
                    munge: function (f) {
                        if (f === 0) f = 1;
                        return (this.in.az.v(f) - this.in.az.getValue(f - 1)) * 10;
                    }
                })
            },
            name: "Delta Az",
            color: "#0080FF",
            lines: [{y: 0, color: "#0000FF"}],
            min: -10, max: 10,
        })
    );
    azEditorNode.editorView.recalculate();

    // Acceleration graph
    AddGenericNodeGraph("Acceleration", "Object g-force", [
        ["black", 1, new CNodeGForce("LOSTraverseSelect", [1, 1, 1])],
        ["green", 1, new CNodeGForce("LOSTraverseSelect", [1, 0, 1])],
        ["red", 1, new CNodeGForce("LOSTraverseSelect", [0, 1, 0])],
    ], {
        left: 0.0, top: 0.0, width: 0.5 * 9 / 16, height: 0.5,
    }, [
        {x: 716, x2: 725, color: "#FF00ff40"},
        {x: 813, x2: 828, color: "#ff00ff40"},
        {x: 861, x2: 943, color: "#ff00ff40"},
        {x: 978, x2: 984, color: "#ff00ff40"},
    ]);
}


/**
 * Create the target model and sphere for gimbal custom sitch.
 */
function setupTargetModel() {
    ModelFiles["TargetObjectFile"] = {file: "TargetObjectFile"};

    const targetModel = new CNode3DObject({
        id: "targetModel",
        model: "TargetObjectFile",
        size: new CNodeScale("sizeScaled", scaleF2M,
            new CNodeGUIValue({
                value: Sit.targetSize ?? 56,
                start: 0,
                end: 2000,
                step: 0.1,
                desc: "Target size ft"
            }, gui)
        ),
    });

    targetModel.addController("TrackPosition", {
        sourceTrack: "LOSTraverseSelect",
    });

    targetModel.addController("ObjectTilt", {
        track: "LOSTraverseSelect",
        tiltType: "none",
        wind: "targetWind",
        airTrack: "airTrack",
    });

    new CNodeDisplayTargetSphere({
        id: "targetSphere",
        inputs: {
            track: "LOSTraverseSelect",
            size: "sizeScaled",
        },
        layers: LAYER.MASK_TARGET,
    });
}


/**
 * Main entry point: sets up the full Gimbal analysis pipeline for a custom sitch.
 *
 * Called from the sitch lifecycle (index.js) when `Sit.gimbalSetup` is defined.
 *
 * @param {object} config — the value of `gimbalSetup` from the sitch definition
 */
export function handleGimbalSetup(config) {
    console.log(">>> handleGimbalSetup: setting up Gimbal analysis pipeline for custom sitch");

    // Apply config to Sit (for properties that SetupGimbal reads from Sit)
    Sit.showGlare = config.showGlare ?? false;
    Sit.cloudWindFrom = config.cloudWindFrom ?? 240;
    Sit.cloudWindKnots = config.cloudWindKnots ?? 17;
    Sit.targetWindFrom = config.targetWindFrom ?? 274;
    Sit.targetWindKnots = config.targetWindKnots ?? 65;
    Sit.localWindFrom = config.localWindFrom ?? 270;
    Sit.localWindKnots = config.localWindKnots ?? 120;
    Sit.startDistance = config.startDistance ?? 32;
    Sit.targetSpeed = config.targetSpeed ?? 340;
    Sit.showATFLIR = config.showATFLIR !== false; // default true for gimbal setup
    Sit.showGimbalDragMesh = config.showGimbalDragMesh !== false;
    Sit.showGimbalCharts = config.showGimbalCharts !== false;

    const defaultTraverse = config.defaultTraverse ?? "Const Air Spd";

    // 1. Process CSV data
    processGimbalCSVData();

    // 2. Set par values for gimbal analysis
    setupOpts();
    par.deroFromGlare = true;
    par.showGlareGraph = true;

    // 3. GUI and common setup
    if (gui) SetupJetGUI();
    SetupCommon();

    // 4. Core gimbal pipeline: az/el/bank/glare switches, winds, jet track, SA page, LOS
    SetupGimbal();

    // 5. Traverse nodes
    SetupTraverseNodes("LOSTraverseSelect", {
        "Straight Line": "LOSTraverseStraightLine",
        "Const Ground Spd": "LOSTraverseConstantSpeed",
        "Const Air Spd": "LOSTraverseConstantAirSpeed",
        "Const Air AB": "LOSTraverseStraightConstantAir",
        "Constant Altitude": "LOSTraverseConstantAltitude",
    }, defaultTraverse);

    // 6. Air track (target speed relative to wind)
    new CNodeTrackAir({
        id: "airTrack",
        source: "LOSTraverseSelect",
        wind: "targetWind",
    });

    if (!gui) return; // console mode: skip UI-only setup

    // 7. Fleet objects
    if (config.fleetTurnStart !== undefined || config.fleet !== false) {
        setupFleet(config);
        setupSAPageHAFU();
    }

    // 8. LOS/track display nodes and clouds
    SetupTrackLOSNodes();
    SetupCloudNodes();

    // 9. Graphs
    setupGimbalGraphs();

    // 10. Target model
    setupTargetModel();

    // 11. Air track display
    new CNodeDisplayTrack({
        id: "AirTrackDisplay",
        track: "airTrack",
        color: [0, 0.5, 1],
        width: 1,
        visibleCheck: (() => ViewMan.get("SAPage").buttonBoxed(16)),
    });
}

// Physics-model trajectory fit to LOS rays.
// Uses Nelder-Mead optimization with RK4 integration of a physical dynamics model.

import {CNodeTrack} from "./CNodeTrack";
import {fitPhysicsModel, buildLOSDataset, unpackFitPositions} from "../LOSFitting";
import {ChineseLanternModel} from "../ChineseLanternModel";
import {guiMenus} from "../Globals";
import {t} from "../i18n";

// Registry of available physics models
const physicsModels = {
    "Chinese Lantern": new ChineseLanternModel(),
};

export function getPhysicsModelNames() {
    return Object.keys(physicsModels);
}

export class CNodeLOSFitPhysics extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS"]);
        this.optionalInputs(["physicsModel", "maxIter", "windSpeed", "windFrom", "initialRange"]);
        this.array = [];
        this.solvedParams = null;
        this.guiFolder = null;
        this.guiDisplay = {};
        this._dirty = true;
    }

    recalculate() {
        if (!this.visible) { this._dirty = true; return; }
        this._doCompute();
    }

    _doCompute() {
        this._dirty = false;
        this.array = [];
        this.solvedParams = null;
        this.frames = this.in.LOS.frames;
        if (this.frames < 2) return;

        const {dataset, originLat, originLon} = buildLOSDataset(this.in.LOS);

        const modelName = this.in.physicsModel ? this.in.physicsModel.v0 : "Chinese Lantern";
        const model = physicsModels[modelName];
        if (!model) return;

        const options = {};
        if (this.in.maxIter) options.maxIter = this.in.maxIter.v0;

        const overrides = {};
        if (this.in.windSpeed && this.in.windFrom) {
            const speedMs = this.in.windSpeed.v0 * 0.514444;
            const fromDeg = this.in.windFrom.v0;
            const towardRad = (fromDeg + 180) * Math.PI / 180;
            overrides.windE = speedMs * Math.sin(towardRad);
            overrides.windN = speedMs * Math.cos(towardRad);
        }
        if (this.in.initialRange) {
            overrides.initialRange = this.in.initialRange.v0;
        }
        if (Object.keys(overrides).length > 0) {
            options.paramOverrides = overrides;
        }

        const result = fitPhysicsModel(dataset, new Set(), model, options);
        if (!result) return;

        this.solvedParams = result.params;
        console.log("Physics fit:", model.getName(), "cost:", result.params.cost.toFixed(6), "params:", result.params.solved);

        this.array = unpackFitPositions(result.positions, this.frames, originLat, originLon);

        this.updateGUI(model, result.params);
    }

    updateGUI(model, fitParams) {
        if (!guiMenus.traverse) return;

        // Destroy previous folder if it exists
        if (this.guiFolder) {
            this.guiFolder.destroy();
            this.guiFolder = null;
        }

        this.guiFolder = guiMenus.traverse.addFolder(t("losFitPhysics.folder")).close();
        this.guiDisplay = {};

        // Use strings for all display values to avoid lil-gui NumberController step requirement
        this.guiDisplay._model = fitParams.model;
        this.guiDisplay._cost = fitParams.cost.toFixed(6);
        this.guiFolder.add(this.guiDisplay, "_model").name(t("losFitPhysics.model.label")).disable();
        this.guiFolder.add(this.guiDisplay, "_cost").name(t("losFitPhysics.avgError.label")).disable();

        // Wind speed and direction derived from E/N components
        const solved = fitParams.solved;
        if (solved.windE !== undefined && solved.windN !== undefined) {
            const windSpeedMs = Math.sqrt(solved.windE ** 2 + solved.windN ** 2);
            const windSpeedKt = windSpeedMs / 0.514444;
            const windFromDeg = (Math.atan2(-solved.windE, -solved.windN) * 180 / Math.PI + 360) % 360;
            this.guiDisplay._windSpeed = windSpeedKt.toFixed(1);
            this.guiDisplay._windFrom = windFromDeg.toFixed(1);
            this.guiFolder.add(this.guiDisplay, "_windSpeed").name(t("losFitPhysics.windSpeed.label")).disable();
            this.guiFolder.add(this.guiDisplay, "_windFrom").name(t("losFitPhysics.windFrom.label")).disable();
        }

        // All solved parameters as strings
        const paramDefs = model.getParameterDefs();
        for (const def of paramDefs) {
            const val = solved[def.name];
            if (val !== undefined) {
                const key = def.name;
                this.guiDisplay[key] = val.toFixed(4);
                this.guiFolder.add(this.guiDisplay, key).name(key).disable();
            }
        }
    }

    getValueFrame(f) {
        if (this._dirty) this._doCompute();
        return this.array[Math.floor(f)];
    }

    dispose() {
        if (this.guiFolder) {
            this.guiFolder.destroy();
            this.guiFolder = null;
        }
        super.dispose();
    }
}

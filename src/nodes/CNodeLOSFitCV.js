// Global least-squares constant-velocity fit to LOS rays.
// Model: P(t) = P0 + V*t (6 unknowns)

import {CNodeTrack} from "./CNodeTrack";
import {fitConstantVelocity, buildLOSDataset, unpackFitPositions} from "../LOSFitting";

export class CNodeLOSFitCV extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS"]);
        this.array = [];
        this._dirty = true;
    }

    recalculate() {
        if (!this.visible) { this._dirty = true; return; }
        this._doCompute();
    }

    _doCompute() {
        this._dirty = false;
        this.array = [];
        this.frames = this.in.LOS.frames;
        if (this.frames < 2) return;

        const {dataset, originLat, originLon} = buildLOSDataset(this.in.LOS);
        const result = fitConstantVelocity(dataset, new Set());
        if (!result) return;

        this.array = unpackFitPositions(result.positions, this.frames, originLat, originLon);
    }

    getValueFrame(f) {
        if (this._dirty) this._doCompute();
        return this.array[Math.floor(f)];
    }
}

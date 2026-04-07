// Global least-squares constant-velocity fit to LOS rays.
// Model: P(t) = P0 + V*t (6 unknowns)

import {CNodeTrack} from "./CNodeTrack";
import {fitConstantVelocity, buildLOSDataset, unpackFitPositions} from "../LOSFitting";

export class CNodeLOSFitCV extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS"]);
        this.array = [];
        this.recalculate();
    }

    recalculate() {
        this.array = [];
        this.frames = this.in.LOS.frames;
        if (this.frames < 2) return;

        const {dataset, originLat, originLon} = buildLOSDataset(this.in.LOS);
        const result = fitConstantVelocity(dataset, new Set());
        if (!result) return;

        this.array = unpackFitPositions(result.positions, this.frames, originLat, originLon);
    }

    getValueFrame(f) {
        return this.array[Math.floor(f)];
    }
}

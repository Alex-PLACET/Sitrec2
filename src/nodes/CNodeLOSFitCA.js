// Global least-squares constant-acceleration fit to LOS rays.
// Model: P(t) = P0 + V*t + 0.5*A*t^2 (9 unknowns)

import {CNodeTrack} from "./CNodeTrack";
import {fitConstantAcceleration, buildLOSDataset, unpackFitPositions} from "../LOSFitting";

export class CNodeLOSFitCA extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS"]);
        this.array = [];
        this.recalculate();
    }

    recalculate() {
        this.array = [];
        this.frames = this.in.LOS.frames;
        if (this.frames < 3) return;

        const {dataset, originLat, originLon} = buildLOSDataset(this.in.LOS);
        const result = fitConstantAcceleration(dataset, new Set());
        if (!result) return;

        this.array = unpackFitPositions(result.positions, this.frames, originLat, originLon);
    }

    getValueFrame(f) {
        return this.array[Math.floor(f)];
    }
}

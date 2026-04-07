// Monte Carlo polynomial fit to LOS rays.
// Random sampling with configurable polynomial order, LOS uncertainty, and trial count.
// Uses CV fit to provide per-frame range estimates for focused sampling.

import {CNodeTrack} from "./CNodeTrack";
import {fitConstantVelocity, fitMonteCarlo, buildLOSDataset, unpackFitPositions} from "../LOSFitting";

export class CNodeLOSFitMonteCarlo extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS"]);
        this.optionalInputs(["numTrials", "losUncertaintyDeg", "order"]);
        this.array = [];
        this.recalculate();
    }

    recalculate() {
        this.array = [];
        this.frames = this.in.LOS.frames;
        if (this.frames < 2) return;

        const {dataset, originLat, originLon} = buildLOSDataset(this.in.LOS);

        // Run CV fit to get per-frame range estimates for focused MC sampling.
        // For each frame, compute the distance from sensor to the CV-predicted position
        // projected onto the LOS direction.
        const options = {};
        const cvResult = fitConstantVelocity(dataset, new Set());
        if (cvResult) {
            const rangeEstimates = new Float32Array(dataset.count);
            for (let i = 0; i < dataset.count; i++) {
                const b = i * 3;
                const dx = cvResult.positions[b] - dataset.sensorPos[b];
                const dy = cvResult.positions[b + 1] - dataset.sensorPos[b + 1];
                const dz = cvResult.positions[b + 2] - dataset.sensorPos[b + 2];
                // Project onto LOS direction to get signed range
                const range = dx * dataset.losDir[b] + dy * dataset.losDir[b + 1] + dz * dataset.losDir[b + 2];
                rangeEstimates[i] = Math.max(range, 1); // floor at 1m
            }
            options.rangeEstimates = rangeEstimates;
        }

        if (this.in.numTrials) options.numTrials = this.in.numTrials.v0;
        if (this.in.losUncertaintyDeg) options.losUncertaintyDeg = this.in.losUncertaintyDeg.v0;
        if (this.in.order) options.order = this.in.order.v0;

        const result = fitMonteCarlo(dataset, new Set(), options);
        if (!result) return;

        this.array = unpackFitPositions(result.positions, this.frames, originLat, originLon);
    }

    getValueFrame(f) {
        return this.array[Math.floor(f)];
    }
}

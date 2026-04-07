// Kalman filter (RTS forward-backward smoother) fit to LOS rays.
// 6-DOF constant-velocity state model with tunable noise parameters.
// GUI sliders are log-scale (10^x) for intuitive control over wide ranges.

import {CNodeTrack} from "./CNodeTrack";
import {fitKalmanFilter, buildLOSDataset, unpackFitPositions} from "../LOSFitting";

export class CNodeLOSFitKalman extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS"]);
        this.optionalInputs(["processNoise", "measurementNoise"]);
        this.array = [];
        this.recalculate();
    }

    recalculate() {
        this.array = [];
        this.frames = this.in.LOS.frames;
        if (this.frames < 2) return;

        const {dataset, originLat, originLon} = buildLOSDataset(this.in.LOS);

        const options = {};
        // GUI values are log10 exponents; convert to actual noise values
        if (this.in.processNoise) options.processNoise = Math.pow(10, this.in.processNoise.v0);
        if (this.in.measurementNoise) options.measurementNoise = Math.pow(10, this.in.measurementNoise.v0);

        const result = fitKalmanFilter(dataset, new Set(), options);
        if (!result) return;

        this.array = unpackFitPositions(result.positions, this.frames, originLat, originLon);
    }

    getValueFrame(f) {
        return this.array[Math.floor(f)];
    }
}

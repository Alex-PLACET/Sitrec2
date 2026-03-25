// CNodeDisplayBalloonSphere.js
// A sphere that follows a track and scales based on atmospheric pressure,
// simulating weather balloon expansion during ascent.
//
// Balloon expansion follows the ideal gas law (constant temperature approx):
//   Volume ∝ 1/P  →  radius ∝ (P₀/P)^(1/3)
//
// Typical weather balloon:
//   - Launch: ~1.5m diameter at ~1013 hPa (surface)
//   - Burst:  ~6-8m diameter at ~5-10 hPa (~30km)

import {CNodeDisplayTargetSphere} from "./CNodeDisplayTargetSphere";
import {MISB} from "../MISBFields";
import {balloonDiameter} from "../SondeTrajectory";
import {Globals} from "../Globals";

export class CNodeDisplayBalloonSphere extends CNodeDisplayTargetSphere {
    constructor(v) {
        v.color ??= "white";
        v.opacity ??= 1.0;
        v.transparent ??= false;

        super(v);

        // Optional data track input for reading pressure per frame
        this.input("dataTrack", true); // optional

        // Balloon base diameter at surface pressure (meters)
        this.baseDiameter = v.baseDiameter ?? 1.5;

        // Surface pressure reference (hPa)
        this.surfacePressure = v.surfacePressure ?? 1013.25;

        // Pressure array extracted from trajectory data
        this.pressureArray = v.pressureArray ?? null;
    }

    // Override recalculate to prevent base class from applying static size
    recalculate() {
    }

    update(f) {
        // Follow track position (parent behavior)
        super.update(f);

        // Compute balloon diameter from pressure
        let diameter = this.baseDiameter;
        let pressure = null;

        // Try to get pressure from the data track's MISB array
        if (this.in.dataTrack) {
            const dataTrack = this.in.dataTrack;
            if (dataTrack.misb && f < dataTrack.misb.length) {
                const p = dataTrack.misb[f][MISB.StaticPressure];
                if (p != null && p > 0) pressure = p;
            }
        }

        // Fallback: use the pressure array provided at construction
        if (pressure == null && this.pressureArray && f < this.pressureArray.length) {
            pressure = this.pressureArray[f];
        }

        if (pressure != null && pressure > 0) {
            diameter = balloonDiameter(this.baseDiameter, pressure, this.surfacePressure);
        }

        // Apply scale (diameter/2 = radius, but geometry radius is 0.5, so scale = diameter)
        // The sphere geometry has radius 0.5, so scaling by `diameter` gives actual radius = diameter/2
        const scale = diameter * Globals.objectScale;
        this.group.scale.setScalar(scale);
    }
}

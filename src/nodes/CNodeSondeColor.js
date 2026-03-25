// CNodeSondeColor.js — Per-frame color node for sonde tracks.
// Returns a Color based on altitude/temperature/pressure at each frame,
// using the MISB data track for atmospheric values.
// Used as the color input for CNodeDisplayTrack to create gradient-colored sonde tracks.

import {CNodeConstant} from "./CNode";
import {Color} from "three";
import {MISB} from "../MISBFields";
import {sondeColor} from "../SondeColorMap";
import {Sit} from "../Globals";

// Extends CNodeConstant so convertColorInput recognizes it as a valid color source.
// Overrides getValueFrame to return per-frame colors from MISB atmospheric data.
export class CNodeSondeColor extends CNodeConstant {
    constructor(v) {
        v.value = new Color(1, 1, 1); // default value for CNodeConstant
        super(v);
        this.input("dataTrack"); // CNodeMISBDataTrack with MISB data
        this.colorMode = v.colorMode ?? "altitude"; // "altitude", "temperature", "pressure", "none"
        this.fallbackColor = new Color(v.fallbackColor ?? 0xffffff);
        // Total frames for proportional mapping. Pass the frame count of the
        // display track this color node is paired with (e.g. misb.length for
        // full-data display, Sit.frames for sitch-duration display).
        this.totalFrames = v.totalFrames ?? 0; // 0 = auto-detect from MISB length
    }

    getValueFrame(f) {
        var misb = this.in.dataTrack.misb;
        if (!misb || misb.length === 0) return this.fallbackColor.clone();

        // Map frame to MISB index proportionally.
        // totalFrames tells us how many frames the caller iterates over.
        var numFrames = this.totalFrames > 0 ? this.totalFrames : Sit.frames;
        var idx = Math.round(f * (misb.length - 1) / Math.max(numFrames - 1, 1));
        idx = Math.max(0, Math.min(idx, misb.length - 1));

        var row = misb[idx];
        var alt = row[MISB.SensorTrueAltitude];
        var temp = row[MISB.OutsideAirTemperature];
        var pressure = row[MISB.StaticPressure];

        return sondeColor(this.colorMode, alt, temp, pressure, this.fallbackColor);
    }

    // Override v() to bypass CNode.getValue() interpolation logic,
    // which expects numbers or {position} objects. Colors need direct frame lookup.
    v(f) {
        return this.getValueFrame(f);
    }

    // Also override getValue to ensure any code path returns per-frame colors
    getValue(f) {
        return this.getValueFrame(f);
    }
}

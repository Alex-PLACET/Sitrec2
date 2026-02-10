import {CNodeTrack} from "./CNodeTrack";
import {NodeMan, Sit} from "../Globals";
import {LLAToEUS} from "../LLA-ECEF-ENU";
import {toPoint as mgrsToPoint} from "mgrs";
import {parseSingleCoordinate} from "../CoordinateParser";
import {EventManager} from "../CEventManager";
import {f2m} from "../utils";

export class CNodeOSDDataTrack extends CNodeTrack {
    constructor(v) {
        super(v);
        this.input("controller");
        this.frames = Sit.frames;
        this.useSitFrames = true;
        EventManager.addEventListener("elevationChanged", () => this.recalculateCascade());
        this.recalculate();
    }

    recalculate() {
        super.recalculate();

        const defaultPos = LLAToEUS(0, 0, 0);
        this.array = new Array(this.frames);
        for (let f = 0; f < this.frames; f++) {
            this.array[f] = {position: defaultPos.clone()};
        }

        const controller = this.in.controller;

        const byType = {};
        const typeCounts = {};
        for (const track of controller.tracks) {
            typeCounts[track.type] = (typeCounts[track.type] || 0) + 1;
        }
        for (const track of controller.tracks) {
            if (typeCounts[track.type] > 1 && (!track.show || track.lock)) continue;
            byType[track.type] = track;
        }

        const hasMGRS = byType["MGRS Zone"] && byType["MGRS East"] && byType["MGRS North"];
        const hasLatLon = byType["Latitude"] && byType["Longitude"];

        if (!hasMGRS && !hasLatLon) return;

        const keyframes = [];

        for (let f = 0; f < this.frames; f++) {
            let lat = null, lon = null, alt = 0;

            if (hasMGRS) {
                const zone = byType["MGRS Zone"];
                const east = byType["MGRS East"];
                const north = byType["MGRS North"];

                if (zone.isKeyframe(f) || east.isKeyframe(f) || north.isKeyframe(f)) {
                    const zoneVal = zone.getValue(f);
                    const eastVal = east.getValue(f);
                    const northVal = north.getValue(f);

                    if (zoneVal && zoneVal !== "?????" && eastVal && eastVal !== "?????" && northVal && northVal !== "?????") {
                        const mgrsStr = zoneVal.replace(/\s+/g, "") + eastVal.replace(/\s+/g, "") + northVal.replace(/\s+/g, "");
                        try {
                            const [lonR, latR] = mgrsToPoint(mgrsStr);
                            lat = latR;
                            lon = lonR;
                        } catch (e) {
                        }
                    }
                }
            } else if (hasLatLon) {
                const latTrack = byType["Latitude"];
                const lonTrack = byType["Longitude"];

                if (latTrack.isKeyframe(f) || lonTrack.isKeyframe(f)) {
                    const latVal = latTrack.getValue(f);
                    const lonVal = lonTrack.getValue(f);

                    if (latVal && latVal !== "?????" && lonVal && lonVal !== "?????") {
                        const parsedLat = parseSingleCoordinate(latVal);
                        const parsedLon = parseSingleCoordinate(lonVal);
                        if (parsedLat !== null && parsedLon !== null) {
                            lat = parsedLat;
                            lon = parsedLon;
                        }
                    }
                }
            }

            if (lat !== null) {
                const altTrackM = byType["Altitude (m)"];
                const altTrackFt = byType["Altitude (ft)"];
                const altTrack = altTrackM || altTrackFt;
                if (altTrack) {
                    const altVal = altTrack.getValue(f);
                    if (altVal && altVal !== "?????") {
                        const parsed = parseFloat(altVal);
                        if (!isNaN(parsed)) {
                            alt = altTrackFt ? f2m(parsed) : parsed;
                        }
                    }
                }
            }

            if (lat !== null && lon !== null) {
                keyframes.push({frame: f, lat, lon, alt});
            }
        }

        if (keyframes.length === 0) return;

        const hasAltitude = !!(byType["Altitude (m)"] || byType["Altitude (ft)"]);
        const keyframeSet = new Set(keyframes.map(kf => kf.frame));

        for (const kf of keyframes) {
            this.array[kf.frame] = {position: LLAToEUS(kf.lat, kf.lon, kf.alt)};
        }

        for (let f = 0; f < this.frames; f++) {
            if (keyframeSet.has(f)) continue;

            let prev = null, next = null;
            for (let i = keyframes.length - 1; i >= 0; i--) {
                if (keyframes[i].frame <= f) { prev = keyframes[i]; break; }
            }
            for (let i = 0; i < keyframes.length; i++) {
                if (keyframes[i].frame >= f) { next = keyframes[i]; break; }
            }

            if (prev && next && prev !== next) {
                const t = (f - prev.frame) / (next.frame - prev.frame);
                const lat = prev.lat + t * (next.lat - prev.lat);
                const lon = prev.lon + t * (next.lon - prev.lon);
                const alt = prev.alt + t * (next.alt - prev.alt);
                this.array[f] = {position: LLAToEUS(lat, lon, alt)};
            } else if (prev) {
                this.array[f] = {position: LLAToEUS(prev.lat, prev.lon, prev.alt)};
            } else if (next) {
                this.array[f] = {position: LLAToEUS(next.lat, next.lon, next.alt)};
            }
        }

        if (!hasAltitude) {
            const terrainNode = NodeMan.get("TerrainModel", false);
            if (terrainNode) {
                for (let f = 0; f < this.frames; f++) {
                    this.array[f].position = terrainNode.getPointBelow(this.array[f].position, 1, false);
                }
            }
        }
    }

    getValueFrame(frame) {
        return this.array[Math.floor(frame)];
    }
}

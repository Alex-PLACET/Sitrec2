import {MISB} from "./MISBFields";

const ROCKET_ALTITUDE_SKIP_BAD_DATA_M = 50000;
const STAGE_NAME_PATTERN = /(^|[^a-z0-9])stage([ _-]?\d+)?([^a-z0-9]|$)/i;
const FLIGHTCLUB_NAME_PATTERN = /flight[\s_-]?club/i;

function getAltitudeFromRow(row) {
    if (!Array.isArray(row)) {
        return null;
    }

    const altMSL = Number(row[MISB.SensorTrueAltitude]);
    if (Number.isFinite(altMSL)) {
        return altMSL;
    }

    const altAGL = Number(row[MISB.AltitudeAGL]);
    if (Number.isFinite(altAGL)) {
        return altAGL;
    }

    return null;
}

function getMaxTrackAltitude(misb) {
    if (!Array.isArray(misb) || misb.length === 0) {
        return null;
    }

    let maxAlt = -Infinity;
    let found = false;
    for (const row of misb) {
        const alt = getAltitudeFromRow(row);
        if (!Number.isFinite(alt)) {
            continue;
        }
        found = true;
        if (alt > maxAlt) {
            maxAlt = alt;
        }
    }

    return found ? maxAlt : null;
}

export function detectRocketLikeTrack(trackFileName, misb, trackFile) {
    if (trackFile?.isRocketTrajectory === true || trackFile?.sourceType === "flightclub") {
        return {isRocketLike: true, reason: "metadata"};
    }

    if (typeof trackFileName === "string") {
        if (FLIGHTCLUB_NAME_PATTERN.test(trackFileName)) {
            return {isRocketLike: true, reason: "filename-flightclub"};
        }
        if (STAGE_NAME_PATTERN.test(trackFileName)) {
            return {isRocketLike: true, reason: "filename-stage"};
        }
    }

    const maxAltitudeM = getMaxTrackAltitude(misb);
    if (Number.isFinite(maxAltitudeM) && maxAltitudeM >= ROCKET_ALTITUDE_SKIP_BAD_DATA_M) {
        return {isRocketLike: true, reason: "high-altitude", maxAltitudeM};
    }

    return {isRocketLike: false, reason: "none", maxAltitudeM};
}

import {meanSeaLevelOffset} from "../EGM96Geoid";

export function clampTerrainElevationHAE(lat, lon, elevation) {
    return Math.max(meanSeaLevelOffset(lat, lon), elevation);
}

export function terrainCacheMatchesLocation(cached, lat, lon, epsilonDegrees = 1e-7) {
    if (!cached) {
        return false;
    }
    return Math.abs(cached.lat - lat) <= epsilonDegrees
        && Math.abs(cached.lon - lon) <= epsilonDegrees;
}

export function conformControlPointsToAltitudeLock(positions, frameNumbers, applyAltitudeLock) {
    if (!positions || typeof applyAltitudeLock !== "function") {
        return false;
    }

    let changed = false;
    const EPS = 1e-9;

    for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        if (!position) continue;

        const frame = frameNumbers?.[i];
        const lockedPosition = applyAltitudeLock(position.clone(), frame);
        if (!lockedPosition) continue;

        if (position.distanceToSquared(lockedPosition) > EPS) {
            position.copy(lockedPosition);
            changed = true;
        }
    }

    return changed;
}

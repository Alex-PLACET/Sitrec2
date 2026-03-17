import {meanSeaLevelOffset} from "../EGM96Geoid";

export function clampTerrainElevationHAE(lat, lon, elevation) {
    return Math.max(meanSeaLevelOffset(lat, lon), elevation);
}

import {clampTerrainElevationHAE} from "../../src/nodes/trackElevationUtils";
import {meanSeaLevelOffset} from "../../src/EGM96Geoid";

describe("clampTerrainElevationHAE", () => {
    test("preserves negative HAE sea-level terrain for cached 0 AGL reconstruction", () => {
        const lat = 25.2048;
        const lon = 55.2708;
        const seaLevel = meanSeaLevelOffset(lat, lon);

        expect(seaLevel).toBeLessThan(0);
        expect(clampTerrainElevationHAE(lat, lon, seaLevel)).toBeCloseTo(seaLevel, 10);
    });

    test("still preserves positive terrain elevations above local sea level", () => {
        const lat = 25.2048;
        const lon = 55.2708;
        const elevation = meanSeaLevelOffset(lat, lon) + 42;

        expect(clampTerrainElevationHAE(lat, lon, elevation)).toBeCloseTo(elevation, 10);
    });
});

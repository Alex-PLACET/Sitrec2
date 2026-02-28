import {MISB, MISBFields} from "../src/MISBFields";
import {detectRocketLikeTrack} from "../src/trackHeuristics";

function makeRow(altMeters) {
    const row = new Array(MISBFields).fill(null);
    row[MISB.SensorTrueAltitude] = altMeters;
    return row;
}

describe("detectRocketLikeTrack", () => {
    test("returns true for explicit FlightClub metadata", () => {
        const result = detectRocketLikeTrack(
            "anything.csv",
            [makeRow(1000)],
            {sourceType: "flightclub"},
        );
        expect(result.isRocketLike).toBe(true);
        expect(result.reason).toBe("metadata");
    });

    test("returns true for stage-style filename", () => {
        const result = detectRocketLikeTrack(
            "-Starlink Group 6-108_Stage 2.csv",
            [makeRow(1000)],
            null,
        );
        expect(result.isRocketLike).toBe(true);
        expect(result.reason).toBe("filename-stage");
    });

    test("returns true for very high altitude tracks", () => {
        const result = detectRocketLikeTrack(
            "some_track.csv",
            [makeRow(12000), makeRow(98000)],
            null,
        );
        expect(result.isRocketLike).toBe(true);
        expect(result.reason).toBe("high-altitude");
    });

    test("returns false for normal aircraft tracks", () => {
        const result = detectRocketLikeTrack(
            "flightaware_AAL123.csv",
            [makeRow(8500), makeRow(11000), makeRow(9000)],
            null,
        );
        expect(result.isRocketLike).toBe(false);
    });
});

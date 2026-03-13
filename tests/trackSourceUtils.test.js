import {
    collectActiveTrackSourceFileIDs,
    hasOtherTrackSourceReference,
    shouldSerializeLoadedFileEntry,
} from "../src/trackSourceUtils";

function makeTrackManager(tracks) {
    return {
        iterate(callback) {
            Object.entries(tracks).forEach(([id, trackOb]) => callback(id, trackOb));
        }
    };
}

describe("trackSourceUtils", () => {
    test("collects only live non-synthetic track source file ids", () => {
        const trackManager = makeTrackManager({
            Track_A: {trackFileName: "old.kml", isSynthetic: false},
            Track_B: {trackFileName: "new.kml", isSynthetic: false},
            Track_C: {trackFileName: "old.kml", isSynthetic: false},
            Track_Synth: {trackFileName: "synthetic.json", isSynthetic: true},
            Track_NoFile: {isSynthetic: false},
        });

        expect(collectActiveTrackSourceFileIDs(trackManager)).toEqual(new Set(["old.kml", "new.kml"]));
    });

    test("detects whether a file is still referenced by another track", () => {
        const trackManager = makeTrackManager({
            Track_A: {trackFileName: "old.kml", isSynthetic: false},
            Track_B: {trackFileName: "old.kml", isSynthetic: false},
            Track_C: {trackFileName: "new.kml", isSynthetic: false},
        });

        expect(hasOtherTrackSourceReference(trackManager, "old.kml", "Track_A")).toBe(true);
        expect(hasOtherTrackSourceReference(trackManager, "new.kml", "Track_C")).toBe(false);
        expect(hasOtherTrackSourceReference(trackManager, "missing.kml")).toBe(false);
    });

    test("serializes orphaned files unless they were previously used as track sources", () => {
        const activeTrackSourceFileIDs = new Set(["new.kml"]);

        expect(shouldSerializeLoadedFileEntry("notes.txt", {usedAsTrackSource: false}, activeTrackSourceFileIDs)).toBe(true);
        expect(shouldSerializeLoadedFileEntry("new.kml", {usedAsTrackSource: true}, activeTrackSourceFileIDs)).toBe(true);
        expect(shouldSerializeLoadedFileEntry("old.kml", {usedAsTrackSource: true}, activeTrackSourceFileIDs)).toBe(false);
    });
});

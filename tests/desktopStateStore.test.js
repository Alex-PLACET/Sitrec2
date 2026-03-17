const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDesktopStateStore, normalizeLocalState } = require("../apps/video-viewer/desktopStateStore");

describe("desktopStateStore", () => {
    let tempRoot;
    let stateFilePath;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sitrec-desktop-state-"));
        stateFilePath = path.join(tempRoot, "desktop-state.json");
    });

    afterEach(() => {
        fs.rmSync(tempRoot, { force: true, recursive: true });
    });

    test("normalizes local state paths", () => {
        const localState = normalizeLocalState({
            sitchPath: "./example.json",
            workingDirectoryPath: "./local",
        });

        expect(localState.sitchPath).toBe(path.resolve("./example.json"));
        expect(localState.workingDirectoryPath).toBe(path.resolve("./local"));
    });

    test("persists and clears local desktop state", () => {
        const store = createDesktopStateStore(stateFilePath);

        const savedState = store.setLocalState({
            sitchPath: path.join(tempRoot, "custom.json"),
            workingDirectoryPath: path.join(tempRoot, "local"),
        });
        expect(savedState.sitchPath).toBe(path.join(tempRoot, "custom.json"));

        const restoredState = store.getLocalState();
        expect(restoredState).toEqual(savedState);

        const clearedState = store.clearLocalState();
        expect(clearedState).toEqual({
            sitchPath: null,
            workingDirectoryPath: null,
        });
    });
});

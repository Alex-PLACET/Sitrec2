const fs = require("fs");
const path = require("path");

function normalizeLocalState(localState = {}) {
    return {
        sitchPath: typeof localState.sitchPath === "string" && localState.sitchPath.trim() !== ""
            ? path.resolve(localState.sitchPath)
            : null,
        workingDirectoryPath: typeof localState.workingDirectoryPath === "string" && localState.workingDirectoryPath.trim() !== ""
            ? path.resolve(localState.workingDirectoryPath)
            : null,
    };
}

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        console.warn(`[desktop-state-store] Could not read ${filePath}:`, error);
        return {};
    }
}

function writeJsonFile(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createDesktopStateStore(stateFilePath) {
    function readState() {
        const state = readJsonFile(stateFilePath);
        return {
            local: normalizeLocalState(state.local),
        };
    }

    function writeState(nextState) {
        writeJsonFile(stateFilePath, {
            local: normalizeLocalState(nextState?.local),
        });
    }

    return {
        clearLocalState() {
            const state = readState();
            state.local = normalizeLocalState();
            writeState(state);
            return state.local;
        },

        getLocalState() {
            return readState().local;
        },

        setLocalState(localState) {
            const state = readState();
            state.local = normalizeLocalState(localState);
            writeState(state);
            return state.local;
        },
    };
}

module.exports = {
    createDesktopStateStore,
    normalizeLocalState,
};

const { contextBridge, ipcRenderer } = require("electron");

const fileWatchCallbacks = new Map();

function isBlobLike(value) {
    return value && typeof value.arrayBuffer === "function" && typeof value.type === "string";
}

function toUint8Array(value) {
    if (value instanceof Uint8Array) {
        return value;
    }

    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    return value;
}

async function normalizeWritePayload(data) {
    if (typeof data === "string") {
        return data;
    }

    if (isBlobLike(data)) {
        return new Uint8Array(await data.arrayBuffer());
    }

    return toUint8Array(data);
}

ipcRenderer.on("sitrec-desktop-fs-watch", (_event, payload) => {
    const callback = fileWatchCallbacks.get(payload.watchId);
    if (callback) {
        callback(payload);
    }
});

contextBridge.exposeInMainWorld("sitrecDesktop", Object.freeze({
    fs: Object.freeze({
        async basename(filePath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-basename", { path: filePath });
        },

        async chooseFolder(options = {}) {
            return ipcRenderer.invoke("sitrec-desktop-fs-choose-folder", options);
        },

        async dirname(filePath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-dirname", { path: filePath });
        },

        async ensureDirectory(dirPath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-ensure-directory", { path: dirPath });
        },

        async getLocalState() {
            return ipcRenderer.invoke("sitrec-desktop-fs-get-local-state");
        },

        async listDirectory(dirPath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-list-directory", { path: dirPath });
        },

        async openFile(options = {}) {
            return ipcRenderer.invoke("sitrec-desktop-fs-open-file", options);
        },

        async readFile(filePath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-read-file", { path: filePath });
        },

        async resolvePath(basePath, relativePath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-resolve-path", { basePath, relativePath });
        },

        async setLocalState(localState) {
            return ipcRenderer.invoke("sitrec-desktop-fs-set-local-state", localState);
        },

        async stat(targetPath) {
            return ipcRenderer.invoke("sitrec-desktop-fs-stat", { path: targetPath });
        },

        async unwatchFile(watchId) {
            fileWatchCallbacks.delete(watchId);
            return ipcRenderer.invoke("sitrec-desktop-fs-unwatch-file", { watchId });
        },

        async watchFile(filePath, callback) {
            const watchId = await ipcRenderer.invoke("sitrec-desktop-fs-watch-file", { path: filePath });
            fileWatchCallbacks.set(watchId, callback);
            return watchId;
        },

        async writeFile(filePath, data, options = {}) {
            return ipcRenderer.invoke("sitrec-desktop-fs-write-file", {
                ...options,
                data: await normalizeWritePayload(data),
                path: filePath,
            });
        },
    }),
    isDesktopApp: true,
    offline: true,
}));

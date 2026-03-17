const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const fs = require("fs");
const path = require("path");
const { createDesktopStateStore } = require("./desktopStateStore");
const { createDesktopServer } = require("./server");

let desktopServer = null;
let desktopStateStore = null;
let mainWindow = null;
let serverBaseUrl = null;
let isQuitting = false;
const fileWatchers = new Map();
let nextFileWatcherId = 1;

function getResourcePaths() {
    if (app.isPackaged) {
        return {
            distDir: path.join(process.resourcesPath, "dist-serverless"),
            terrainDir: path.join(process.resourcesPath, "sitrec-terrain"),
        };
    }

    return {
        distDir: path.join(__dirname, "..", "..", "dist-serverless"),
        terrainDir: path.join(__dirname, "..", "..", "..", "sitrec-terrain"),
    };
}

function getDesktopStateStore() {
    if (!desktopStateStore) {
        desktopStateStore = createDesktopStateStore(path.join(app.getPath("userData"), "desktop-state.json"));
    }

    return desktopStateStore;
}

function toFsPath(value, label = "path") {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Expected a non-empty ${label}`);
    }

    return path.resolve(value);
}

function serializePathEntry(entryPath, kind) {
    return {
        kind,
        name: path.basename(entryPath),
        path: entryPath,
    };
}

async function getPathInfo(targetPath) {
    try {
        const stats = await fs.promises.stat(targetPath);
        return {
            exists: true,
            kind: stats.isDirectory() ? "directory" : "file",
            name: path.basename(targetPath),
            path: targetPath,
            size: stats.size,
        };
    } catch (error) {
        if (error.code === "ENOENT") {
            return {
                exists: false,
                kind: null,
                name: path.basename(targetPath),
                path: targetPath,
                size: 0,
            };
        }

        throw error;
    }
}

async function ensureDirectory(targetPath) {
    await fs.promises.mkdir(targetPath, { recursive: true });
    return serializePathEntry(targetPath, "directory");
}

function toBuffer(data) {
    if (typeof data === "string") {
        return data;
    }

    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }

    if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
    }

    throw new Error("Unsupported file payload type");
}

function closeFileWatcher(watchId) {
    const watcherEntry = fileWatchers.get(watchId);
    if (!watcherEntry) {
        return;
    }

    try {
        watcherEntry.watcher.close();
    } catch (error) {
        console.warn(`[desktop-fs] Failed to close watcher ${watchId}:`, error);
    }

    fileWatchers.delete(watchId);
}

function closeFileWatchersForWebContents(webContentsId) {
    for (const [watchId, watcherEntry] of fileWatchers.entries()) {
        if (watcherEntry.webContentsId === webContentsId) {
            closeFileWatcher(watchId);
        }
    }
}

function closeAllFileWatchers() {
    for (const watchId of Array.from(fileWatchers.keys())) {
        closeFileWatcher(watchId);
    }
}

function registerDesktopFsHandlers() {
    ipcMain.handle("sitrec-desktop-fs-open-file", async (event, options = {}) => {
        const ownerWindow = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(ownerWindow, {
            defaultPath: options.defaultPath ? toFsPath(options.defaultPath, "defaultPath") : undefined,
            filters: Array.isArray(options.filters) ? options.filters : undefined,
            properties: ["openFile"],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        return serializePathEntry(toFsPath(result.filePaths[0], "selected file"), "file");
    });

    ipcMain.handle("sitrec-desktop-fs-save-file", async (event, options = {}) => {
        const ownerWindow = BrowserWindow.fromWebContents(event.sender);
        let defaultPath;
        if (options.defaultPath) {
            defaultPath = toFsPath(options.defaultPath, "defaultPath");
        } else if (typeof options.suggestedName === "string" && options.suggestedName.trim() !== "") {
            defaultPath = path.join(app.getPath("documents"), path.basename(options.suggestedName.trim()));
        }

        const result = await dialog.showSaveDialog(ownerWindow, {
            defaultPath,
            filters: Array.isArray(options.filters) ? options.filters : undefined,
            title: typeof options.title === "string" && options.title.trim() !== "" ? options.title : undefined,
        });

        if (result.canceled || !result.filePath) {
            return null;
        }

        return serializePathEntry(toFsPath(result.filePath, "selected file"), "file");
    });

    ipcMain.handle("sitrec-desktop-fs-choose-folder", async (event, options = {}) => {
        const ownerWindow = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(ownerWindow, {
            defaultPath: options.defaultPath ? toFsPath(options.defaultPath, "defaultPath") : undefined,
            properties: ["openDirectory", "createDirectory"],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        return serializePathEntry(toFsPath(result.filePaths[0], "selected folder"), "directory");
    });

    ipcMain.handle("sitrec-desktop-fs-read-file", async (_event, options = {}) => {
        const filePath = toFsPath(options.path, "file path");
        const buffer = await fs.promises.readFile(filePath);
        return Uint8Array.from(buffer);
    });

    ipcMain.handle("sitrec-desktop-fs-write-file", async (_event, options = {}) => {
        const filePath = toFsPath(options.path, "file path");
        const createParents = options.createParents !== false;

        if (createParents) {
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        }

        await fs.promises.writeFile(filePath, toBuffer(options.data));
        return serializePathEntry(filePath, "file");
    });

    ipcMain.handle("sitrec-desktop-fs-list-directory", async (_event, options = {}) => {
        const dirPath = toFsPath(options.path, "directory path");
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        return entries
            .map((entry) => ({
                kind: entry.isDirectory() ? "directory" : "file",
                name: entry.name,
                path: path.join(dirPath, entry.name),
            }))
            .sort((left, right) => left.name.localeCompare(right.name));
    });

    ipcMain.handle("sitrec-desktop-fs-stat", async (_event, options = {}) => {
        const targetPath = toFsPath(options.path, "path");
        return getPathInfo(targetPath);
    });

    ipcMain.handle("sitrec-desktop-fs-ensure-directory", async (_event, options = {}) => {
        const dirPath = toFsPath(options.path, "directory path");
        return ensureDirectory(dirPath);
    });

    ipcMain.handle("sitrec-desktop-fs-resolve-path", async (_event, options = {}) => {
        return path.resolve(toFsPath(options.basePath, "basePath"), options.relativePath || "");
    });

    ipcMain.handle("sitrec-desktop-fs-dirname", async (_event, options = {}) => {
        return path.dirname(toFsPath(options.path, "path"));
    });

    ipcMain.handle("sitrec-desktop-fs-basename", async (_event, options = {}) => {
        return path.basename(toFsPath(options.path, "path"));
    });

    ipcMain.handle("sitrec-desktop-fs-get-local-state", async () => {
        return getDesktopStateStore().getLocalState();
    });

    ipcMain.handle("sitrec-desktop-fs-set-local-state", async (_event, options = {}) => {
        return getDesktopStateStore().setLocalState(options);
    });

    ipcMain.handle("sitrec-desktop-fs-watch-file", async (event, options = {}) => {
        const filePath = toFsPath(options.path, "file path");
        const watchId = `watch-${nextFileWatcherId++}`;
        const webContents = event.sender;

        const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
            if (!webContents.isDestroyed()) {
                webContents.send("sitrec-desktop-fs-watch", {
                    eventType,
                    path: filePath,
                    watchId,
                });
            }
        });

        fileWatchers.set(watchId, {
            watcher,
            webContentsId: webContents.id,
        });

        webContents.once("destroyed", () => {
            closeFileWatchersForWebContents(webContents.id);
        });

        return watchId;
    });

    ipcMain.handle("sitrec-desktop-fs-unwatch-file", async (_event, options = {}) => {
        if (typeof options.watchId === "string") {
            closeFileWatcher(options.watchId);
        }

        return true;
    });
}

function isAllowedNavigation(url) {
    if (url === "about:blank") {
        return true;
    }

    if (url.startsWith("devtools://") || url.startsWith("chrome-devtools://")) {
        return true;
    }

    return Boolean(serverBaseUrl && url.startsWith(serverBaseUrl));
}

function installOfflineNetworkGuard() {
    const filter = { urls: ["*://*/*"] };

    session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
        callback({ cancel: !isAllowedNavigation(details.url) });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        backgroundColor: "#111827",
        height: 1000,
        title: "Sitrec",
        width: 1600,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.js"),
        },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return { action: isAllowedNavigation(url) ? "allow" : "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!isAllowedNavigation(url)) {
            event.preventDefault();
        }
    });

    mainWindow.webContents.on("will-prevent-unload", (event) => {
        if (isQuitting) {
            // Ignore the renderer's beforeunload guard during an explicit app quit.
            event.preventDefault();
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    return mainWindow.loadURL(`${serverBaseUrl}/sitrec/`);
}

async function startDesktopServer() {
    const { distDir, terrainDir } = getResourcePaths();

    if (!fs.existsSync(distDir)) {
        throw new Error(`Missing serverless build at ${distDir}. Run: npm run build-serverless`);
    }

    if (!fs.existsSync(terrainDir)) {
        throw new Error(`Missing terrain bundle at ${terrainDir}.`);
    }

    desktopServer = createDesktopServer({ distDir, terrainDir });
    const serverInfo = await desktopServer.start();
    serverBaseUrl = serverInfo.baseUrl;
}

async function stopDesktopServer() {
    if (!desktopServer) {
        return;
    }

    const serverToStop = desktopServer;
    desktopServer = null;
    serverBaseUrl = null;

    try {
        await serverToStop.stop();
    } catch (error) {
        console.error("[desktop-app] Failed to stop internal server", error);
    }
}

async function showStartupError(error) {
    console.error("[desktop-app] Startup failed", error);

    await dialog.showMessageBox({
        buttons: ["Quit"],
        detail: error.stack || String(error),
        message: "Sitrec could not start the offline desktop app resources.",
        noLink: true,
        title: "Sitrec Startup Error",
        type: "error",
    });
}

app.whenReady().then(async () => {
    try {
        registerDesktopFsHandlers();
        await startDesktopServer();
        installOfflineNetworkGuard();
        await createWindow();
    } catch (error) {
        await showStartupError(error);
        await stopDesktopServer();
        app.quit();
        return;
    }

    app.on("activate", async () => {
        if (BrowserWindow.getAllWindows().length === 0 && serverBaseUrl) {
            await createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", async () => {
    isQuitting = true;
    closeAllFileWatchers();
    await stopDesktopServer();
});

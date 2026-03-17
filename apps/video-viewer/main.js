const { app, BrowserWindow, dialog, session } = require("electron");
const fs = require("fs");
const path = require("path");
const { createDesktopServer } = require("./server");

let desktopServer = null;
let mainWindow = null;
let serverBaseUrl = null;

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
    await stopDesktopServer();
});

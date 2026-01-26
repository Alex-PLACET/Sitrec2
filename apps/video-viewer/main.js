const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingFilePath = null;

function getResourcePath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app_build', 'video-viewer');
    }
    return path.join(__dirname, '..', '..', 'app_build', 'video-viewer');
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Sitrec Video Viewer',
    });

    mainWindow.loadFile(path.join(getResourcePath(), 'index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('open-video', filePath);
    } else {
        pendingFilePath = filePath;
    }
});

app.on('ready', () => {
    if (pendingFilePath) {
        setTimeout(() => {
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('open-video', pendingFilePath);
                pendingFilePath = null;
            }
        }, 1000);
    }
});

ipcMain.handle('read-video-file', async (event, filePath) => {
    try {
        const buffer = await fs.promises.readFile(filePath);
        return { data: buffer, name: path.basename(filePath) };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

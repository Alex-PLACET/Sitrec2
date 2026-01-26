const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    readVideoFile: (filePath) => ipcRenderer.invoke('read-video-file', filePath),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    onOpenVideo: (callback) => {
        ipcRenderer.on('open-video', (event, filePath) => callback(filePath));
    },
});

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("sitrecDesktop", Object.freeze({
    isDesktopApp: true,
    offline: true,
}));

// Preload — exposes a safe IPC API to the renderer as window.cinemaxAPI
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cinemaxAPI", {
  isElectron: true,
  listDrives: () => ipcRenderer.invoke("drives:list"),
  scanDrive: (drivePath) => ipcRenderer.invoke("drives:scan", drivePath),
  onDriveAttached: (cb) => {
    ipcRenderer.removeAllListeners("drive:attached");
    ipcRenderer.on("drive:attached", (_e, info) => cb(info));
  },
  onDriveDetached: (cb) => {
    ipcRenderer.removeAllListeners("drive:detached");
    ipcRenderer.on("drive:detached", (_e, path) => cb(path));
  },
});

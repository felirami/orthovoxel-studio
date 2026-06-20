const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orthoVoxelDesktop", {
  onMenuEvent(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("menu-event", listener);
    return () => ipcRenderer.removeListener("menu-event", listener);
  }
});

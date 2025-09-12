const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  fetch: (path, init) => ipcRenderer.invoke("api:fetch", { path, init }),
});
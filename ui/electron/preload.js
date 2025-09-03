const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", { ok: true });

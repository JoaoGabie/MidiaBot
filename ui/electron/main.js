const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });

  // Em DEV, carrega o servidor do Next (Tailwind roda aqui)
  win.loadURL(process.env.ELECTRON_START_URL || "http://localhost:3000");
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

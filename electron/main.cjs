const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

/** Load from `next dev` when ELECTRON_DEV=1; otherwise bundled static `out/`. */
const useDevServer = process.env.ELECTRON_DEV === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (useDevServer) {
    win.loadURL("http://127.0.0.1:3000");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = path.join(__dirname, "..", "out", "index.html");
    win.loadFile(indexHtml);
  }
}

app.whenReady().then(() => {
  ipcMain.handle("app-quit", async () => {
    app.quit();
    return true;
  });

  ipcMain.on("app-quit", () => {
    app.quit();
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

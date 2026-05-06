const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("glideApp", {
  isDesktop: true,
  quit: async () => {
    try {
      await ipcRenderer.invoke("app-quit");
    } catch {
      ipcRenderer.send("app-quit");
    }
  },
});

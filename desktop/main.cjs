const { app, BrowserWindow, shell, session } = require("electron");

const APP_URL = "https://xivvix988.github.io/NetraOS-APP/";
const APP_ORIGIN = new URL(APP_URL).origin;

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol)) {
      void shell.openExternal(parsed.href);
    }
  } catch {
    // Ignore malformed or unsupported links from the page.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    title: "NetraOS",
    autoHideMenuBar: true,
    backgroundColor: "#f4f7f3",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) {
        event.preventDefault();
        openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  void window.loadURL(APP_URL);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

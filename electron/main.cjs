const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow;

function sendMenuEvent(eventName) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("menu-event", eventName);
  }
}

function createMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Project", accelerator: "CmdOrCtrl+N", click: () => sendMenuEvent("new") },
        { label: "Open Project...", accelerator: "CmdOrCtrl+O", click: () => sendMenuEvent("open") },
        { label: "Save Project", accelerator: "CmdOrCtrl+S", click: () => sendMenuEvent("save") },
        { type: "separator" },
        { label: "Export Sprite Sheet", accelerator: "CmdOrCtrl+E", click: () => sendMenuEvent("export-sheet") },
        { label: "Export Snapshot", accelerator: "CmdOrCtrl+Shift+E", click: () => sendMenuEvent("export-snapshot") },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { label: "Rebuild Volume", accelerator: "CmdOrCtrl+R", click: () => sendMenuEvent("rebuild") },
        { label: "Delete Selection", accelerator: "Backspace", click: () => sendMenuEvent("delete-selection") },
        { type: "separator" },
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Front", click: () => sendMenuEvent("view-front") },
        { label: "Right", click: () => sendMenuEvent("view-right") },
        { label: "Top", click: () => sendMenuEvent("view-top") },
        { label: "Isometric", click: () => sendMenuEvent("view-iso") },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "reload" },
        { role: "toggleDevTools" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "OrthoVoxel Studio",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: "#f5f6f1",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

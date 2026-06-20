// Cinemax Store — Electron main process
// Loads the built web app and exposes auto USB-drive detection to the renderer.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs/promises");

let mainWindow = null;

// ---------- USB detection (drivelist polling + usb hotplug events) ----------
let drivelist = null;
try { drivelist = require("drivelist"); } catch (e) { console.warn("drivelist not loaded:", e.message); }

let knownDrives = new Map(); // mountpoint -> { label, size }

async function listRemovableDrives() {
  if (!drivelist) return [];
  const drives = await drivelist.list();
  const out = [];
  for (const d of drives) {
    // Only removable / USB drives, with at least one mount point
    if (!d.isUSB && !d.isRemovable) continue;
    if (!d.mountpoints || d.mountpoints.length === 0) continue;
    const mp = d.mountpoints[0];
    out.push({
      path: mp.path,
      label: mp.label || d.description || mp.path,
      size: d.size || 0,
    });
  }
  return out;
}

async function pollDrives() {
  try {
    const current = await listRemovableDrives();
    const currentMap = new Map(current.map((d) => [d.path, d]));

    // attached
    for (const [path, info] of currentMap) {
      if (!knownDrives.has(path)) {
        knownDrives.set(path, info);
        if (mainWindow) mainWindow.webContents.send("drive:attached", info);
      }
    }
    // detached
    for (const path of [...knownDrives.keys()]) {
      if (!currentMap.has(path)) {
        knownDrives.delete(path);
        if (mainWindow) mainWindow.webContents.send("drive:detached", path);
      }
    }
  } catch (e) {
    console.error("pollDrives error:", e);
  }
}

function startUsbWatchers() {
  // Fast polling (every 1s) — feels instant on USB insert/remove
  setInterval(pollDrives, 1000);
  setTimeout(pollDrives, 800);
}

// ---------- Recursive folder scan (size + file count) ----------
async function scanFolder(dir) {
  let totalBytes = 0;
  let fileCount = 0;
  const sampleFiles = [];
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      try {
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile()) {
          const st = await fs.stat(full);
          totalBytes += st.size;
          fileCount++;
          if (sampleFiles.length < 10) sampleFiles.push(e.name);
        }
      } catch { /* skip unreadable */ }
    }
  }
  await walk(dir);
  return { totalBytes, fileCount, sampleFiles };
}

// ---------- IPC ----------
ipcMain.handle("drives:list", async () => listRemovableDrives());
ipcMain.handle("drives:scan", async (_evt, drivePath) => scanFolder(drivePath));

// ---------- Window ----------
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#1a1f2e",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexCandidates = [
    path.join(__dirname, "app", ".output", "public", "index.html"),
    path.join(process.resourcesPath || "", "app", ".output", "public", "index.html"),
    path.join(__dirname, "..", ".output", "public", "index.html"),
    path.join(__dirname, "..", "dist", "index.html"),
  ];

  const indexHtml = await findExistingFile(indexCandidates);
  if (indexHtml) {
    await mainWindow.loadFile(indexHtml);
  } else {
    // Fallback: load dev server URL if running `electron .` during development
    await mainWindow.loadURL(process.env.VITE_DEV_URL || "http://localhost:5173");
  }

  startUsbWatchers();
}

async function findExistingFile(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next path
    }
  }
  return null;
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

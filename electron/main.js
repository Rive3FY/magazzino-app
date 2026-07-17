const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const isDev = !app.isPackaged;
const DEV_PORT = process.env.PORT || "3000";
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const projectRoot = path.join(__dirname, "..");

/** @type {import('child_process').ChildProcess | null} */
let nextProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * @param {string} url
 * @param {number} [maxAttempts]
 */
function waitForServer(url, maxAttempts = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryConnect = () => {
      attempts += 1;
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(2000, () => req.destroy());
      req.on("error", () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Server non raggiungibile: ${url}`));
          return;
        }
        setTimeout(tryConnect, 500);
      });
    };

    tryConnect();
  });
}

/**
 * Controlla rapidamente se il server risponde già.
 * @param {string} url
 */
function isServerUp(url) {
  return waitForServer(url, 2).then(
    () => true,
    () => false
  );
}

/**
 * Avvia `next dev` se non è già in esecuzione.
 */
async function ensureDevServer() {
  if (await isServerUp(DEV_URL)) {
    console.log("[Magazzino] Next.js già attivo su", DEV_URL);
    return DEV_URL;
  }

  console.log("[Magazzino] Avvio Next.js in sviluppo...");

  const nextCli = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  nextProcess = spawn(
    process.execPath,
    [nextCli, "dev", "-H", "127.0.0.1", "-p", String(DEV_PORT)],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: "inherit",
    }
  );

  nextProcess.on("error", (err) => {
    console.error("[Magazzino] Errore avvio next dev:", err);
  });

  await waitForServer(DEV_URL);
  return DEV_URL;
}

/**
 * Avvia il server Next.js standalone in produzione.
 */
async function startProductionServer() {
  const port = process.env.PORT || "3000";
  const standaloneDir = path.join(process.resourcesPath, "standalone");
  const serverPath = path.join(standaloneDir, "server.js");

  console.log("[Magazzino] Avvio server produzione:", serverPath);

  nextProcess = spawn(process.execPath, [serverPath], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  nextProcess.on("error", (err) => {
    console.error("[Magazzino] Errore avvio server Next.js:", err);
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

/**
 * @param {string} url
 */
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Magazzino App2",
    backgroundColor: "#ffffff",
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        "[Magazzino] Caricamento fallito:",
        errorCode,
        errorDescription,
        validatedURL
      );

      if (isDev && errorCode !== -3) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(url);
          }
        }, 1000);
      }
    }
  );

  mainWindow.loadURL(url);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function stopNextProcess() {
  if (nextProcess && !nextProcess.killed) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(nextProcess.pid), "/f", "/t"]);
    } else {
      nextProcess.kill("SIGTERM");
    }
    nextProcess = null;
  }
}

app.whenReady().then(async () => {
  try {
    const url = isDev
      ? await ensureDevServer()
      : await startProductionServer();

    console.log("[Magazzino] Apro finestra:", url);
    createWindow(url);
  } catch (err) {
    console.error("[Magazzino] Impossibile avviare:", err);
    stopNextProcess();
    app.quit();
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        const url = isDev
          ? await ensureDevServer()
          : await startProductionServer();
        createWindow(url);
      } catch (err) {
        console.error("[Magazzino] Riattivazione fallita:", err);
      }
    }
  });
});

app.on("window-all-closed", () => {
  stopNextProcess();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopNextProcess();
});

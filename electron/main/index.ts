import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/* ── startup log ─────────────────────────────────────────────────── */
function startupLogDir(): string {
  const dir = process.env.AHMED_KILWA_DATA_DIR || path.join(os.homedir(), '.ahmed-kilwa');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

function writeStartupLog(msg: string) {
  try {
    const logPath = path.join(startupLogDir(), 'startup.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore – best effort */ }
}

// The packaged EXE is windowed (no console), so every startup failure must be
// recorded in startup.log instead of silently leaving orphan processes behind.
process.on('uncaughtException', (err: Error) => {
  writeStartupLog(`UNCAUGHT EXCEPTION: ${err.stack ?? err.message}`);
  app.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  writeStartupLog(`UNHANDLED REJECTION: ${String(reason)}`);
});

/* ── single instance ─────────────────────────────────────────────── */
if (!app.requestSingleInstanceLock()) {
  writeStartupLog('Another instance is already running - exiting.');
  app.quit();
} else {
  runApplication();
}

/* ── application ─────────────────────────────────────────────────── */
function runApplication(): void {
  writeStartupLog('Application startup started');

  // Improve Windows rendering compatibility: avoid Chromium's native window
  // occlusion detection which can cause paint/draw issues on some Win32 setups.
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  }

  const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

  let mainWindow: BrowserWindow | null = null;
  let tray: Tray | null = null;

  function iconPath(): string {
    const candidates = [
      path.join(__dirname, '..', '..', '..', 'assets', 'icon.png'),
      path.join(__dirname, '..', '..', '..', 'assets', 'icon.ico'),
      path.join(process.resourcesPath ?? '', 'assets', 'icon.png'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return '';
  }

  function showMainWindow(): void {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      writeStartupLog('Main window created and shown');
    }
  }

  function createWindow() {
    writeStartupLog('GUI initialization started');

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      show: false,
      backgroundColor: '#0b1022',
      title: 'SMART Planner',
      icon: iconPath() || undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    if (DEV_SERVER_URL) {
      mainWindow.loadURL(DEV_SERVER_URL);
    } else {
      const indexPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.html');
      mainWindow.loadFile(indexPath);
    }

    // Primary: show once the first frame is painted (avoids a white flash).
    mainWindow.once('ready-to-show', showMainWindow);
    // Fallback: guarantee the window becomes visible even if ready-to-show is
    // delayed, so the GUI can never get stuck hidden while the app runs.
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(showMainWindow, 500);
    });

    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
      writeStartupLog(`Renderer failed to load: errorCode=${errorCode} ${errorDescription}`);
    });
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      writeStartupLog(`Renderer process gone: ${details.reason}`);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  function createTray() {
    const ico = iconPath();
    tray = new Tray(ico ? nativeImage.createFromPath(ico) : nativeImage.createEmpty());
    tray.setToolTip('SMART Planner');
    const menu = Menu.buildFromTemplate([
      { label: 'Open SMART Planner', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: "Today's Tasks", click: () => { sendToRenderer('nav', { page: 'today' }); mainWindow?.show(); } },
      { label: 'Quick Task', click: () => { sendToRenderer('quick-capture', {}); mainWindow?.show(); } },
      { label: 'Start Focus', click: () => { sendToRenderer('nav', { page: 'focus' }); mainWindow?.show(); } },
      { type: 'separator' },
      { label: 'Exit', click: () => { app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }

  function sendToRenderer(channel: string, payload: unknown) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  }

  /* ── app ready ───────────────────────────────────────────────────── */
  app.whenReady().then(() => {
    writeStartupLog('Entry point started');

    // Dependency-heavy modules are loaded lazily (instead of at import time)
    // so that any failure - e.g. better-sqlite3's native binary not being
    // loadable - is caught here and written to the startup log instead of
    // crashing the process invisibly before the window can be created.
    try {
      const { migrate } = require('../db/schema') as { migrate: () => void };
      migrate();
      writeStartupLog('Database migrated');
    } catch (err) {
      writeStartupLog(`Startup exception during migrate: ${(err as Error)?.message}`);
      app.quit();
      return;
    }

    try {
      const { registerIpc } = require('../ipc') as { registerIpc: () => void };
      registerIpc();
      writeStartupLog('IPC registered');
    } catch (err) {
      writeStartupLog(`Startup exception during registerIpc: ${(err as Error)?.message}`);
      app.quit();
      return;
    }

    try {
      const { pruneStaleNotifications } = require('../engines/notifications') as { pruneStaleNotifications: () => void };
      pruneStaleNotifications();
      writeStartupLog('Stale notifications pruned');
    } catch (err) {
      writeStartupLog(`Startup exception during pruneStaleNotifications: ${(err as Error)?.message}`);
      // non-fatal - continue
    }

    createWindow();
    createTray();

    // Fire due reminders right away, then keep checking every minute.
    const runNotificationCheck = () => {
      try {
        const { checkDueNotifications } = require('../engines/notifications') as {
          checkDueNotifications: () => Array<{ id: string; title: string; body: string; type: string }>;
        };
        const fired = checkDueNotifications();
        if (fired.length === 0) return;
        for (const f of fired) {
          sendToRenderer('notification', { id: f.id, title: f.title, body: f.body, type: f.type });
        }
        if (Notification.isSupported()) {
          for (const f of fired.slice(0, 3)) {
            const n = new Notification({ title: f.title, body: f.body });
            n.on('click', () => { mainWindow?.show(); });
            n.show();
          }
        }
      } catch { /* notification errors are non-fatal */ }
    };
    runNotificationCheck();
    setInterval(runNotificationCheck, 60_000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  }).catch((err) => {
    writeStartupLog(`Startup exception (whenReady): ${(err as Error)?.stack ?? (err as Error)?.message ?? String(err)}`);
    app.quit();
  });

  /* ── lifecycle ───────────────────────────────────────────────────── */
  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (tray) tray.destroy();
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
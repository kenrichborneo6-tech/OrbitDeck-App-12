const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, screen, session, desktopCapturer, nativeImage, net } = require('electron');
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) app.quit();

let win, tray, ps = null, lastTitle = '', cfg = {};
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const loadCfg = () => { try { cfg = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { cfg = {}; } };
const saveCfg = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch {} };

/* ---------- window ---------- */
function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    transparent: true, frame: false, hasShadow: false, resizable: false, movable: false,
    skipTaskbar: true, show: false, alwaysOnTop: !!cfg.top, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false
    }
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

/* ---------- tray ---------- */
function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = tray || new Tray(icon);
  tray.setToolTip('OrbitDeck');
  const send = (k) => win && win.webContents.send('menu', k);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pilih folder musik…', click: () => send('folder') },
    { label: 'Mode Spotify / audio PC', type: 'checkbox', checked: cfg.mode === 'system', click: () => send('system') },
    { label: 'Latar Bumi (Earth)', type: 'checkbox', checked: !!cfg.earth, click: (i) => { cfg.earth = i.checked; saveCfg(); send('earth'); } },
    { type: 'separator' },
    { label: 'Selalu di atas jendela lain', type: 'checkbox', checked: !!cfg.top, click: (i) => { cfg.top = i.checked; saveCfg(); win && win.setAlwaysOnTop(i.checked); } },
    { label: 'Jalankan saat Windows start', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() }
  ]));
}

/* ---------- Spotify window-title watcher (Windows) ---------- */
function watchSpotify(on) {
  if (!on) { if (ps) { try { ps.kill(); } catch {} ps = null; } return; }
  if (ps || process.platform !== 'win32') return;
  const script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;while($true){$p=Get-Process Spotify -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowTitle}|Select-Object -First 1;if($p){Write-Output('T|'+$p.MainWindowTitle)}else{Write-Output('T|')};Start-Sleep -Milliseconds 1200}";
  ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', script], { windowsHide: true });
  let buf = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r/g, ''); buf = buf.slice(i + 1);
      if (line.startsWith('T|')) { const t = line.slice(2); if (t !== lastTitle) { lastTitle = t; win && win.webContents.send('spotify', t); } }
    }
  });
  ps.on('error', () => { ps = null; });
  ps.on('exit', () => { ps = null; });
}

/* ---------- helpers ---------- */
const AUDIO = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
async function walk(dir, depth, out) {
  if (out.length > 3000 || depth > 3) return;
  let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, depth + 1, out);
    else if (AUDIO.test(e.name)) out.push({ path: p, name: e.name.replace(/\.[^.]+$/, '') });
  }
}
async function getJson(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'OrbitDeck/1.0 (desktop widget)' } });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

/* ---------- IPC ---------- */
ipcMain.handle('cfg:get', () => cfg);
ipcMain.handle('cfg:set', (_, patch) => { cfg = { ...cfg, ...patch }; saveCfg(); return cfg; });
ipcMain.handle('pick-folder', async () => {
  if (win) win.setAlwaysOnTop(true);
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Pilih folder musik' });
  if (win) win.setAlwaysOnTop(!!cfg.top);
  if (r.canceled || !r.filePaths[0]) return null;
  cfg.folder = r.filePaths[0]; saveCfg(); return cfg.folder;
});
ipcMain.handle('scan', async (_, dir) => { const out = []; await walk(dir, 0, out); out.sort((a, b) => a.path.localeCompare(b.path)); return out; });
ipcMain.handle('read-file', (_, p) => fs.promises.readFile(p));
ipcMain.handle('read-head', async (_, p, n) => {
  const fh = await fs.promises.open(p, 'r');
  try { const b = Buffer.alloc(n); const { bytesRead } = await fh.read(b, 0, n, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); }
});
ipcMain.handle('read-lrc', async (_, p) => { try { return await fs.promises.readFile(p.replace(/\.[^.]+$/, '.lrc'), 'utf8'); } catch { return null; } });
ipcMain.handle('lyrics', async (_, { artist, title, duration }) => {
  const enc = encodeURIComponent, first = (artist || '').split(/,|&| feat\.?/i)[0].trim();
  const tries = [
    `https://lrclib.net/api/search?track_name=${enc(title)}&artist_name=${enc(artist || '')}`,
    `https://lrclib.net/api/search?q=${enc((first + ' ' + title).trim())}`
  ];
  for (const u of tries) {
    try {
      const ok = ((await getJson(u)) || []).filter((x) => x.syncedLyrics);
      if (ok.length) {
        const d = duration || ok[0].duration || 0;
        ok.sort((a, b) => Math.abs((a.duration || 0) - d) - Math.abs((b.duration || 0) - d));
        return { lrc: ok[0].syncedLyrics, duration: ok[0].duration || 0 };
      }
    } catch {}
  }
  return null;
});
ipcMain.handle('cover', async (_, { artist, title }) => {
  try {
    const j = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent((artist + ' ' + title).trim())}&media=music&entity=song&limit=1`);
    const u = j.results && j.results[0] && j.results[0].artworkUrl100;
    if (!u) return null;
    const r = await net.fetch(u.replace('100x100', '600x600'));
    if (!r.ok) return null;
    return 'data:image/jpeg;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch { return null; }
});
ipcMain.on('set-ignore', (_, v) => { if (win) win.setIgnoreMouseEvents(!!v, { forward: true }); });
ipcMain.on('spotify-watch', (_, on) => watchSpotify(!!on));
ipcMain.handle('spotify-last', () => lastTitle);
ipcMain.on('quit', () => app.quit());

/* ---------- app ---------- */
app.on('second-instance', () => { if (win) win.show(); });
app.whenReady().then(() => {
  loadCfg();
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((s) => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  });
  createWindow(); buildTray();
  screen.on('display-metrics-changed', () => { if (win) win.setBounds(screen.getPrimaryDisplay().workArea); });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => watchSpotify(false));

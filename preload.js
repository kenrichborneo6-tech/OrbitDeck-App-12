const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (p) => ipcRenderer.invoke('cfg:set', p),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scan: (d) => ipcRenderer.invoke('scan', d),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  readHead: (p, n) => ipcRenderer.invoke('read-head', p, n),
  readLrc: (p) => ipcRenderer.invoke('read-lrc', p),
  lyrics: (o) => ipcRenderer.invoke('lyrics', o),
  cover: (o) => ipcRenderer.invoke('cover', o),
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  watchSpotify: (on) => ipcRenderer.send('spotify-watch', on),
  spotifyLast: () => ipcRenderer.invoke('spotify-last'),
  onSpotify: (cb) => ipcRenderer.on('spotify', (_, t) => cb(t)),
  onMenu: (cb) => ipcRenderer.on('menu', (_, k) => cb(k)),
  quit: () => ipcRenderer.send('quit')
});

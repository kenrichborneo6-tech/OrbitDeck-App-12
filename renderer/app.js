(() => {
const $ = s => document.querySelector(s), TAU = Math.PI * 2, api = window.api;
const sky = $('#sky'), viz = $('#viz'), lyr = $('#lyrics');
let cfg = {};

/* ---------- generated art ---------- */
function hash(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, s, o = 5) { let a = .5, f = 1, t = 0; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i); f *= 2; a *= .5; } return t; }
const sstep = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
function makeEarth() {
  const c = document.createElement('canvas'); c.width = 640; c.height = 320; const x = c.getContext('2d'), im = x.createImageData(640, 320);
  for (let py = 0; py < 320; py++) for (let px = 0; px < 640; px++) {
    const nx = px / 640 * 7, ny = py / 320 * 3.5, o = fbm(nx * .5, ny * .5, 7, 4), cl = sstep(.46, .74, fbm(nx, ny, 1, 6));
    let r = 18 + o * 48, g = 34 + o * 60, b = 52 + o * 62; r += (228 - r) * cl * .92; g += (236 - g) * cl * .92; b += (246 - b) * cl * .92;
    const i = (py * 640 + px) * 4; im.data[i] = r; im.data[i + 1] = g; im.data[i + 2] = b; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); return c; }
function makeCover(seed) {
  const S = 320, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), im = x.createImageData(S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const nx = px / S * 4.5, ny = py / S * 4.5, n = fbm(nx, ny, seed, 6), rd = 1 - Math.abs(2 * fbm(nx * 1.6, ny * 1.6, seed + 9, 5) - 1);
    const v = 40 + 215 * (.62 * n + .38 * rd * rd), i = (py * S + px) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); return c; }
const covers = [];
function coverFor(str) {
  const h = [...str].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  if (!covers[h]) { const cv = makeCover(11 + h * 7); covers[h] = { img: cv, thumb: cv.toDataURL('image/jpeg', .7) }; }
  return covers[h]; }
function drawCover(c, img, x, y, s) { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, m = Math.min(iw, ih); c.drawImage(img, (iw - m) / 2, (ih - m) / 2, m, m, x, y, s, s); }

/* ---------- state ---------- */
let mode = 'folder', tracks = [], idx = -1, shuffle = false, loopOne = false, playing = false, curKey = null, rotN = 0, curUrl = null;
const idleCover = coverFor('idle');
const idleTrack = { title: 'Pilih folder musik', artist: 'Klik ikon folder di kiri', img: idleCover.img, thumb: idleCover.thumb, lrc: null };
const waitTrack = { title: 'Menunggu Spotify…', artist: 'Putar lagu di Spotify', img: idleCover.img, thumb: idleCover.thumb, lrc: null };
const sys = { title: '', artist: '', img: null, thumb: '', lrc: null, dur: 0, playing: false, base: 0, since: 0, offset: 0 };
const cur = () => mode === 'system' ? (sys.title ? sys : waitTrack) : (tracks[idx] || idleTrack);
const note = t => { $('#hint').textContent = t || ''; };
const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';

/* ---------- audio ---------- */
let actx, analyser, freq, out, el, elSrc, sysSrc = null;
function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = actx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .72;
  freq = new Uint8Array(analyser.frequencyBinCount);
  out = actx.createGain(); analyser.connect(out); out.connect(actx.destination);
  el = new Audio(); el.addEventListener('ended', () => { if (!loopOne) next(); });
  elSrc = actx.createMediaElementSource(el); elSrc.connect(analyser);
}
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg' };

async function play(i) {
  if (mode !== 'folder' || !tracks[i]) return;
  ensureAudio(); try { await actx.resume(); } catch (e) {}
  idx = i; curKey = null; const t = tracks[i]; renderDeck(); note('');
  try {
    const buf = await api.readFile(t.path); if (i !== idx) return;
    const ext = (t.path.split('.').pop() || '').toLowerCase();
    const url = URL.createObjectURL(new Blob([buf], { type: MIME[ext] || 'audio/mpeg' }));
    if (curUrl) URL.revokeObjectURL(curUrl); curUrl = url;
    el.src = url; el.loop = loopOne; await el.play(); playing = true;
  } catch (e) { playing = false; note('File ini tidak bisa diputar.'); }
  syncBtn(); loadMeta(t);
}
function toggle() {
  if (mode === 'system') return;
  if (!el || !el.src) { if (tracks.length) play(idx < 0 ? 0 : idx); else pickFolder(); return; }
  if (playing) { el.pause(); playing = false; } else { actx.resume(); el.play().catch(() => {}); playing = true; }
  syncBtn();
}
function next() { const n = tracks.length; if (!n) return; play(shuffle && n > 1 ? (idx + 1 + Math.floor(Math.random() * (n - 1))) % n : (idx + 1) % n); }
function prev() { if (!tracks.length) return; if (el && el.currentTime > 3) { el.currentTime = 0; return; } play((idx - 1 + tracks.length) % tracks.length); }
function syncBtn() { $('#pp').setAttribute('d', playing && mode === 'folder' ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'); }

async function enterSystem() {
  ensureAudio(); if (el) el.pause(); playing = false; out.gain.value = 0;
  if (!sysSrc) {
    try {
      const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      st.getVideoTracks().forEach(t => t.stop());
      if (!st.getAudioTracks().length) throw new Error('no audio');
      sysSrc = actx.createMediaStreamSource(st);
    } catch (e) { note('Tidak bisa menangkap audio PC.'); return false; }
  }
  elSrc.disconnect(); sysSrc.connect(analyser); return true;
}
function leaveSystem() { if (actx) { if (sysSrc) sysSrc.disconnect(); elSrc.connect(analyser); out.gain.value = 1; } }
async function setMode(m, save = true) {
  if (m === 'system') { if (!(await enterSystem())) return; api.watchSpotify(true); }
  else { leaveSystem(); api.watchSpotify(false); }
  mode = m; curKey = null; if (save) api.setCfg({ mode });
  $('#sysb').classList.toggle('on', mode === 'system');
  $('#seek').hidden = mode === 'system'; $('#syncrow').hidden = mode !== 'system';
  ['#folder', '#shuf', '#loop', '#prev', '#play', '#next'].forEach(s => { $(s).style.display = mode === 'system' ? 'none' : ''; });
  if (mode === 'system') { const t = await api.spotifyLast(); handleTitle(t); }
  renderDeck(); syncBtn();
}

/* ---------- Spotify (window title: "Artist - Song") ---------- */
function handleTitle(raw) {
  const t = (raw || '').trim(), now = performance.now(), m = t.match(/^(.+?) - (.+)$/);
  if (m && !/^Spotify( (Free|Premium))?$/i.test(t)) {
    if (m[1] !== sys.artist || m[2] !== sys.title) newSysTrack(m[1], m[2]);
    if (!sys.playing) { sys.playing = true; sys.since = now; }
  } else if (sys.playing) { sys.base += now - sys.since; sys.playing = false; }
}
function newSysTrack(artist, title) {
  const c = coverFor(artist + title), mine = artist + '|' + title;
  Object.assign(sys, { artist, title, img: c.img, thumb: c.thumb, lrc: null, dur: 0, base: 0, since: performance.now(), playing: true });
  curKey = null; renderDeck();
  api.lyrics({ artist, title }).then(r => { if (sys.artist + '|' + sys.title !== mine || !r) return; sys.lrc = parseLrc(r.lrc); sys.dur = r.duration; curKey = null; renderDeck(); }).catch(() => {});
  api.cover({ artist, title }).then(u => { if (!u || sys.artist + '|' + sys.title !== mine) return; const im = new Image(); im.onload = () => { sys.img = im; sys.thumb = u; renderDeck(); }; im.src = u; }).catch(() => {});
}
function sysTime() {
  let t = (sys.base + (sys.playing ? performance.now() - sys.since : 0)) / 1000;
  if (sys.dur && t > sys.dur + 1) { sys.base = 0; sys.since = performance.now(); t = 0; }
  return Math.max(0, t + sys.offset);
}

/* ---------- lyrics ---------- */
function parseLrc(s) {
  const out = [];
  for (const line of String(s).split(/\r?\n/)) {
    const m = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]; if (!m.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const x of m) out.push({ t: Number(x[1]) * 60 + Number(x[2]), text }); }
  return out.sort((a, b) => a.t - b.t); }
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function setLyric(text) {
  lyr.textContent = '';
  text.split(/\s+/).filter(Boolean).forEach((w, i) => { const s = h('span', 'w' + (w.replace(/[^A-Za-z]/g, '').length <= 2 ? ' s' : ''), w); s.style.setProperty('--i', i); lyr.append(s); });
  lyr.style.setProperty('--rot', [-7, -4, -9, -5][rotN++ % 4] + 'deg'); }
function updateLyrics(time) {
  const t = cur(); let key, text;
  if (t.lrc && t.lrc.length) { let lo = -1; for (let i = 0; i < t.lrc.length; i++) { if (t.lrc[i].t <= time) lo = i; else break; } key = t.title + ':' + lo; text = lo >= 0 ? t.lrc[lo].text : t.title; }
  else { key = t.title + ':title'; text = t.title; }
  if (key !== curKey) { curKey = key; setLyric(text); } }

/* ---------- folder + tags ---------- */
const syncsafe = (u, p) => ((u[p] & 127) << 21) | ((u[p + 1] & 127) << 14) | ((u[p + 2] & 127) << 7) | (u[p + 3] & 127);
function decText(f) { const lab = ['windows-1252', 'utf-16', 'utf-16be', 'utf-8'][f[0]] || 'utf-8'; try { return new TextDecoder(lab).decode(f.subarray(1)).replace(/\0/g, '').trim(); } catch (e) { return ''; } }
function parseApic(f) {
  const enc = f[0]; let i = 1; while (i < f.length && f[i] !== 0) i++;
  let mime = String.fromCharCode(...f.subarray(1, i)); i += 2;
  if (enc === 0 || enc === 3) { while (i < f.length && f[i] !== 0) i++; i++; } else { while (i < f.length - 1 && !(f[i] === 0 && f[i + 1] === 0)) i += 2; i += 2; }
  if (mime.indexOf('/') < 0) mime = 'image/jpeg';
  return new Blob([f.subarray(i)], { type: mime }); }
async function readTags(path) {
  const res = await api.readHead(path, 2500000), u = new Uint8Array(res), d = new DataView(u.buffer, u.byteOffset, u.byteLength), out = {};
  if (u[0] !== 0x49 || u[1] !== 0x44 || u[2] !== 0x33) return out;
  const ver = u[3], end = Math.min(10 + syncsafe(u, 6), u.byteLength); let p = 10;
  while (p + 10 <= end) {
    const id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const sz = ver === 4 ? syncsafe(u, p + 4) : d.getUint32(p + 4); p += 10; if (sz <= 0 || p + sz > end) break;
    const fr = u.subarray(p, p + sz);
    if (id === 'TIT2') out.title = decText(fr); else if (id === 'TPE1') out.artist = decText(fr); else if (id === 'APIC' && !out.pic) out.pic = parseApic(fr);
    p += sz; }
  return out; }
async function loadTags(t) {
  if (t.tagged) return; t.tagged = true;
  try {
    const tg = await readTags(t.path);
    if (tg.title) t.title = tg.title; if (tg.artist) t.artist = tg.artist;
    if (tg.pic) { const u = URL.createObjectURL(tg.pic), im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; }); if (im.naturalWidth) { t.img = im; t.thumb = u; } }
  } catch (e) {}
}
async function loadMeta(t) {
  await loadTags(t); renderDeck();
  if (t.lrc !== undefined) return; t.lrc = null;
  try {
    let s = await api.readLrc(t.path), lr = s ? parseLrc(s) : null;
    if (!lr || !lr.length) { const r = await api.lyrics({ artist: t.artist === 'Musik kamu' ? '' : t.artist, title: t.title, duration: el && el.duration || 0 }); lr = r ? parseLrc(r.lrc) : null; }
    if (lr && lr.length) { t.lrc = lr; curKey = null; }
  } catch (e) {}
}
async function loadFolder(dir) {
  note('Memuat lagu…');
  const files = await api.scan(dir);
  tracks = files.map(f => { const c = coverFor(f.name); return { path: f.path, title: f.name, artist: 'Musik kamu', img: c.img, thumb: c.thumb }; });
  idx = -1; note(tracks.length ? '' : 'Tidak ada file musik di folder ini.'); renderDeck();
  for (const t of tracks.slice(0, 60)) { await loadTags(t); renderDeckSoon(); }
}
async function pickFolder() { const d = await api.pickFolder(); if (d) { if (mode !== 'folder') await setMode('folder'); loadFolder(d); } }

/* ---------- deck ---------- */
let deckTimer = 0;
function renderDeckSoon() { clearTimeout(deckTimer); deckTimer = setTimeout(renderDeck, 250); }
function renderDeck() {
  const t = cur(); $('#ttl').textContent = t.title; $('#art').textContent = t.artist; $('#nowimg').src = t.thumb;
  const list = $('#list'); list.textContent = '';
  if (mode === 'folder') tracks.forEach((tr, i) => {
    const li = h('li', i === idx ? 'cur' : ''), b = h('button'), im = h('img'), tx = h('div', 't'); im.src = tr.thumb; im.alt = '';
    tx.append(h('b', '', tr.title), h('small', '', tr.artist)); b.append(im, tx); b.onclick = () => play(i); li.append(b); list.append(li); });
  const c = list.querySelector('.cur'); if (c) list.scrollTop = c.offsetTop - list.offsetTop - 10;
  if (mode === 'system') note(sys.title ? (sys.lrc ? '' : 'Lirik belum ketemu untuk lagu ini.') : 'Putar lagu di aplikasi Spotify desktop.');
}
$('#play').onclick = toggle; $('#next').onclick = next; $('#prev').onclick = prev; $('#folder').onclick = pickFolder; $('#quit').onclick = () => api.quit();
$('#shuf').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('on', shuffle); };
$('#loop').onclick = e => { loopOne = !loopOne; e.currentTarget.classList.toggle('on', loopOne); if (el) el.loop = loopOne; };
$('#sysb').onclick = () => setMode(mode === 'system' ? 'folder' : 'system');
$('#bar').onclick = e => { if (mode !== 'folder' || !el || !isFinite(el.duration)) return; const r = e.currentTarget.getBoundingClientRect(); el.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * el.duration; };
const bump = d => { sys.offset = Math.round((sys.offset + d) * 10) / 10; $('#off').textContent = (sys.offset > 0 ? '+' : '') + sys.offset.toFixed(1) + 's'; };
$('#lm').onclick = () => bump(.5); $('#lp').onclick = () => bump(-.5);
api.onSpotify(t => { if (mode === 'system') handleTitle(t); });
api.onMenu(k => { if (k === 'folder') pickFolder(); else if (k === 'system') setMode(mode === 'system' ? 'folder' : 'system'); else if (k === 'earth') api.getCfg().then(c => { cfg = c; applyEarth(); }); });

/* click-through everywhere except the deck */
let ignoring = true;
addEventListener('mousemove', e => { const over = !!(e.target.closest && e.target.closest('.hit')); if (over === ignoring) { ignoring = !over; api.setIgnore(ignoring); } });

/* ---------- drawing ---------- */
let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0, earth = null, stars = [];
function layout() {
  W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  for (const c of [sky, viz]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  cx = W * .68; cy = H * .47; R = Math.min(W, H) * .15; drawSky(); }
function applyEarth() { sky.style.display = cfg.earth ? 'block' : 'none'; if (cfg.earth) drawSky(); }
function drawSky() {
  if (!cfg.earth) return;
  const c = sky.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); if (!earth) earth = makeEarth();
  c.fillStyle = '#02030a'; c.fillRect(0, 0, W, H);
  if (!stars.length) for (let i = 0; i < 300; i++) stars.push([Math.random(), Math.random() * .7, Math.random() * 1.3 + .2, Math.random() * .6 + .25]);
  for (const s of stars) { c.fillStyle = 'rgba(235,240,255,' + s[3] + ')'; c.beginPath(); c.arc(s[0] * W, s[1] * H, s[2] * .7, 0, TAU); c.fill(); }
  const PR = Math.max(W, H) * 1.5, px = W * .5, py = H * .32 + PR;
  let g = c.createRadialGradient(px, py, PR - 6, px, py, PR + H * .16);
  g.addColorStop(0, 'rgba(150,196,255,.55)'); g.addColorStop(.1, 'rgba(90,150,230,.25)'); g.addColorStop(1, 'rgba(60,110,200,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.save(); c.beginPath(); c.arc(px, py, PR, 0, TAU); c.clip(); c.drawImage(earth, -W * .15, H * .28, W * 1.3, W * .65);
  g = c.createLinearGradient(0, H * .3, 0, H); g.addColorStop(0, 'rgba(2,4,10,.05)'); g.addColorStop(.5, 'rgba(2,4,10,.5)'); g.addColorStop(1, 'rgba(2,4,10,.85)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  g = c.createRadialGradient(px, py, PR * .97, px, py, PR); g.addColorStop(0, 'rgba(170,205,255,0)'); g.addColorStop(1, 'rgba(190,220,255,.45)'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  c.strokeStyle = 'rgba(205,228,255,.8)'; c.lineWidth = 1.6; c.shadowColor = 'rgba(130,180,255,.9)'; c.shadowBlur = 12; c.beginPath(); c.arc(px, py, PR, 0, TAU); c.stroke(); c.shadowBlur = 0; }

const N = 64, sm = new Float32Array(N); let bs = 0, rot = 0, lastSec = -1;
function frame(t) {
  requestAnimationFrame(frame);
  const c = viz.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const live = !!analyser && (mode === 'system' || playing) && actx.state === 'running';
  if (live) analyser.getByteFrequencyData(freq);
  for (let i = 0; i < N; i++) {
    if (live) { const f = 2 + Math.pow(i / (N - 1), 1.6) * 340, b = Math.floor(f), v = (freq[b] * .6 + freq[b + 1] * .4) / 255 * (.72 + i / N * .7); sm[i] = Math.max(v, sm[i] * .87); }
    else { const v = .13 + .08 * Math.sin(t / 900 + i * .35) + .05 * Math.sin(t / 430 + i * .9); sm[i] += (v - sm[i]) * .08; } }
  let bsT = .12 + .05 * Math.sin(t / 700); if (live) { bsT = 0; for (let i = 1; i < 6; i++) bsT += freq[i]; bsT = bsT / 5 / 255; }
  bs += (bsT - bs) * .3; rot += .0006 + bs * .004;
  const r = R * (1 + bs * .05), base = R * 1.09, total = N * 2, maxL = R * 1.05;
  const g = c.createRadialGradient(cx, cy, r * .8, cx, cy, r * 2.3); g.addColorStop(0, 'rgba(255,240,210,' + (.2 + bs * .3).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,240,210,0)');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r * 2.3, 0, TAU); c.fill();
  c.save(); c.lineCap = 'round'; c.strokeStyle = '#f6efdc'; c.shadowColor = 'rgba(255,244,214,.9)'; c.shadowBlur = 14;
  c.lineWidth = Math.max(2, TAU * base / total * .42); c.beginPath();
  for (let j = 0; j < total; j++) { const k = N - 1 - (j < N ? j : total - 1 - j), L = 3 + Math.pow(sm[k], 1.4) * maxL, a = -Math.PI / 2 + (j + .5) / total * TAU, co = Math.cos(a), si = Math.sin(a);
    c.moveTo(cx + co * base, cy + si * base); c.lineTo(cx + co * (base + L), cy + si * (base + L)); }
  c.stroke(); c.lineWidth = 2.6; c.beginPath();
  for (let j = 0; j < 120; j++) { const a = j / 120 * TAU + rot * .5, rr = r * 1.035, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; c.moveTo(x, y); c.lineTo(x + .1, y); }
  c.stroke(); c.restore();
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip(); c.translate(cx, cy); c.rotate(rot); drawCover(c, cur().img, -r, -r, 2 * r); c.restore();
  const sh = c.createRadialGradient(cx, cy, r * .6, cx, cy, r); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = sh; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
  const time = mode === 'system' ? sysTime() : (el && el.src ? el.currentTime : 0);
  updateLyrics(time);
  const sec = Math.floor(time * 2);
  if (sec !== lastSec && mode === 'folder') { lastSec = sec; const d = el && el.duration; $('#tcur').textContent = fmt(time); $('#tend').textContent = fmt(d); $('#fill').style.width = (d ? time / d * 100 : 0) + '%'; }
}

/* ---------- start ---------- */
addEventListener('resize', layout);
(async () => {
  try { cfg = await api.getCfg() || {}; } catch (e) { cfg = {}; }
  layout(); applyEarth(); renderDeck(); syncBtn(); requestAnimationFrame(frame);
  if (cfg.folder) loadFolder(cfg.folder).catch(() => {});
  if (cfg.mode === 'system') setMode('system', false);
})();
})();

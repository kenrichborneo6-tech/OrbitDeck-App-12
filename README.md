# OrbitDeck

Widget musik transparan di desktop Windows: cover bulat dengan spectrum radial, lirik besar yang animasi, dan daftar lagu di pojok kiri bawah.

## Cara dapat OrbitDeck.exe

**A. Di PC Windows kamu (paling gampang)**
1. Install Node.js (versi LTS) dari https://nodejs.org
2. Klik dua kali `build.bat`
3. Tunggu beberapa menit. Hasilnya: `dist\OrbitDeck.exe` (satu file, tanpa installer)

**B. Tanpa install apa-apa, pakai GitHub**
1. Buat repo GitHub baru, upload semua isi folder ini
2. Buka tab Actions, jalankan "Build OrbitDeck.exe" (atau tunggu otomatis setelah upload)
3. Setelah hijau, download artifact `OrbitDeck-exe`

Mau coba tanpa build: `run-dev.bat`.

## Cara pakai
- Klik ikon folder (kiri bawah) dan pilih folder musik. Klik lagu untuk memutar.
- Tray (ikon dekat jam) : latar Bumi, selalu di atas, jalan saat Windows start, keluar.
- Lirik: otomatis dicari di lrclib.net (butuh internet). Kalau ada file `.lrc` dengan nama sama di sebelah lagunya, itu yang dipakai.
- Cover: dibaca dari tag MP3. Lagu lain pakai cover generik.
- **Mode Spotify / audio PC** (ikon radio): spectrum mengikuti semua suara yang keluar dari PC. Judul dan artis dibaca dari jendela Spotify desktop, lirik dan cover dicari otomatis. Waktu lirik dihitung sejak lagu ganti, jadi kalau meleset pakai tombol Geser lirik (+/−).
- Jendela transparan tembus klik, kecuali panel player. Panel tidak otomatis di belakang aplikasi lain; kalau mau selalu di atas, aktifkan di tray.

## Batasan
- Spotify tidak memberi API pemutar ke aplikasi luar, jadi daftar lagu Spotify tidak bisa ditampilkan. Daftar lagu hanya untuk folder musik.
- Belum bisa jadi wallpaper sungguhan di belakang ikon desktop.

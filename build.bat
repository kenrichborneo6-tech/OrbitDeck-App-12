@echo off
chcp 65001 >nul
echo === Build OrbitDeck.exe ===
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Install dulu dari https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 ( echo npm install gagal & pause & exit /b 1 )
call npm run dist
if errorlevel 1 ( echo Build gagal & pause & exit /b 1 )
echo.
echo SELESAI. File exe ada di: dist\OrbitDeck.exe
pause

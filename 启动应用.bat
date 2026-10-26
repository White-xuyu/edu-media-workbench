@echo off
chcp 65001 >nul
title AI New Media Toolbox - Launcher
cd /d "%~dp0"

rem ---- Pick the WorkBuddy managed Node if present (path-agnostic) ----
set "NODE_BIN="
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
  if exist "%%D\node.exe" set "NODE_BIN=%%D"
)
if defined NODE_BIN set "PATH=%NODE_BIN%;%PATH%"

echo ==========================================
echo   AI New Media Toolbox - Starting
echo ==========================================
echo.

echo [0/4] Clearing previous instances...
node "%~dp0kill-ports.js"

echo [1/4] Info Platform  - Backend API   (port 3001)
start "PLATFORM-BACKEND" /min cmd /c "cd /d "%~dp0edu-info-platform\server" && npx tsx src/index.ts"

echo [2/4] Info Platform  - Frontend      (port 5173)
start "PLATFORM-FRONTEND" /min cmd /c "cd /d "%~dp0edu-info-platform\client" && npm run dev"

echo [3/4] Media Workbench                (port 4000)
start "MEDIA-WORKBENCH" /min cmd /c "cd /d "%~dp0edu-media-workbench" && node server.js"

echo.
echo [4/4] Waiting for all services to be really ready...
echo       (this replaces the old blind 12-second wait)
node "%~dp0wait-ready.js"

start "" http://localhost:5173
start "" http://localhost:4000

echo.
echo ==========================================
echo   All services started!
echo.
echo   Info Platform   : http://localhost:5173
echo   Media Workbench : http://localhost:4000
echo   AI Assistant is on the left sidebar of
echo   the Info Platform  ("AI 助手")
echo ==========================================
echo.
echo Notes:
echo   - Keep the minimized windows running (closing them stops the apps)
echo   - Xiaohongshu publish: click "Open publish browser" in the panel
echo     and scan QR code once
echo   - To stop: run  停止应用.bat
echo.
pause

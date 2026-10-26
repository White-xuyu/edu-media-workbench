@echo off
chcp 65001 >nul
title Stop AI New Media Toolbox
cd /d "%~dp0"

echo 正在停止端口 3001 / 5173 / 4000 上的服务...

for %%p in (3001 5173 4000) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr LISTENING') do (
    echo   停止进程 PID %%a  (端口 %%p)
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo.
echo 已全部停止。
pause

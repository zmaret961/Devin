@echo off
rem Double-click to start the Devin Oncall Simulator (Windows).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org ^(LTS^), install it, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo The demo needs git. Download it from https://git-scm.com/download/win, install it, then double-click this file again.
  start https://git-scm.com/download/win
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing ^(this takes about a minute^)...
  call npm install || (pause & exit /b 1)
)
start "" cmd /c "timeout /t 8 >nul & start http://localhost:4100"
echo Starting... the dashboard will open in your browser. Close this window to stop the demo.
call npm run demo
pause

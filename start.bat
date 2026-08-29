@echo off
rem eEPUB Calibre Helper launcher (Windows)
rem Double-click this file to set up (first run only) and start the helper.
rem Closing this window stops the helper.
rem
rem NOTE: this file intentionally contains ASCII text only. Batch files with
rem non-ASCII (e.g. Japanese) text are unreliable across different Windows
rem console code pages (cmd.exe's parser can misinterpret multi-byte bytes
rem as command separators and corrupt the whole script). See README.md for
rem the Japanese explanation of what this does.

setlocal
cd /d "%~dp0"

title eEPUB Calibre Helper

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js was not found.
  echo Please install Node.js first, then double-click this file again.
  echo   https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo First run: installing dependencies, this may take a moment...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. See the log above.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo  Starting eEPUB Calibre Helper
echo  Keep this window open while you use it in eEPUB.
echo  Closing this window stops the helper.
echo ============================================================
echo.

call npm start

echo.
echo Helper stopped.
pause

@echo off
title AI Project Readiness Prototype
cd /d "%~dp0.."
echo Starting AI Project Readiness prototype...
echo.
where py >nul 2>nul
if not errorlevel 1 (
  py -3 server.py
  goto finished
)
where python >nul 2>nul
if not errorlevel 1 (
  python server.py
  goto finished
)
echo Python 3 was not found. Install Python 3 and enable "Add Python to PATH".
:finished
echo.
echo The prototype stopped. Press any key to close this window.
pause >nul

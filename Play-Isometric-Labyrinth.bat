@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv || goto :error
)
".venv\Scripts\python.exe" -m pip show pygame-ce >nul 2>&1 || (
  ".venv\Scripts\python.exe" -m pip install -r requirements-side-scroller.txt || goto :error
)
".venv\Scripts\python.exe" isometric_game\main.py
exit /b %errorlevel%
:error
echo.
echo Could not prepare the game. Install Python 3 and try again.
pause
exit /b 1

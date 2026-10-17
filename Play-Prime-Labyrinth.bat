@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Creating the game's Python environment...
    python -m venv .venv
    if errorlevel 1 goto fail
)
".venv\Scripts\python.exe" -c "import pygame" >nul 2>&1
if errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install -r requirements-side-scroller.txt
    if errorlevel 1 goto fail
)
".venv\Scripts\python.exe" prime_side_scroller.py %*
if errorlevel 1 goto fail
exit /b 0
:fail
echo.
echo The game could not start. Please check the message above.
pause
exit /b 1

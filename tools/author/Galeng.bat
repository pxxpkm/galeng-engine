@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PROJECT=%~1"
if "%PROJECT%"=="" set "PROJECT=examples\prologue"

if not exist "galeng-host.exe" (
  echo [galeng] galeng-host.exe missing. Run pack-author.bat from the repo, or unzip the full author pack.
  pause
  exit /b 1
)
if not exist "editor\index.html" (
  echo [galeng] editor\index.html missing. This folder is incomplete.
  pause
  exit /b 1
)
if not exist "%PROJECT%\galeng.json" (
  echo [galeng] No project file: %PROJECT%\galeng.json
  echo Drag a project folder onto this file, or:
  echo   Galeng.bat D:\MyGame
  pause
  exit /b 1
)

echo [galeng] Opening editor at http://127.0.0.1:3847
echo [galeng] Close this window to stop the editor.
galeng-host.exe --project "%PROJECT%" --static editor --open
if errorlevel 1 (
  echo [galeng] host exited with an error.
  pause
  exit /b 1
)

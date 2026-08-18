@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist Cargo.toml (
  echo [galeng] Run pack-author.bat from the repo root.
  exit /b 1
)

echo [galeng] building host / player (release)
cargo build -p galeng-host --release
if errorlevel 1 exit /b 1
cargo build -p galeng-player --release
if errorlevel 1 exit /b 1

echo [galeng] building editor
call pnpm --filter @galeng/editor build
if errorlevel 1 exit /b 1

if not exist "apps\editor\dist\index.html" (
  echo [galeng] apps\editor\dist\index.html missing after vite build.
  exit /b 1
)

set "OUT=out\galeng-editor"
echo [galeng] assembling %OUT%
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%\editor"
mkdir "%OUT%\examples\prologue"

copy /y "target\release\galeng-host.exe" "%OUT%\" >nul
copy /y "target\release\galeng-player.exe" "%OUT%\" >nul
copy /y "third_party\SDL2\lib\x64\SDL2.dll" "%OUT%\" >nul
xcopy /e /i /q /y "apps\editor\dist\*" "%OUT%\editor\" >nul
copy /y "examples\prologue\galeng.json" "%OUT%\examples\prologue\" >nul
copy /y "examples\prologue\README.md" "%OUT%\examples\prologue\" >nul
xcopy /e /i /q /y "examples\prologue\scenario" "%OUT%\examples\prologue\scenario\" >nul
xcopy /e /i /q /y "examples\prologue\assets" "%OUT%\examples\prologue\assets\" >nul
copy /y "tools\author\Galeng.bat" "%OUT%\Galeng.bat" >nul
copy /y "tools\author\README.txt" "%OUT%\README.txt" >nul

if exist "%OUT%\examples\prologue\export" rmdir /s /q "%OUT%\examples\prologue\export"

echo [galeng] packed %CD%\%OUT%
echo [galeng] zip that folder, or run Galeng.bat inside it.
exit /b 0

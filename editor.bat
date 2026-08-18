@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Dev helper: host :3847 + Vite :5173. Does not start the player.
cd /d "%~dp0"
if not exist "Cargo.toml" (
  echo [galeng] Put this file in the repo root. See PIT-013.
  exit /b 1
)
if not exist "apps\editor\package.json" (
  echo [galeng] apps\editor missing. cwd must be the repo root.
  exit /b 1
)

set "ACTION=%~1"
set "PROJECT=%~2"
if "%PROJECT%"=="" set "PROJECT=examples\prologue"

if /i "%ACTION%"=="" goto :menu
if /i "%ACTION%"=="start" goto :start
if /i "%ACTION%"=="open" goto :start
if /i "%ACTION%"=="on" goto :start
if /i "%ACTION%"=="stop" goto :stop
if /i "%ACTION%"=="close" goto :stop
if /i "%ACTION%"=="off" goto :stop
if /i "%ACTION%"=="restart" goto :restart
if /i "%ACTION%"=="reboot" goto :restart
if /i "%ACTION%"=="help" goto :usage
if /i "%ACTION%"=="-h" goto :usage
echo [galeng] unknown command: %ACTION%
goto :usage

:menu
echo.
echo   Galeng editor
echo   1  start    host + Vite, then http://127.0.0.1:5173
echo   2  stop     host / Vite only. Leaves the player alone.
echo   3  restart  stop then start. Use this after host code changes. PIT-014
echo   0  quit
echo.
set "CHOICE="
set /p "CHOICE=Choose 1/2/3/0: "
if "%CHOICE%"=="1" goto :start
if "%CHOICE%"=="2" goto :stop
if "%CHOICE%"=="3" goto :restart
if "%CHOICE%"=="0" exit /b 0
echo Invalid choice.
goto :menu

:usage
echo Usage:
echo   editor.bat                 menu
echo   editor.bat start [project] default project is examples\prologue
echo   editor.bat stop
echo   editor.bat restart [project]
echo Open http://127.0.0.1:5173  not localhost.
exit /b 2

:stop
echo [galeng] Stopping editor on 3847 / 5173. Not touching galeng-player.
call :stop_quiet
echo [galeng] Stopped.
if /i "%ACTION%"=="" pause
exit /b 0

:restart
echo [galeng] Restarting.
set "ACTION=restart"
call :stop_quiet
goto :start

:stop_quiet
call :kill_titled galeng-host
call :kill_titled galeng-vite
call :kill_port 3847
call :kill_port 5173
taskkill /F /IM galeng-host.exe >nul 2>&1
call :wait_port_free 3847 15
call :wait_port_free 5173 15
goto :eof

:start
if not exist "%PROJECT%\galeng.json" (
  echo [galeng] No project file: %PROJECT%\galeng.json
  if /i "%~1"=="" pause
  exit /b 1
)

call :port_listening 3847
if not errorlevel 1 (
  echo [galeng] host already on 3847. If you just changed code, run: editor.bat restart
) else (
  echo [galeng] starting host: %PROJECT%
  start "galeng-host" /D "%CD%" cmd /k cargo run -p galeng-host -- --project "%PROJECT%"
)

call :port_listening 5173
if not errorlevel 1 (
  echo [galeng] Vite already on 5173.
) else (
  echo [galeng] starting Vite
  start "galeng-vite" /D "%CD%" cmd /k pnpm --filter @galeng/editor dev
)

echo [galeng] waiting for http://127.0.0.1:5173 ...
call :wait_port_up 5173 60
if errorlevel 1 (
  echo [galeng] Vite timed out. Check the galeng-vite window.
  if /i "%~1"=="" pause
  exit /b 1
)
echo [galeng] opening browser at 127.0.0.1 not localhost
start "" "http://127.0.0.1:5173"
if /i "%~1"=="" pause
exit /b 0

:kill_titled
taskkill /FI "WINDOWTITLE eq %~1*" /T /F >nul 2>&1
goto :eof

:kill_port
set "KPORT=%~1"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%KPORT% " ^| findstr LISTENING') do (
  if not "%%P"=="0" (
    echo [galeng] killing PID %%P on port %KPORT%
    taskkill /F /PID %%P >nul 2>&1
  )
)
goto :eof

:port_listening
netstat -ano | findstr ":%~1 " | findstr LISTENING >nul
goto :eof

:wait_port_free
set "WPORT=%~1"
set "WMAX=%~2"
set /a WTRY=0
:wait_port_free_loop
call :port_listening %WPORT%
if errorlevel 1 goto :eof
set /a WTRY+=1
if !WTRY! GEQ %WMAX% (
  echo [galeng] warning: port %WPORT% still in use
  goto :eof
)
timeout /t 1 /nobreak >nul
goto :wait_port_free_loop

:wait_port_up
set "UPORT=%~1"
set "UMAX=%~2"
set /a UTRY=0
:wait_port_up_loop
call :port_listening %UPORT%
if not errorlevel 1 (
  exit /b 0
)
set /a UTRY+=1
if !UTRY! GEQ %UMAX% (
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_port_up_loop

@echo off
setlocal
REM Q04 release smoke. Requires Python 3 (py -3 or python).
set "HERE=%~dp0"
where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 "%HERE%release_smoke.py" %*
  exit /b %ERRORLEVEL%
)
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%HERE%release_smoke.py" %*
  exit /b %ERRORLEVEL%
)
echo [galeng-smoke] Python 3 is required. Install it, then run: py -3 tools\release_smoke.py
exit /b 1

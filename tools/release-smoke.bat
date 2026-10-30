@echo off
setlocal
REM Q04 release smoke. Requires Python 3 (py -3 or python).
REM %ERRORLEVEL% inside a parenthesized block is expanded when the block is
REM parsed, before py/python runs, so exit /b there returns the pre-call
REM status. The python call and exit /b stay on top-level lines.
set "HERE=%~dp0"
where py >nul 2>&1
if %ERRORLEVEL%==0 goto :run_py
where python >nul 2>&1
if %ERRORLEVEL%==0 goto :run_python
echo [galeng-smoke] Python 3 is required. Install it, then run: py -3 tools\release_smoke.py
exit /b 1

:run_py
py -3 "%HERE%release_smoke.py" %*
exit /b %ERRORLEVEL%

:run_python
python "%HERE%release_smoke.py" %*
exit /b %ERRORLEVEL%

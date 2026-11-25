@echo off
rem Serves this folder at http://localhost:8642 and opens it. Browsers don't run the map extractor
rem from a page opened straight off the disk (file://), so use this to run the page locally.
setlocal
cd /d "%~dp0"
set "PY="
for %%R in ("%USERPROFILE%\anaconda3" "%USERPROFILE%\miniconda3" "%LOCALAPPDATA%\anaconda3" "%ProgramData%\anaconda3") do (
  if not defined PY if exist "%%~R\python.exe" set "PY=%%~R\python.exe"
)
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Couldn't find Python. Install Python 3, or use the hosted page instead.
  pause
  exit /b 1
)
echo Serving this folder at http://localhost:8642  (close this window to stop)
start "" http://localhost:8642/
"%PY%" -m http.server 8642 --bind 127.0.0.1

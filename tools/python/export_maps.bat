@echo off
setlocal
cd /d "%~dp0"
title OoT Height Compare - map export

set "NUP=%~1"
if not "%NUP%"=="" goto havenup
echo Drag your Ocarina of Time .nup file into this window, then press Enter:
set /p "NUP="
:havenup
set "NUP=%NUP:"=%"
if not exist "%NUP%" (
  echo Can't find "%NUP%".
  pause
  exit /b 1
)

rem Find Python: Anaconda / Miniconda first, then whatever is on PATH.
set "PY="
for %%R in ("%USERPROFILE%\anaconda3" "%USERPROFILE%\miniconda3" "%LOCALAPPDATA%\anaconda3" "%ProgramData%\anaconda3") do (
  if not defined PY if exist "%%~R\python.exe" (
    set "PY=%%~R\python.exe"
    set "PATH=%%~R;%%~R\Library\mingw-w64\bin;%%~R\Library\usr\bin;%%~R\Library\bin;%%~R\Scripts;%PATH%"
  )
)
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Couldn't find Python. Install Anaconda or Python 3, then run this again.
  pause
  exit /b 1
)

"%PY%" -c "import zstandard, numpy" >nul 2>nul || "%PY%" -m pip install zstandard numpy

echo.
echo Exporting every map. This takes a while: Hyrule Field alone is about 2 minutes.
echo.
"%PY%" oot_height_export.py all --nup "%NUP%" --out maps

echo.
echo Done. Your map files are in: %~dp0maps
echo Open the OoT Height Compare page and drag the .ohm.gz files onto it.
pause

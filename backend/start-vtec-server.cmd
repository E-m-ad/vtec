@echo off
cd /d "%~dp0"

echo ==================================
echo Starting VTEC ERP server...
echo ==================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not installed or not added to PATH.
  echo Install Node.js first.
  pause
  exit /b 1
)

if not exist package.json (
  echo ERROR: package.json was not found.
  echo Put this file inside your project folder.
  pause
  exit /b 1
)

start "" cmd /c "timeout /t 3 >nul && start http://localhost:5000"

npm run start

echo.
echo Server stopped or crashed.
pause
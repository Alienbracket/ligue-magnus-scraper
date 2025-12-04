@echo off
title Ligue Magnus Stats Scraper - Installation
cd /d "%~dp0"

echo ╔════════════════════════════════════════╗
echo ║   Ligue Magnus Stats Scraper Setup   ║
echo ╚════════════════════════════════════════╝
echo.

REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Node.js is NOT installed
    echo.
    echo Please install Node.js first:
    echo 1. Visit https://nodejs.org/
    echo 2. Download the LTS version
    echo 3. Run the installer
    echo 4. Restart this script after installation
    echo.
    pause
    exit /b 1
) else (
    echo [✓] Node.js is installed
)

REM Check Node version
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    Version: %NODE_VERSION%
echo.

REM Install dependencies
echo Installing dependencies...
echo This may take a few minutes as Puppeteer downloads Chromium...
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo [X] Installation failed
    echo.
    pause
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════╗
echo ║      Installation Complete!           ║
echo ╚════════════════════════════════════════╝
echo.
echo To start the scraper:
echo   1. Double-click 'start.bat'
echo   2. Or run: node auto-scraper.js
echo.
echo To run manually:
echo   - Scrape once: node scraper-to-xml.js
echo   - Start HTTP server: node http-server.js
echo.
echo Configuration file: config.json
echo Logs will be saved to: logs/
echo.
pause

@echo off
title Ligue Magnus Stats Scraper
cd /d "%~dp0"

echo ╔════════════════════════════════════════╗
echo ║   Ligue Magnus Stats Auto-Scraper    ║
echo ╚════════════════════════════════════════╝
echo.
echo Starting system...
echo.

REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM Start the auto-scraper
echo Starting auto-scraper...
echo.
node src/auto-scraper.js

REM If auto-scraper exits, pause to see error
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Auto-scraper exited with error code %errorlevel%
)

pause

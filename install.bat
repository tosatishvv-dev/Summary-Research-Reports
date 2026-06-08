@echo off
title Commodity News Intelligence - Installer
echo =================================================================
echo             COMMODITY NEWS INTELLIGENCE INSTALLER
echo =================================================================
echo.

:: Check Node.js installation
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this system!
    echo.
    echo Please install NodeJS - Recommended Version 20 LTS or 22 LTS.
    echo You can download it from: https://nodejs.org/
    echo.
    echo Press any key to open the Node.js website and exit...
    pause >nul
    start https://nodejs.org/
    exit /b
)

echo [v] Node.js found. Installing dependencies...
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed. Please check your internet connection or build tools.
    pause
    exit /b
)

echo.
echo =================================================================
echo [v] SUCCESS: All dependencies have been installed successfully!
echo =================================================================
echo.
echo Now you can run the application using 'run_dev.bat'.
echo.
pause

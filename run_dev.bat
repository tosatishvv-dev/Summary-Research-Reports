@echo off
title Commodity News Intelligence - Dev Server
echo =================================================================
echo             COMMODITY NEWS INTELLIGENCE SERVER
echo =================================================================
echo.

:: Check Node.js installation
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Please run 'install.bat' first.
    pause
    exit /b
)

:: Check if node_modules exists
if not exist node_modules (
    echo [WARNING] 'node_modules' folder not found.
    echo Running installer first to fetch dependencies...
    echo.
    call install.bat
)

:: Handle .env file creation
if not exist .env (
    echo [INFO] Creating local '.env' file from '.env.example'...
    copy .env.example .env >nul
    echo Please open '.env' in a text editor to set your GEMINI_API_KEY.
)

:: Set our custom port to 4000 to avoid conflict with port 3000
set PORT=4000
set LOCAL_PORT=4000

echo.
echo -----------------------------------------------------------------
echo Starting the application on: http://localhost:4000
echo -----------------------------------------------------------------
echo.
call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The server stopped unexpectedly.
    pause
)

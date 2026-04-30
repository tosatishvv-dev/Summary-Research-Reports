@echo off
echo Starting Summary & Research Reports Development Server...
echo The app will open in your default browser at http://localhost:4000 in a few seconds.

:: Open the browser after a 4-second delay to give the server time to start
start cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:4000"

:: Start the application
npm run dev

pause

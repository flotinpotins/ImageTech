@echo off
chcp 65001 >nul
echo ========================================
echo    AI Image Generator Development
echo ========================================
echo.
echo Starting development servers...
echo.

REM Kill all Node.js related processes
echo Stopping existing processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im tsx.exe >nul 2>&1

REM Wait for processes to stop
ping 127.0.0.1 -n 3 >nul

echo Starting backend server...
echo.

REM Start backend server in new window
start "Backend Server" cmd /k "chcp 65001 >nul && cd /d "%~dp0server" && echo Backend server starting... && npm run dev"

REM Wait for backend to start
ping 127.0.0.1 -n 4 >nul

echo Starting frontend server...
echo.

REM Start frontend server in new window
start "Frontend Server" cmd /k "chcp 65001 >nul && cd /d "%~dp0" && echo Frontend server starting... && npx vite --port 3000"

echo.
echo ========================================
echo Development servers started!
echo ========================================
echo Backend server: http://localhost:3001
echo Frontend server: http://localhost:3000
echo.
echo Features:
echo - Multiple AI image generation models
echo - Token balance query function
echo - Batch generation and history
echo - FLUX.1 Kontext Multi model support
echo.
echo Press any key to exit...
pause >nul
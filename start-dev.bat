@echo off
chcp 65001 >nul
echo Starting development servers...

REM Kill all Node.js related processes
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im tsx.exe >nul 2>&1

REM Wait for processes to stop
ping 127.0.0.1 -n 3 >nul

echo Starting backend server...

REM Start backend server in new window
start "Backend Server" cmd /k "cd /d "%~dp0server" && npm run dev"

REM Wait for backend to start
ping 127.0.0.1 -n 4 >nul

echo Starting frontend server...

REM Start frontend server in new window
start "Frontend Server" cmd /k "cd /d "%~dp0" && npx vite --port 3000"

echo Development servers started!
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo Press any key to exit...
pause >nul
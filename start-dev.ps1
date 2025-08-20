# Development Environment Startup Script
# Automatically kill existing processes and start frontend/backend servers

Write-Host "Stopping existing development servers..." -ForegroundColor Yellow

# Kill all Node.js related processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "tsx" -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait for processes to stop completely
Start-Sleep -Seconds 2

Write-Host "Starting backend server..." -ForegroundColor Green

# Start backend server in new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\server'; npm run dev"

# Wait for backend to start
Start-Sleep -Seconds 3

Write-Host "Starting frontend server..." -ForegroundColor Green

# Start frontend server in new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; npx vite --port 3000"

Write-Host "Development servers started!" -ForegroundColor Cyan
Write-Host "Backend server: http://localhost:3001" -ForegroundColor White
Write-Host "Frontend server: http://localhost:3000" -ForegroundColor White
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
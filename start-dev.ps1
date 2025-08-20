# AI Image Generator Development Environment Startup Script
# 自动停止现有进程并启动前端/后端服务器
# 支持令牌余额查询功能

# 设置控制台编码为UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    AI Image Generator Development" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "停止现有开发服务器..." -ForegroundColor Yellow

# Kill all Node.js related processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "tsx" -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait for processes to stop completely
Start-Sleep -Seconds 2

Write-Host "启动后端服务器..." -ForegroundColor Green
Write-Host ""

# Start backend server in new PowerShell window with UTF-8 encoding
Start-Process powershell -ArgumentList "-NoExit", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Set-Location '$PSScriptRoot\server'; Write-Host '后端服务器启动中...' -ForegroundColor Green; npm run dev"

# Wait for backend to start
Start-Sleep -Seconds 3

Write-Host "启动前端服务器..." -ForegroundColor Green
Write-Host ""

# Start frontend server in new PowerShell window with UTF-8 encoding
Start-Process powershell -ArgumentList "-NoExit", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Set-Location '$PSScriptRoot'; Write-Host '前端服务器启动中...' -ForegroundColor Green; npx vite --port 3000"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "开发服务器已启动！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "后端服务器: http://localhost:3001" -ForegroundColor White
Write-Host "前端服务器: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "功能说明:" -ForegroundColor Yellow
Write-Host "- 支持多种AI图像生成模型" -ForegroundColor Gray
Write-Host "- 令牌余额查询功能" -ForegroundColor Gray
Write-Host "- 批量生成和历史记录" -ForegroundColor Gray
Write-Host "- FLUX.1 Kontext Multi 模型支持" -ForegroundColor Gray
Write-Host ""
Write-Host "环境变量配置:" -ForegroundColor Yellow
Write-Host "- PROVIDER_BASE_URL: https://ai.comfly.chat" -ForegroundColor Gray
Write-Host "- TOKEN_API_BASE_URL: https://ai.comfly.chat" -ForegroundColor Gray
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
# 环境变量配置检查脚本
# 检查令牌余额查询功能所需的环境变量配置

# 设置控制台编码为UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    环境变量配置检查" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "检查主项目环境变量..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "✓ 主项目 .env 文件存在" -ForegroundColor Green
    Write-Host ""
    Write-Host "主项目环境变量内容:" -ForegroundColor White
    Get-Content ".env" | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
    Write-Host ""
} else {
    Write-Host "✗ 主项目 .env 文件不存在" -ForegroundColor Red
    Write-Host ""
}

Write-Host "检查服务器环境变量..." -ForegroundColor Yellow
if (Test-Path "server\.env") {
    Write-Host "✓ 服务器 .env 文件存在" -ForegroundColor Green
    Write-Host ""
    Write-Host "服务器环境变量内容:" -ForegroundColor White
    Get-Content "server\.env" | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
    Write-Host ""
} else {
    Write-Host "✗ 服务器 .env 文件不存在" -ForegroundColor Red
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "令牌余额查询功能配置说明:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "必需的环境变量:" -ForegroundColor Yellow
Write-Host "1. PROVIDER_BASE_URL - API服务基础URL" -ForegroundColor Gray
Write-Host "2. PROVIDER_API_KEY - API密钥" -ForegroundColor Gray
Write-Host "3. TOKEN_API_BASE_URL - 令牌查询API基础URL" -ForegroundColor Gray
Write-Host ""
Write-Host "当前配置的API地址:" -ForegroundColor Yellow
Write-Host "- https://ai.comfly.chat" -ForegroundColor Gray
Write-Host ""
Write-Host "功能特性:" -ForegroundColor Yellow
Write-Host "- 实时查询API令牌余额" -ForegroundColor Gray
Write-Host "- 支持多种AI图像生成模型" -ForegroundColor Gray
Write-Host "- 自动刷新余额显示" -ForegroundColor Gray
Write-Host "- 生成完成后自动更新余额" -ForegroundColor Gray
Write-Host ""
Write-Host "如需修改配置，请编辑对应的 .env 文件" -ForegroundColor White
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
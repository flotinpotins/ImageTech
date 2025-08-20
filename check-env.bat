@echo off
chcp 65001 >nul
echo ========================================
echo    环境变量配置检查
echo ========================================
echo.

echo 检查主项目环境变量...
if exist ".env" (
    echo ✓ 主项目 .env 文件存在
    echo.
    echo 主项目环境变量内容:
    type .env
    echo.
) else (
    echo ✗ 主项目 .env 文件不存在
    echo.
)

echo 检查服务器环境变量...
if exist "server\.env" (
    echo ✓ 服务器 .env 文件存在
    echo.
    echo 服务器环境变量内容:
    type server\.env
    echo.
) else (
    echo ✗ 服务器 .env 文件不存在
    echo.
)

echo ========================================
echo 令牌余额查询功能配置说明:
echo ========================================
echo.
echo 必需的环境变量:
echo 1. PROVIDER_BASE_URL - API服务基础URL
echo 2. PROVIDER_API_KEY - API密钥
echo 3. TOKEN_API_BASE_URL - 令牌查询API基础URL
echo.
echo 当前配置的API地址:
echo - https://ai.comfly.chat
echo.
echo 如需修改配置，请编辑对应的 .env 文件
echo.
echo 按任意键退出...
pause >nul
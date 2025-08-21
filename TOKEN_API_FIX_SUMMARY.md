# 令牌查询API认证方式修复总结

## 问题分析

通过检查本地和Vercel环境的令牌查询API实现，发现了关键问题：

### 原始问题
1. **本地Express服务器** (`server/src/routes/token.ts`):
   - 使用 `Authorization: Bearer ${apiKey}` 认证方式
   - 默认API基础URL: `https://api.example.com`

2. **Vercel无服务器函数** (`api/token/quota.ts`):
   - 使用 `x-api-key: ${apiKey}` 认证方式
   - 配置API基础URL: `https://ai.comfly.chat`

### 认证方式不一致导致的问题
- 外部API `https://ai.comfly.chat/v1/token/quota` 期望的认证方式与本地服务器不匹配
- 导致Vercel环境下API调用失败，返回错误的URL调用

## 修复内容

### 1. 统一认证方式
- 将本地Express服务器的认证方式从 `Authorization: Bearer ${apiKey}` 改为 `x-api-key: ${apiKey}`
- 确保本地和Vercel环境使用相同的认证格式

### 2. 统一API基础URL
- 将本地服务器的默认API基础URL从 `https://api.example.com` 改为 `https://ai.comfly.chat`
- 确保本地和Vercel环境调用相同的外部API

### 3. 增强调试功能
- 在本地服务器添加详细的调试日志
- 记录API Key、请求URL、响应状态等关键信息
- 与Vercel环境的调试日志保持一致

## 修改的文件

### `server/src/routes/token.ts`
```typescript
// 修改前
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
}

// 修改后
headers: {
  'x-api-key': apiKey,
  'Content-Type': 'application/json',
}
```

## 验证步骤

1. **本地环境测试**:
   - 启动本地服务器 (`npm run dev` in server directory)
   - 在前端应用中测试令牌查询功能
   - 检查控制台日志确认API调用正确

2. **Vercel环境测试**:
   - 重新部署到Vercel
   - 测试令牌查询功能
   - 检查Vercel函数日志确认API调用成功

## 预期结果

修复后，本地和Vercel环境应该都能正确调用外部API `https://ai.comfly.chat/v1/token/quota`，使用统一的 `x-api-key` 认证方式，解决令牌查询功能在Vercel部署环境中的问题。

## 环境变量配置

确保以下环境变量正确配置：
- `TOKEN_API_BASE_URL=https://ai.comfly.chat`

本地环境通过 `.env` 文件配置，Vercel环境通过 `vercel.json` 或Vercel控制台配置。
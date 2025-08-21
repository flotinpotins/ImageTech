# Vercel 部署环境中 API Key 调用方式说明

## 问题描述

用户反馈在 Vercel 部署后，令牌查询功能仍然报 HTTP 500 错误，询问本地和 Vercel 部署时 API Key 的调用方式是否不同。

## 本地环境 vs Vercel 环境的差异

### 本地环境

1. **后端服务器**: 使用 Fastify 服务器 (`server/src/server.ts`)
2. **API 路由**: `/api/token/quota` 由 `server/src/routes/token.ts` 处理
3. **环境变量**: 从 `.env` 文件读取
4. **API Key 传递**: 
   - 前端通过 `TokenBalance` 组件的 props 接收全局 API Key
   - 通过 `fetch('/api/token/quota')` 调用本地后端
   - 在请求头中传递 `x-api-key`

### Vercel 环境

1. **无服务器函数**: 使用 Vercel 无服务器函数 (`api/token/quota.ts`)
2. **API 路由**: `/api/token/quota` 由 Vercel 函数处理
3. **环境变量**: 需要在 `vercel.json` 或 Vercel 控制台配置
4. **API Key 传递**: 
   - 前端同样通过 `TokenBalance` 组件的 props 接收全局 API Key
   - 通过 `fetch('/api/token/quota')` 调用 Vercel 函数
   - 在请求头中传递 `x-api-key`

## 已修复的问题

### 1. 环境变量配置

**问题**: Vercel 环境缺少 `TOKEN_API_BASE_URL` 等环境变量配置

**解决方案**: 在 `vercel.json` 中添加环境变量配置：

```json
{
  "env": {
    "TOKEN_API_BASE_URL": "https://ai.comfly.chat",
    "PROVIDER_BASE_URL": "https://ai.comfly.chat",
    "PROVIDER_API_KEY": "sk-9Syi1Zv9NCI8o5ry9110F8379c424fAa8514F55b628e7907"
  }
}
```

### 2. CORS 配置

**问题**: Vercel 函数缺少 CORS 头配置

**解决方案**: 在 `api/token/quota.ts` 中添加 CORS 头：

```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
```

### 3. 调试信息

**问题**: 缺少详细的错误日志

**解决方案**: 添加详细的调试信息：

```typescript
console.log('Vercel环境调试信息:');
console.log('- 请求头:', JSON.stringify(req.headers, null, 2));
console.log('- API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined');
console.log('- TOKEN_API_BASE_URL:', process.env.TOKEN_API_BASE_URL);
```

## API Key 传递流程

### 前端 (相同)

1. `App.tsx` 管理全局 API Key 配置
2. `Sidebar.tsx` 接收并传递 API Key 给 `TokenBalance`
3. `TokenBalance.tsx` 通过 props 接收 API Key
4. 调用 `/api/token/quota` 时在请求头中传递 `x-api-key`

### 后端 (不同)

**本地环境**:
```
前端 → 本地 Fastify 服务器 → 外部 API
```

**Vercel 环境**:
```
前端 → Vercel 无服务器函数 → 外部 API
```

## 验证步骤

1. **检查 Vercel 控制台日志**: 查看函数执行日志中的调试信息
2. **验证环境变量**: 确认 `TOKEN_API_BASE_URL` 在 Vercel 环境中正确配置
3. **测试 API Key**: 确认传递的 API Key 格式正确
4. **检查外部 API**: 验证 `https://ai.comfly.chat/v1/token/quota` 端点可访问

## 总结

本地和 Vercel 环境的 API Key 调用方式在前端是相同的，主要差异在于：

1. **后端架构**: 本地使用 Fastify 服务器，Vercel 使用无服务器函数
2. **环境变量配置**: Vercel 需要在 `vercel.json` 或控制台单独配置
3. **CORS 处理**: Vercel 函数需要手动设置 CORS 头
4. **调试方式**: Vercel 通过函数日志查看调试信息

修复后，令牌查询功能应该在 Vercel 环境中正常工作。
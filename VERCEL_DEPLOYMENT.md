# Vercel 部署配置指南

## 问题诊断

从错误信息看，API调用了错误的URL (`https://www.image-tech.top/api/token/quota`)，但我们配置的是 `https://ai.comfly.chat`。这表明Vercel环境变量配置存在问题。

## 解决方案

### 1. 在Vercel控制台手动配置环境变量

**重要：** 仅在 `vercel.json` 中配置环境变量可能不够，需要在Vercel项目设置中手动添加：

1. 登录 [Vercel控制台](https://vercel.com/dashboard)
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加以下环境变量：

```
TOKEN_API_BASE_URL = https://ai.comfly.chat
PROVIDER_BASE_URL = https://ai.comfly.chat
PROVIDER_API_KEY = sk-9Syi1Zv9NCI8o5ry9110F8379c424fAa8514F55b628e7907
```

5. 确保为所有环境（Production, Preview, Development）都添加这些变量
6. 保存后重新部署项目

### 2. 验证配置

部署后，检查Vercel函数日志：
1. 在Vercel控制台进入 **Functions** 标签
2. 点击 `/api/token/quota` 函数
3. 查看 **Logs** 确认环境变量是否正确读取

### 3. 调试信息

我们已经在 `api/token/quota.ts` 中添加了详细的调试日志，包括：
- 环境变量值
- API调用URL
- 请求头信息

### 4. Fallback机制

代码中已添加fallback机制，即使环境变量未设置，也会使用默认的 `https://ai.comfly.chat`。

## 常见问题

### Q: 为什么本地正常但Vercel部署后不行？
A: 本地使用 `.env` 文件，Vercel需要在控制台单独配置环境变量。

### Q: vercel.json中的env配置不生效？
A: Vercel推荐在控制台配置环境变量，vercel.json中的env配置可能不会在所有情况下生效。

### Q: 如何确认环境变量是否正确？
A: 查看Vercel函数日志，我们的代码会输出所有相关的调试信息。

## 部署步骤

1. 确保代码已推送到Git仓库
2. 在Vercel控制台配置环境变量
3. 触发重新部署
4. 检查函数日志确认配置正确
5. 测试令牌查询功能
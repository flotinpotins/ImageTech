# 数据库自动清理机制

## 概述

为了防止数据库存储无限增长，本项目实现了一个安全的自动清理机制，定期清理过期的任务和图片数据。

## 🛡️ 安全保障

### 多重安全机制

1. **保留期限制**: 只清理30天前的数据
2. **最小记录保护**: 始终保留至少100条最新记录
3. **置顶保护**: 永不删除标记为`pinned=true`的图片
4. **批量限制**: 每次最多处理1000条记录，避免长时间锁表
5. **事务保护**: 使用数据库事务确保数据一致性
6. **授权验证**: 需要正确的密钥才能执行清理

### 清理策略

```sql
-- 清理条件
WHERE created_at < NOW() - INTERVAL '30 days'  -- 30天前的数据
  AND pinned = false                            -- 非置顶数据
  AND 总记录数 > 100                            -- 保留最小记录数
```

## 📅 执行计划

- **执行时间**: 每天凌晨2点 (UTC)
- **执行频率**: 每日一次
- **执行方式**: Vercel Cron Jobs

## 🔧 配置说明

### 环境变量

```bash
CRON_SECRET=cleanup-secret-2024  # 清理API的访问密钥
DATABASE_URL=postgresql://...     # 数据库连接字符串
```

### Vercel配置

```json
{
  "crons": [
    {
      "path": "/api/cleanup",
      "schedule": "0 2 * * *"  // 每天凌晨2点执行
    }
  ]
}
```

## 🧪 测试方法

### 本地测试

```bash
# 运行测试脚本
node test-cleanup.js
```

### 手动触发清理

```bash
# 本地环境
curl -X POST http://localhost:3000/api/cleanup \
  -H "Authorization: Bearer cleanup-secret-2024" \
  -H "Content-Type: application/json"

# 生产环境
curl -X POST https://your-domain.vercel.app/api/cleanup \
  -H "Authorization: Bearer cleanup-secret-2024" \
  -H "Content-Type: application/json"
```

## 📊 清理报告

清理完成后会返回详细报告：

```json
{
  "message": "数据库清理完成",
  "results": {
    "tasksDeleted": 150,
    "imagesDeleted": 300,
    "errors": []
  },
  "statistics": {
    "before": { "tasks": 1000, "images": 2000 },
    "after": { "tasks": 850, "images": 1700 },
    "retentionDays": 30,
    "cutoffDate": "2024-01-01T02:00:00.000Z"
  }
}
```

## 🚨 故障处理

### 常见问题

1. **清理失败**
   - 检查数据库连接
   - 验证环境变量配置
   - 查看Vercel函数日志

2. **数据意外删除**
   - 所有删除操作都有事务保护
   - 可以通过数据库备份恢复
   - 置顶的重要数据不会被删除

3. **性能影响**
   - 清理在凌晨低峰期执行
   - 批量处理避免长时间锁表
   - 如有问题可临时禁用cron

### 紧急停止

如需紧急停止自动清理：

1. 在Vercel控制台禁用cron job
2. 或修改`CRON_SECRET`环境变量
3. 或在`vercel.json`中注释掉crons配置

## 📈 监控建议

1. **定期检查清理日志**
   - Vercel Functions 日志
   - 数据库大小变化

2. **设置告警**
   - 清理失败时的通知
   - 数据库大小异常增长

3. **备份策略**
   - 定期数据库备份
   - 重要数据标记为pinned

## 🔄 自定义配置

如需修改清理策略，编辑 `api/cleanup.ts` 中的配置：

```typescript
const CLEANUP_CONFIG = {
  RETENTION_DAYS: 30,        // 保留天数
  BATCH_SIZE: 1000,          // 批量大小
  MIN_RECORDS_TO_KEEP: 100   // 最小保留记录数
};
```

## ⚠️ 重要提醒

1. **首次部署后测试**: 确保清理逻辑正常工作
2. **备份重要数据**: 对重要图片设置`pinned=true`
3. **监控执行情况**: 定期检查清理日志和数据库状态
4. **谨慎修改配置**: 任何配置更改都应先在测试环境验证

---

*此清理机制设计时充分考虑了数据安全，但建议在生产环境使用前进行充分测试。*
-- 迁移脚本：修复storage_provider约束，添加external选项
-- 执行时间：2025-01-02
-- 目的：解决生产环境中storage_provider='external'违反约束的问题

-- 删除现有约束
ALTER TABLE images DROP CONSTRAINT IF EXISTS chk_storage_provider;

-- 重新添加包含external的约束
ALTER TABLE images 
ADD CONSTRAINT chk_storage_provider 
CHECK (storage_provider IN ('database', 'r2', 's3', 'local', 'external'));

-- 更新注释
COMMENT ON COLUMN images.storage_provider IS '存储提供商：database=Base64存储在数据库, r2=Cloudflare R2, s3=AWS S3, local=本地文件系统, external=外部URL';

-- 验证约束修复
SELECT 
    COUNT(*) as total_images,
    storage_provider,
    COUNT(*) as count_by_provider
FROM images 
GROUP BY storage_provider
ORDER BY storage_provider;
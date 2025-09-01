-- 迁移脚本：为images表添加存储相关字段
-- 执行时间：2024-01-22
-- 目的：支持对象存储迁移，区分Base64数据和对象存储URL

-- 添加存储提供商字段
ALTER TABLE images 
ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'database',
ADD COLUMN IF NOT EXISTS is_migrated boolean DEFAULT false;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_images_storage_provider ON images(storage_provider);
CREATE INDEX IF NOT EXISTS idx_images_is_migrated ON images(is_migrated);

-- 添加约束确保storage_provider的值有效
ALTER TABLE images 
ADD CONSTRAINT chk_storage_provider 
CHECK (storage_provider IN ('database', 'r2', 's3', 'local'));

-- 更新现有记录，将所有现有图片标记为存储在数据库中
UPDATE images 
SET storage_provider = 'database', is_migrated = false 
WHERE storage_provider IS NULL;

-- 添加注释
COMMENT ON COLUMN images.storage_provider IS '存储提供商：database=Base64存储在数据库, r2=Cloudflare R2, s3=AWS S3, local=本地文件系统';
COMMENT ON COLUMN images.is_migrated IS '是否已从数据库Base64迁移到对象存储';

-- 创建视图，方便查询未迁移的图片
CREATE OR REPLACE VIEW images_to_migrate AS
SELECT 
    id,
    task_id,
    url,
    format,
    width,
    height,
    bytes,
    created_at
FROM images 
WHERE storage_provider = 'database' 
  AND is_migrated = false
  AND url LIKE 'data:%'
ORDER BY created_at DESC;

COMMENT ON VIEW images_to_migrate IS '需要迁移的Base64图片列表';
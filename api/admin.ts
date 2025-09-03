import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'pg';

// 数据库连接
function createDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

// 清理配置
const CLEANUP_CONFIG = {
  RETENTION_DAYS: 30,
  BATCH_SIZE: 1000,
  MIN_RECORDS_TO_KEEP: 100
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'health':
        return handleHealth(req, res);
      case 'migrate':
        return handleMigrate(req, res);
      case 'cleanup':
        return handleCleanup(req, res);
      case 'storage-status':
        return handleStorageStatus(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action. Use: health, migrate, cleanup, or storage-status' });
    }
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// 健康检查
async function handleHealth(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AI Image Generator API'
  });
}

// 数据库迁移
async function handleMigrate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret } = req.body;
  if (secret !== process.env.MIGRATION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = createDbClient();

  try {
    await client.connect();
    console.log('✅ 已连接到数据库');

    const migrationSQL = `
      -- 修复存储提供商约束
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_storage_provider_check;
      ALTER TABLE tasks ADD CONSTRAINT tasks_storage_provider_check 
        CHECK (storage_provider IN ('r2', 'local', 'vercel_blob'));
      
      -- 确保存储字段存在
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) DEFAULT 'r2';
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS storage_path TEXT;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS storage_url TEXT;
    `;

    await client.query(migrationSQL);
    console.log('✅ 迁移执行成功');

    return res.status(200).json({
      success: true,
      message: '数据库迁移完成'
    });
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    return res.status(500).json({
      success: false,
      error: '迁移失败',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await client.end();
  }
}

// 存储状态检查
async function handleStorageStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const storageConfig = {
      provider: (process.env.STORAGE_PROVIDER as 'r2' | 's3' | 'local') || 'r2',
      enabled: process.env.STORAGE_ENABLED === 'true',
      r2: {
        accountId: process.env.R2_ACCOUNT_ID || '',
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        bucketName: process.env.R2_BUCKET_NAME || 'imagetech-storage',
        publicUrl: process.env.R2_PUBLIC_URL || '',
      },
    };

    const storageInfo = {
      provider: storageConfig.provider,
      enabled: storageConfig.enabled,
      bucketName: storageConfig.r2?.bucketName,
      publicUrl: storageConfig.r2?.publicUrl,
    };
    
    return res.status(200).json({
      success: true,
      storage: storageInfo
    });
    
  } catch (error) {
    console.error('Storage status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check storage status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

// 数据清理
async function handleCleanup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret } = req.body;
  if (secret !== process.env.CLEANUP_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = createDbClient();

  try {
    await client.connect();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.RETENTION_DAYS);
    
    // 检查总记录数
    const countResult = await client.query('SELECT COUNT(*) as total FROM tasks');
    const totalRecords = parseInt(countResult.rows[0].total);
    
    if (totalRecords <= CLEANUP_CONFIG.MIN_RECORDS_TO_KEEP) {
      return res.status(200).json({
        success: true,
        message: `记录数量 (${totalRecords}) 未超过最小保留数量 (${CLEANUP_CONFIG.MIN_RECORDS_TO_KEEP})，跳过清理`
      });
    }
    
    // 执行清理
    const deleteResult = await client.query(
      `DELETE FROM tasks 
       WHERE created_at < $1 
       AND id NOT IN (
         SELECT id FROM tasks 
         ORDER BY created_at DESC 
         LIMIT $2
       )
       LIMIT $3`,
      [cutoffDate.toISOString(), CLEANUP_CONFIG.MIN_RECORDS_TO_KEEP, CLEANUP_CONFIG.BATCH_SIZE]
    );
    
    return res.status(200).json({
      success: true,
      message: `清理完成，删除了 ${deleteResult.rowCount} 条记录`,
      details: {
        cutoffDate: cutoffDate.toISOString(),
        deletedCount: deleteResult.rowCount,
        totalRecords: totalRecords
      }
    });
  } catch (error) {
    console.error('清理失败:', error);
    return res.status(500).json({
      success: false,
      error: '清理失败',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await client.end();
  }
}
import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'pg';

function createDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 简单的安全检查
  const { secret } = req.body;
  if (secret !== process.env.MIGRATION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = createDbClient();

  try {
    await client.connect();
    console.log('✅ 已连接到数据库');

    // 执行约束修复迁移
    const migrationSQL = `
      -- 删除现有约束
      ALTER TABLE images DROP CONSTRAINT IF EXISTS chk_storage_provider;
      
      -- 重新添加包含external的约束
      ALTER TABLE images 
      ADD CONSTRAINT chk_storage_provider 
      CHECK (storage_provider IN ('database', 'r2', 's3', 'local', 'external'));
      
      -- 更新注释
      COMMENT ON COLUMN images.storage_provider IS '存储提供商：database=Base64存储在数据库, r2=Cloudflare R2, s3=AWS S3, local=本地文件系统, external=外部URL';
    `;

    console.log('🔧 开始执行约束修复迁移...');
    
    // 执行迁移
    await client.query(migrationSQL);
    
    console.log('✅ 约束修复完成');
    
    // 验证修复结果
    const result = await client.query(`
      SELECT 
        storage_provider,
        COUNT(*) as count_by_provider
      FROM images 
      GROUP BY storage_provider
      ORDER BY storage_provider
    `);
    
    console.log('📊 当前存储提供商分布:', result.rows);
    
    return res.status(200).json({
      success: true,
      message: '数据库约束修复成功',
      storageProviderDistribution: result.rows
    });
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    return res.status(500).json({
      success: false,
      error: '迁移执行失败',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await client.end();
    console.log('🔌 数据库连接已关闭');
  }
}
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从环境变量获取数据库连接
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('开始执行数据库迁移...');
    
    // 读取迁移脚本
    const migrationPath = path.join(__dirname, '../migrations/001_add_storage_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // 执行迁移
    await client.query(migrationSQL);
    
    console.log('✅ 数据库迁移执行成功！');
    
    // 验证迁移结果
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'images' 
      AND column_name IN ('storage_provider', 'is_migrated')
      ORDER BY column_name;
    `);
    
    console.log('\n新增字段验证:');
    result.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (默认值: ${row.column_default})`);
    });
    
    // 检查现有数据
    const countResult = await client.query(`
      SELECT 
        storage_provider,
        is_migrated,
        COUNT(*) as count
      FROM images 
      GROUP BY storage_provider, is_migrated
      ORDER BY storage_provider, is_migrated;
    `);
    
    console.log('\n现有数据统计:');
    if (countResult.rows.length === 0) {
      console.log('- 暂无图片数据');
    } else {
      countResult.rows.forEach(row => {
        console.log(`- ${row.storage_provider} (已迁移: ${row.is_migrated}): ${row.count} 条记录`);
      });
    }
    
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// 执行迁移
runMigration().catch(console.error);
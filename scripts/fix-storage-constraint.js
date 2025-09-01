#!/usr/bin/env node

/**
 * 修复生产环境storage_provider约束问题
 * 执行新的迁移脚本以支持'external'存储提供商
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function fixStorageConstraint() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ 已连接到数据库');

    // 读取迁移脚本
    const migrationPath = path.join(__dirname, '..', 'migrations', '002_fix_storage_provider_constraint.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔧 开始执行约束修复迁移...');
    
    // 执行迁移
    await client.query(migrationSQL);
    
    console.log('✅ 约束修复完成');
    
    // 验证修复结果
    const result = await client.query(`
      SELECT 
        COUNT(*) as total_images,
        storage_provider,
        COUNT(*) as count_by_provider
      FROM images 
      GROUP BY storage_provider
      ORDER BY storage_provider
    `);
    
    console.log('📊 当前存储提供商分布:');
    result.rows.forEach(row => {
      console.log(`  ${row.storage_provider}: ${row.count_by_provider} 张图片`);
    });
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    throw error;
  } finally {
    await client.end();
    console.log('🔌 数据库连接已关闭');
  }
}

if (require.main === module) {
  fixStorageConstraint()
    .then(() => {
      console.log('🎉 约束修复成功完成!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 约束修复失败:', error);
      process.exit(1);
    });
}

module.exports = { fixStorageConstraint };
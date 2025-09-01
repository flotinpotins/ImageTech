const fetch = require('node-fetch');
const { Client } = require('pg');

// 测试数据库清理功能
async function testCleanup() {
  console.log('=== 数据库清理测试 ===\n');
  
  // 1. 首先查看当前数据库状态
  const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_tQK0OX5Scefk@ep-autumn-mode-add07t2a.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ 数据库连接成功');
    
    // 查看当前数据统计
    const tasksResult = await client.query('SELECT COUNT(*) as count FROM tasks');
    const imagesResult = await client.query('SELECT COUNT(*) as count FROM images');
    const oldTasksResult = await client.query(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE created_at < NOW() - INTERVAL '30 days'
    `);
    
    console.log(`\n📊 当前数据库状态:`);
    console.log(`   总任务数: ${tasksResult.rows[0].count}`);
    console.log(`   总图片数: ${imagesResult.rows[0].count}`);
    console.log(`   30天前的任务数: ${oldTasksResult.rows[0].count}`);
    
    // 查看最新和最旧的记录
    const latestTask = await client.query('SELECT created_at FROM tasks ORDER BY created_at DESC LIMIT 1');
    const oldestTask = await client.query('SELECT created_at FROM tasks ORDER BY created_at ASC LIMIT 1');
    
    if (latestTask.rows.length > 0) {
      console.log(`   最新任务时间: ${latestTask.rows[0].created_at}`);
    }
    if (oldestTask.rows.length > 0) {
      console.log(`   最旧任务时间: ${oldestTask.rows[0].created_at}`);
    }
    
    // 检查是否有置顶的图片
    const pinnedImages = await client.query('SELECT COUNT(*) as count FROM images WHERE pinned = true');
    console.log(`   置顶图片数: ${pinnedImages.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ 数据库查询失败:', error.message);
    return;
  } finally {
    await client.end();
  }
  
  // 2. 测试清理API（如果在本地运行）
  console.log('\n🧪 测试清理API...');
  
  try {
    // 注意：这里使用本地API端点进行测试
    const response = await fetch('http://localhost:3000/api/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cleanup-secret-2024'
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ 清理API调用成功');
      console.log('📋 清理结果:', JSON.stringify(result, null, 2));
    } else {
      const errorText = await response.text();
      console.log(`❌ 清理API调用失败: ${response.status} ${response.statusText}`);
      console.log('错误详情:', errorText);
    }
  } catch (error) {
    console.log('⚠️  无法连接到本地API (这是正常的，如果服务未运行)');
    console.log('   错误:', error.message);
    console.log('   💡 提示: 启动本地服务后再次运行此测试');
  }
  
  console.log('\n=== 测试完成 ===');
  console.log('\n📝 说明:');
  console.log('   - 清理策略: 保留最近30天的数据');
  console.log('   - 安全机制: 至少保留100条最新记录');
  console.log('   - 保护机制: 不删除置顶(pinned)的图片');
  console.log('   - 执行时间: 每天凌晨2点自动执行');
  console.log('   - 批量处理: 每次最多处理1000条记录');
}

// 如果直接运行此脚本
if (require.main === module) {
  testCleanup().catch(console.error);
}

module.exports = { testCleanup };
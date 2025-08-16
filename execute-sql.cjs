const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function executeSqlScript() {
  const connectionString = 'postgresql://neondb_owner:npg_tQK0OX5Scefk@ep-autumn-mode-add07t2a.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    console.log('连接到数据库...');
    await client.connect();
    console.log('数据库连接成功！');

    // 读取SQL文件
    const sqlPath = path.join(__dirname, 'init-db.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('执行SQL脚本...');
    await client.query(sqlContent);
    console.log('SQL脚本执行成功！');

    // 验证连接 - 执行 select now()
    console.log('\n验证连接...');
    const timeResult = await client.query('SELECT now() as current_time');
    console.log('当前时间:', timeResult.rows[0].current_time);

    // 获取表清单
    console.log('\n获取表清单...');
    const tablesResult = await client.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('数据库中的表:');
    tablesResult.rows.forEach(row => {
      console.log(`- ${row.table_name} (${row.table_type})`);
    });

    // 检查索引
    console.log('\n检查索引...');
    const indexResult = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname
    `);
    
    console.log('创建的索引:');
    indexResult.rows.forEach(row => {
      console.log(`- ${row.indexname} on ${row.tablename}`);
    });

  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n数据库连接已关闭');
  }
}

executeSqlScript();
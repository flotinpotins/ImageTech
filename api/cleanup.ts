import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'pg';

// 数据库连接
function createDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// 清理配置
const CLEANUP_CONFIG = {
  // 保留最近7天的数据（紧急清理模式）
  RETENTION_DAYS: 7,
  // 每次最多清理2000条记录，加快清理速度
  BATCH_SIZE: 2000,
  // 保护机制：保留至少50条最新记录
  MIN_RECORDS_TO_KEEP: 50
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 验证授权（使用Vercel Cron的secret或简单的token验证）
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || 'default-cleanup-secret';
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = createDbClient();
  let cleanupResults = {
    tasksDeleted: 0,
    imagesDeleted: 0,
    errors: [] as string[]
  };

  try {
    await client.connect();
    console.log('开始数据库清理任务...');

    // 1. 首先检查总记录数，确保不会删除太多数据
    const totalTasksResult = await client.query('SELECT COUNT(*) as count FROM tasks');
    const totalTasks = parseInt(totalTasksResult.rows[0].count);
    
    const totalImagesResult = await client.query('SELECT COUNT(*) as count FROM images');
    const totalImages = parseInt(totalImagesResult.rows[0].count);

    console.log(`当前数据库状态: ${totalTasks} 个任务, ${totalImages} 个图片`);

    // 安全检查：如果总记录数少于最小保留数，跳过清理
    if (totalTasks <= CLEANUP_CONFIG.MIN_RECORDS_TO_KEEP) {
      console.log(`任务总数(${totalTasks})少于最小保留数(${CLEANUP_CONFIG.MIN_RECORDS_TO_KEEP})，跳过清理`);
      return res.status(200).json({
        message: '数据量较少，跳过清理',
        results: cleanupResults
      });
    }

    // 2. 计算清理日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.RETENTION_DAYS);
    console.log(`清理截止日期: ${cutoffDate.toISOString()}`);

    // 3. 查找要清理的任务（排除置顶的图片）
    const tasksToDeleteResult = await client.query(`
      SELECT t.id 
      FROM tasks t
      WHERE t.created_at < $1
        AND NOT EXISTS (
          SELECT 1 FROM images i 
          WHERE i.task_id = t.id AND i.pinned = true
        )
      ORDER BY t.created_at ASC
      LIMIT $2
    `, [cutoffDate.toISOString(), CLEANUP_CONFIG.BATCH_SIZE]);

    const taskIdsToDelete = tasksToDeleteResult.rows.map(row => row.id);
    console.log(`找到 ${taskIdsToDelete.length} 个可清理的任务`);

    if (taskIdsToDelete.length === 0) {
      console.log('没有需要清理的数据');
      return res.status(200).json({
        message: '没有需要清理的数据',
        results: cleanupResults
      });
    }

    // 4. 开始事务清理
    await client.query('BEGIN');

    try {
      // 先删除关联的图片（由于外键约束，会自动级联删除）
      const deleteImagesResult = await client.query(`
        DELETE FROM images 
        WHERE task_id = ANY($1::text[])
          AND pinned = false
      `, [taskIdsToDelete]);
      
      cleanupResults.imagesDeleted = deleteImagesResult.rowCount || 0;
      console.log(`删除了 ${cleanupResults.imagesDeleted} 个图片记录`);

      // 再删除任务记录
      const deleteTasksResult = await client.query(`
        DELETE FROM tasks 
        WHERE id = ANY($1::text[])
      `, [taskIdsToDelete]);
      
      cleanupResults.tasksDeleted = deleteTasksResult.rowCount || 0;
      console.log(`删除了 ${cleanupResults.tasksDeleted} 个任务记录`);

      // 提交事务
      await client.query('COMMIT');
      console.log('清理事务提交成功');

    } catch (error) {
      // 回滚事务
      await client.query('ROLLBACK');
      throw error;
    }

    // 5. 清理孤立的图片记录（没有对应任务的图片）
    try {
      const orphanImagesResult = await client.query(`
        DELETE FROM images 
        WHERE task_id NOT IN (SELECT id FROM tasks)
          AND pinned = false
          AND created_at < $1
        LIMIT $2
      `, [cutoffDate.toISOString(), CLEANUP_CONFIG.BATCH_SIZE]);
      
      const orphanImagesDeleted = orphanImagesResult.rowCount || 0;
      if (orphanImagesDeleted > 0) {
        cleanupResults.imagesDeleted += orphanImagesDeleted;
        console.log(`清理了 ${orphanImagesDeleted} 个孤立图片记录`);
      }
    } catch (error) {
      console.error('清理孤立图片时出错:', error);
      cleanupResults.errors.push(`清理孤立图片失败: ${error}`);
    }

    // 6. 获取清理后的统计信息
    const finalTasksResult = await client.query('SELECT COUNT(*) as count FROM tasks');
    const finalImagesResult = await client.query('SELECT COUNT(*) as count FROM images');
    
    const finalTasks = parseInt(finalTasksResult.rows[0].count);
    const finalImages = parseInt(finalImagesResult.rows[0].count);

    console.log(`清理完成: 剩余 ${finalTasks} 个任务, ${finalImages} 个图片`);

    return res.status(200).json({
      message: '数据库清理完成',
      results: cleanupResults,
      statistics: {
        before: { tasks: totalTasks, images: totalImages },
        after: { tasks: finalTasks, images: finalImages },
        retentionDays: CLEANUP_CONFIG.RETENTION_DAYS,
        cutoffDate: cutoffDate.toISOString()
      }
    });

  } catch (error) {
    console.error('数据库清理失败:', error);
    cleanupResults.errors.push(`清理失败: ${error}`);
    
    return res.status(500).json({
      error: '数据库清理失败',
      details: error instanceof Error ? error.message : String(error),
      results: cleanupResults
    });
  } finally {
    await client.end();
  }
}
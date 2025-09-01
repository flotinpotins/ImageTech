import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'pg';

// 数据库连接
function createDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// 紧急清理配置
const EMERGENCY_CLEANUP_CONFIG = {
  // 只保留最近3天的数据
  RETENTION_DAYS: 3,
  // 大批量删除
  BATCH_SIZE: 5000,
  // 最少保留记录数
  MIN_RECORDS_TO_KEEP: 20
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

  // 验证授权
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || 'cleanup-secret-2024'}`;
  
  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = createDbClient();
  
  try {
    await client.connect();
    console.log('Emergency cleanup started...');

    // 获取当前统计信息
    const beforeStats = await client.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '${EMERGENCY_CLEANUP_CONFIG.RETENTION_DAYS} days' THEN 1 END) as recent_tasks
      FROM tasks
    `);

    const totalTasksBefore = parseInt(beforeStats.rows[0].total_tasks);
    const recentTasks = parseInt(beforeStats.rows[0].recent_tasks);

    console.log(`Before cleanup: ${totalTasksBefore} total tasks, ${recentTasks} recent tasks`);

    // 如果总记录数少于最小保留数，跳过清理
    if (totalTasksBefore <= EMERGENCY_CLEANUP_CONFIG.MIN_RECORDS_TO_KEEP) {
      return res.status(200).json({
        success: true,
        message: 'Cleanup skipped - too few records',
        stats: {
          totalTasksBefore,
          tasksDeleted: 0,
          imagesDeleted: 0,
          totalTasksAfter: totalTasksBefore
        }
      });
    }

    // 计算清理截止日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - EMERGENCY_CLEANUP_CONFIG.RETENTION_DAYS);
    
    console.log(`Cleaning up tasks older than ${cutoffDate.toISOString()}`);

    // 开始事务
    await client.query('BEGIN');

    try {
      // 查找要删除的任务（排除置顶的）
      const tasksToDelete = await client.query(
        `SELECT id FROM tasks 
         WHERE created_at < $1 AND (is_pinned = false OR is_pinned IS NULL)
         ORDER BY created_at ASC
         LIMIT $2`,
        [cutoffDate.toISOString(), EMERGENCY_CLEANUP_CONFIG.BATCH_SIZE]
      );

      if (tasksToDelete.rows.length === 0) {
        await client.query('COMMIT');
        return res.status(200).json({
          success: true,
          message: 'No old tasks to clean up',
          stats: {
            totalTasksBefore,
            tasksDeleted: 0,
            imagesDeleted: 0,
            totalTasksAfter: totalTasksBefore
          }
        });
      }

      const taskIds = tasksToDelete.rows.map(row => row.id);
      console.log(`Found ${taskIds.length} tasks to delete`);

      // 删除关联的图片记录
      const imagesDeleteResult = await client.query(
        'DELETE FROM images WHERE task_id = ANY($1)',
        [taskIds]
      );
      
      const imagesDeleted = imagesDeleteResult.rowCount || 0;
      console.log(`Deleted ${imagesDeleted} image records`);

      // 删除任务记录
      const tasksDeleteResult = await client.query(
        'DELETE FROM tasks WHERE id = ANY($1)',
        [taskIds]
      );
      
      const tasksDeleted = tasksDeleteResult.rowCount || 0;
      console.log(`Deleted ${tasksDeleted} task records`);

      // 提交事务
      await client.query('COMMIT');

      // 清理孤立的图片记录
      const orphanedImagesResult = await client.query(
        'DELETE FROM images WHERE task_id NOT IN (SELECT id FROM tasks)'
      );
      const orphanedImagesDeleted = orphanedImagesResult.rowCount || 0;
      
      if (orphanedImagesDeleted > 0) {
        console.log(`Cleaned up ${orphanedImagesDeleted} orphaned image records`);
      }

      // 获取清理后的统计信息
      const afterStats = await client.query('SELECT COUNT(*) as total FROM tasks');
      const totalTasksAfter = parseInt(afterStats.rows[0].total);

      const cleanupResults = {
        totalTasksBefore,
        tasksDeleted,
        imagesDeleted: imagesDeleted + orphanedImagesDeleted,
        totalTasksAfter,
        cutoffDate: cutoffDate.toISOString(),
        spaceSaved: `${tasksDeleted + imagesDeleted + orphanedImagesDeleted} records`
      };

      console.log('Emergency cleanup completed:', cleanupResults);

      res.status(200).json({
        success: true,
        message: 'Emergency cleanup completed successfully',
        stats: cleanupResults
      });

    } catch (error) {
      // 回滚事务
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Emergency cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Emergency cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await client.end();
  }
}

// Vercel配置
export const config = {
  runtime: 'nodejs18.x',
  maxDuration: 60
};
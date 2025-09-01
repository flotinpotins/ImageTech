import { Client } from 'pg';
import { uploadImageToStorage } from '../api/storage';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

interface ImageRecord {
  id: string;
  url: string;
  storage_provider: string;
  is_migrated: boolean;
  format: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

async function migrateLegacyImages() {
  console.log('🔄 开始迁移历史Base64图片到对象存储...');
  console.log('=' .repeat(60));
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('✅ 数据库连接成功');
    
    // 1. 查询需要迁移的图片
    console.log('\n📊 查询需要迁移的图片...');
    const queryResult = await client.query(`
      SELECT id, url, storage_provider, is_migrated, format, width, height, bytes, sha256
      FROM images 
      WHERE storage_provider = 'database' 
        AND is_migrated = false 
        AND url LIKE 'data:%'
      ORDER BY id
      LIMIT 50
    `);
    
    const imagesToMigrate: ImageRecord[] = queryResult.rows;
    console.log(`📈 找到 ${imagesToMigrate.length} 张需要迁移的图片`);
    
    if (imagesToMigrate.length === 0) {
      console.log('🎉 没有需要迁移的图片，任务完成！');
      return;
    }
    
    // 2. 逐个迁移图片
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < imagesToMigrate.length; i++) {
      const image = imagesToMigrate[i];
      console.log(`\n🔄 [${i + 1}/${imagesToMigrate.length}] 迁移图片 ID: ${image.id}`);
      console.log(`   原始URL长度: ${image.url.length} 字符`);
      console.log(`   格式: ${image.format}, 尺寸: ${image.width}x${image.height}`);
      
      try {
        // 上传到对象存储
        const uploadResult = await uploadImageToStorage(image.url, {
          prefix: 'migrated',
          metadata: {
            originalId: image.id,
            migratedAt: new Date().toISOString(),
            originalFormat: image.format,
            originalSize: image.bytes.toString(),
          }
        });
        
        // 检查是否成功上传到对象存储
        if (uploadResult.url !== image.url && !uploadResult.url.startsWith('data:')) {
          // 成功上传到对象存储，更新数据库
          await client.query(`
            UPDATE images 
            SET url = $1, storage_provider = 'r2', is_migrated = true, updated_at = NOW()
            WHERE id = $2
          `, [uploadResult.url, image.id]);
          
          console.log(`   ✅ 迁移成功! 新URL: ${uploadResult.url.substring(0, 80)}...`);
          successCount++;
        } else {
          // 上传失败，标记为已尝试迁移但失败
          await client.query(`
            UPDATE images 
            SET is_migrated = true, updated_at = NOW()
            WHERE id = $1
          `, [image.id]);
          
          console.log(`   ⚠️ 上传失败，保持原始Base64格式`);
          failureCount++;
        }
        
      } catch (error) {
        console.error(`   ❌ 迁移失败:`, error.message);
        
        // 标记为已尝试迁移但失败
        try {
          await client.query(`
            UPDATE images 
            SET is_migrated = true, updated_at = NOW()
            WHERE id = $1
          `, [image.id]);
        } catch (updateError) {
          console.error(`   ❌ 更新数据库失败:`, updateError.message);
        }
        
        failureCount++;
      }
      
      // 添加延迟，避免过于频繁的请求
      if (i < imagesToMigrate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // 3. 显示迁移统计
    console.log('\n📊 迁移统计:');
    console.log(`   ✅ 成功迁移: ${successCount} 张`);
    console.log(`   ❌ 迁移失败: ${failureCount} 张`);
    console.log(`   📈 总计处理: ${successCount + failureCount} 张`);
    
    // 4. 查询剩余未迁移的图片数量
    const remainingResult = await client.query(`
      SELECT COUNT(*) as count
      FROM images 
      WHERE storage_provider = 'database' 
        AND is_migrated = false 
        AND url LIKE 'data:%'
    `);
    
    const remainingCount = parseInt(remainingResult.rows[0].count);
    console.log(`\n📋 剩余未迁移图片: ${remainingCount} 张`);
    
    if (remainingCount > 0) {
      console.log('💡 提示: 可以再次运行此脚本继续迁移剩余图片');
    } else {
      console.log('🎉 所有图片迁移完成！');
    }
    
  } catch (error) {
    console.error('❌ 迁移过程中发生错误:', error.message);
    console.error('错误详情:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 数据库连接已关闭');
  }
}

// 运行迁移
migrateLegacyImages().catch(console.error);
import { uploadImageToStorage, checkStorageHealth, getStorageInfo } from '../api/storage';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 测试用的Base64图片（1x1像素的PNG）
const testImageDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function testStorageService() {
  console.log('🧪 开始测试对象存储服务...');
  console.log('=' .repeat(50));
  
  try {
    // 1. 检查存储配置
    console.log('1️⃣ 检查存储配置:');
    const storageInfo = getStorageInfo();
    console.log('   存储提供商:', storageInfo.provider);
    console.log('   是否启用:', storageInfo.enabled);
    console.log('   存储桶名称:', storageInfo.bucketName || 'N/A');
    console.log('   公共URL:', storageInfo.publicUrl || 'N/A');
    console.log('');
    
    // 2. 检查存储服务健康状态
    console.log('2️⃣ 检查存储服务健康状态:');
    const healthCheck = await checkStorageHealth();
    console.log('   服务可用:', healthCheck.available ? '✅' : '❌');
    console.log('   提供商:', healthCheck.provider);
    if (healthCheck.error) {
      console.log('   错误信息:', healthCheck.error);
    }
    console.log('');
    
    // 3. 测试图片上传
    console.log('3️⃣ 测试图片上传:');
    console.log('   上传测试图片...');
    
    const uploadResult = await uploadImageToStorage(testImageDataURL, {
      prefix: 'test',
      metadata: {
        testRun: 'true',
        timestamp: new Date().toISOString(),
      }
    });
    
    console.log('   上传结果:');
    console.log('   - URL:', uploadResult.url);
    console.log('   - 存储键:', uploadResult.key || 'N/A');
    console.log('   - 文件大小:', uploadResult.size, 'bytes');
    console.log('');
    
    // 4. 验证上传的图片是否可访问
    if (uploadResult.url && !uploadResult.url.startsWith('data:')) {
      console.log('4️⃣ 验证图片可访问性:');
      try {
        const response = await fetch(uploadResult.url);
        console.log('   HTTP状态:', response.status);
        console.log('   内容类型:', response.headers.get('content-type'));
        console.log('   内容长度:', response.headers.get('content-length'));
        
        if (response.ok) {
          console.log('   ✅ 图片可以正常访问');
        } else {
          console.log('   ❌ 图片访问失败');
        }
      } catch (fetchError) {
        console.log('   ❌ 无法访问图片:', fetchError.message);
      }
    } else {
      console.log('4️⃣ 跳过可访问性测试（使用了回退的data URL）');
    }
    
    console.log('');
    console.log('🎉 存储服务测试完成！');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error('错误详情:', error.stack);
    process.exit(1);
  }
}

// 运行测试
testStorageService().catch(console.error);
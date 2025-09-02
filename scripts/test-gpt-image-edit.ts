import { dispatchGenerate } from '../api/tasks';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// 加载环境变量
dotenv.config();

// 创建一个简单的测试图片 (1x1 像素的红色PNG)
function createTestImage(): string {
  // 1x1 红色像素的PNG base64数据
  const pngData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${pngData}`;
}

async function testGPTImageEdit() {
  console.log('🎨 开始测试GPT图生图功能...');
  console.log('=' .repeat(50));
  
  try {
    // 创建测试图片
    const testImage = createTestImage();
    console.log('📸 测试图片已创建，长度:', testImage.length);
    
    // 测试参数
    const testPayload = {
      prompt: 'add sunglasses to this image',
      images: [testImage],
      model: 'gpt-image-1',
      size: '1024x1024',
      n: 1,
      quality: 'medium'
    };
    
    console.log('\n🔄 测试GPT图像编辑');
    console.log('📝 提示词:', testPayload.prompt);
    console.log('🖼️ 图片数量:', testPayload.images.length);
    console.log('📏 尺寸:', testPayload.size);
    console.log('🔢 生成数量:', testPayload.n);
    console.log('⭐ 质量:', testPayload.quality);
    
    try {
      // 生成图片
      console.log('\n⏳ 正在生成图片...');
      const result = await dispatchGenerate('gpt-image-1', testPayload);
      
      console.log('\n✅ 图片生成成功!');
      console.log('📊 生成结果:');
      console.log('   - 图片数量:', result.urls?.length || 0);
      console.log('   - 种子值:', result.seed || 'N/A');
      
      if (result.urls && result.urls.length > 0) {
        const firstImage = result.urls[0];
        console.log('   - 第一张图片URL长度:', firstImage.length);
        console.log('   - 是否为Base64:', firstImage.startsWith('data:'));
        console.log('   - 图片格式:', firstImage.substring(0, 50) + '...');
      }
      
    } catch (error: any) {
      console.error('❌ GPT图像编辑测试失败:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    
  } catch (error: any) {
    console.error('❌ 测试初始化失败:', error.message);
    console.error('错误堆栈:', error.stack);
  }
  
  console.log('\n🎉 GPT图像编辑功能测试完成!');
}

// 运行测试
testGPTImageEdit().catch(console.error);
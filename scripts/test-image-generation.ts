import { dispatchGenerate } from '../api/tasks';
import { saveTask } from '../api/tasks';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function testImageGeneration() {
  console.log('🎨 开始测试AI图片生成功能...');
  console.log('=' .repeat(50));
  
  try {
    // 测试参数
    const testCases = [
      {
        model: 'jimeng-t2i',
        prompt: 'a cute cat sitting on a table',
        params: {
          width: 512,
          height: 512,
          steps: 20,
          cfg_scale: 7,
          seed: -1
        }
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n🔄 测试模型: ${testCase.model}`);
      console.log(`📝 提示词: ${testCase.prompt}`);
      console.log(`⚙️ 参数:`, JSON.stringify(testCase.params, null, 2));
      
      try {
        // 生成图片
        console.log('\n⏳ 正在生成图片...');
        const result = await dispatchGenerate(
          testCase.model,
          testCase.prompt,
          testCase.params
        );
        
        console.log('\n✅ 图片生成成功!');
        console.log('📊 生成结果:');
        console.log('   - 图片数量:', result.images?.length || 0);
        console.log('   - 种子值:', result.seed || 'N/A');
        console.log('   - 状态:', result.status || 'unknown');
        
        if (result.images && result.images.length > 0) {
          const firstImage = result.images[0];
          console.log('   - 第一张图片URL长度:', firstImage.length);
          console.log('   - 是否为Base64:', firstImage.startsWith('data:'));
          
          // 测试保存任务
          console.log('\n💾 测试保存任务到数据库...');
          const taskId = `test-${Date.now()}`;
          
          await saveTask({
            id: taskId,
            model: testCase.model,
            prompt: testCase.prompt,
            params: testCase.params,
            status: 'completed',
            seed: result.seed,
            images: result.images
          });
          
          console.log('✅ 任务保存成功! 任务ID:', taskId);
        }
        
      } catch (error) {
        console.error(`❌ 模型 ${testCase.model} 测试失败:`, error.message);
        if (error.stack) {
          console.error('错误堆栈:', error.stack);
        }
      }
    }
    
    console.log('\n🎉 图片生成功能测试完成!');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error('错误详情:', error.stack);
    process.exit(1);
  }
}

// 运行测试
testImageGeneration().catch(console.error);
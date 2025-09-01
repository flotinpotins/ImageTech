#!/usr/bin/env node

/**
 * 部署前清理脚本
 * 删除不必要的文件和目录，减少项目大小
 */

const fs = require('fs');
const path = require('path');

const itemsToClean = [
  // 开发工具和缓存
  '.vite',
  '.cache',
  'node_modules/.cache',
  'server/node_modules/.cache',
  
  // 临时文件
  'tmp',
  'temp',
  
  // 日志文件
  'logs',
  '*.log',
  
  // 测试和覆盖率文件
  'coverage',
  '.nyc_output',
  
  // 开发脚本
  'check-env.bat',
  'check-env.ps1',
  'start-dev.bat',
  'start-dev.ps1',
  'check_latest_tasks.js',
  'check_object_errors.js',
  'debug_dataurl.js',
  'debug_image_params.js',
  'execute-sql.cjs',
  'execute-sql.js',
  'test-cleanup.js',
  
  // 文档和说明文件
  'DATABASE_CLEANUP_README.md',
  'TOKEN_API_FIX_SUMMARY.md',
  'VERCEL_API_KEY_GUIDE.md',
  'VERCEL_DEPLOYMENT.md',
  'gpt-image-1_api接入文档.txt',
  '# 添加更多排除项.txt',
  'Untitled-2.json',
  
  // 大文件
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.mp4',
  '*.avi',
  '*.mov',
  '*.pdf'
];

function deleteItem(itemPath) {
  try {
    if (fs.existsSync(itemPath)) {
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`✓ 删除目录: ${itemPath}`);
      } else {
        fs.unlinkSync(itemPath);
        console.log(`✓ 删除文件: ${itemPath}`);
      }
    }
  } catch (error) {
    console.log(`✗ 删除失败 ${itemPath}: ${error.message}`);
  }
}

function deleteGlobPattern(pattern) {
  const glob = require('glob');
  try {
    const files = glob.sync(pattern, { dot: true });
    files.forEach(file => {
      deleteItem(file);
    });
  } catch (error) {
    console.log(`✗ 处理模式 ${pattern} 失败: ${error.message}`);
  }
}

console.log('🧹 开始清理项目文件...');

itemsToClean.forEach(item => {
  if (item.includes('*')) {
    // 处理通配符模式
    deleteGlobPattern(item);
  } else {
    // 处理具体路径
    deleteItem(item);
  }
});

// 清理空目录
function removeEmptyDirs(dir) {
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        fs.rmdirSync(dir);
        console.log(`✓ 删除空目录: ${dir}`);
      } else {
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            removeEmptyDirs(fullPath);
          }
        });
        // 再次检查是否为空
        const remainingFiles = fs.readdirSync(dir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(dir);
          console.log(`✓ 删除空目录: ${dir}`);
        }
      }
    }
  } catch (error) {
    // 忽略错误，可能是权限问题或目录不存在
  }
}

// 清理一些可能的空目录
['tmp', 'temp', 'logs', '.cache'].forEach(dir => {
  removeEmptyDirs(dir);
});

console.log('✅ 清理完成！');
console.log('\n📊 建议运行以下命令检查项目大小:');
console.log('du -sh . 2>/dev/null || Get-ChildItem -Recurse | Measure-Object -Property Length -Sum');
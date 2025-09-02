import { S3Client, ListBucketsCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

console.log('🔍 检查R2凭据和连接...');
console.log('==================================================');
console.log(`账户ID: ${ACCOUNT_ID}`);
console.log(`Access Key ID: ${ACCESS_KEY_ID}`);
console.log(`存储桶名称: ${BUCKET_NAME}`);
console.log('');

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
  console.error('❌ 缺少必要的环境变量');
  process.exit(1);
}

// 创建S3客户端
const client = new S3Client({
  region: 'auto', // Cloudflare R2 要求使用 'auto' 作为 region
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  // 添加强制路径样式，某些情况下可能需要
  forcePathStyle: true,
  // 禁用存储桶检查，避免权限问题
  signatureVersion: 'v4',
});

async function testR2Connection() {
  try {
    console.log('1️⃣ 测试连接和列出存储桶...');
    const listBucketsResult = await client.send(new ListBucketsCommand({}));
    console.log('✅ 连接成功！');
    console.log('📦 现有存储桶:');
    if (listBucketsResult.Buckets && listBucketsResult.Buckets.length > 0) {
      listBucketsResult.Buckets.forEach(bucket => {
        console.log(`   - ${bucket.Name} (创建于: ${bucket.CreationDate})`);
      });
    } else {
      console.log('   没有找到存储桶');
    }
    
    // 检查目标存储桶是否存在
    const bucketExists = listBucketsResult.Buckets?.some(bucket => bucket.Name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log('');
      console.log(`2️⃣ 存储桶 "${BUCKET_NAME}" 不存在，尝试创建...`);
      try {
        await client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`✅ 存储桶 "${BUCKET_NAME}" 创建成功！`);
      } catch (createError: any) {
        console.error(`❌ 创建存储桶失败: ${createError.message}`);
      }
    } else {
      console.log(`✅ 存储桶 "${BUCKET_NAME}" 已存在`);
    }
    
  } catch (error: any) {
    console.error('❌ 连接失败:');
    console.error(`   错误类型: ${error.name}`);
    console.error(`   错误信息: ${error.message}`);
    if (error.code) {
      console.error(`   错误代码: ${error.code}`);
    }
    if (error.$metadata) {
      console.error(`   HTTP状态码: ${error.$metadata.httpStatusCode}`);
    }
  }
}

testR2Connection();
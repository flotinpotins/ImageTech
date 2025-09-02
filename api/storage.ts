import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// 存储配置接口
interface StorageConfig {
  provider: 'r2' | 's3' | 'local';
  enabled: boolean;
  r2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
  };
}

// 获取存储配置
function getStorageConfig(): StorageConfig {
  return {
    provider: (process.env.STORAGE_PROVIDER as 'r2' | 's3' | 'local') || 'r2',
    enabled: process.env.STORAGE_ENABLED === 'true',
    r2: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucketName: process.env.R2_BUCKET_NAME || 'imagetech-storage',
      publicUrl: process.env.R2_PUBLIC_URL || '',
    },
  };
}

// 创建S3客户端（Cloudflare R2兼容S3 API）
function createR2Client(config: StorageConfig) {
  if (!config.r2) {
    throw new Error('R2 configuration is missing');
  }

  if (!config.r2.accessKeyId || !config.r2.secretAccessKey) {
    throw new Error('R2 Access Key ID and Secret Access Key are required');
  }

  // 根据Cloudflare官方文档和社区反馈的配置
  return new S3Client({
    region: 'auto', // Cloudflare R2 要求使用 'auto' 作为 region
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
    // 添加强制路径样式，某些情况下可能需要
    forcePathStyle: true,
  });
}

// 从Base64 Data URL中提取数据
function parseDataURL(dataURL: string): { buffer: Buffer; mimeType: string; extension: string } {
  const matches = dataURL.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URL format');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  // 根据MIME类型确定文件扩展名
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 
                   mimeType === 'image/png' ? 'png' : 
                   mimeType === 'image/webp' ? 'webp' : 'png';

  return { buffer, mimeType, extension };
}

// 生成唯一的文件名
function generateFileName(extension: string, prefix: string = 'img'): string {
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${randomId}.${extension}`;
}

// 上传图片到对象存储
export async function uploadImageToStorage(dataURL: string, options?: {
  prefix?: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string; key: string; size: number }> {
  const config = getStorageConfig();
  
  // 如果存储未启用，返回原始的data URL
  if (!config.enabled) {
    console.warn('Object storage is disabled, returning original data URL');
    return {
      url: dataURL,
      key: '',
      size: dataURL.length,
    };
  }

  try {
    const { buffer, mimeType, extension } = parseDataURL(dataURL);
    const fileName = generateFileName(extension, options?.prefix);
    
    if (config.provider === 'r2') {
      const client = createR2Client(config);
      
      const command = new PutObjectCommand({
        Bucket: config.r2!.bucketName,
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
        Metadata: {
          uploadedAt: new Date().toISOString(),
          originalSize: buffer.length.toString(),
          ...options?.metadata,
        },
      });
      
      // 添加自动创建存储桶的头部（如果存储桶不存在）
      command.middlewareStack.add(
        (next) => (args: any) => {
          if (args.request && args.request.headers) {
            args.request.headers['cf-create-bucket-if-missing'] = 'true';
          }
          return next(args);
        },
        { step: 'build' }
      );

      await client.send(command);
      
      // 构建公共访问URL
      const publicUrl = config.r2!.publicUrl 
        ? `${config.r2!.publicUrl}/${fileName}`
        : `https://${config.r2!.bucketName}.${config.r2!.accountId}.r2.cloudflarestorage.com/${fileName}`;

      return {
        url: publicUrl,
        key: fileName,
        size: buffer.length,
      };
    }
    
    throw new Error(`Unsupported storage provider: ${config.provider}`);
  } catch (error) {
    console.error('Failed to upload image to storage:', error);
    // 如果上传失败，回退到原始data URL
    return {
      url: dataURL,
      key: '',
      size: dataURL.length,
    };
  }
}

// 批量上传图片
export async function uploadImagesToStorage(dataURLs: string[], options?: {
  prefix?: string;
  metadata?: Record<string, string>;
}): Promise<Array<{ url: string; key: string; size: number }>> {
  const results = await Promise.allSettled(
    dataURLs.map(dataURL => uploadImageToStorage(dataURL, options))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`Failed to upload image ${index}:`, result.reason);
      // 失败时回退到原始data URL
      return {
        url: dataURLs[index],
        key: '',
        size: dataURLs[index].length,
      };
    }
  });
}

// 检查存储服务是否可用
export async function checkStorageHealth(): Promise<{ available: boolean; provider: string; error?: string }> {
  const config = getStorageConfig();
  
  if (!config.enabled) {
    return { available: false, provider: config.provider, error: 'Storage is disabled' };
  }

  try {
    if (config.provider === 'r2') {
      const client = createR2Client(config);
      
      // 尝试列出bucket来测试连接
      const testKey = `health-check-${Date.now()}.txt`;
      const testContent = Buffer.from('health check', 'utf-8');
      
      const putCommand = new PutObjectCommand({
        Bucket: config.r2!.bucketName,
        Key: testKey,
        Body: testContent,
        ContentType: 'text/plain',
      });
      
      await client.send(putCommand);
      
      // 清理测试文件（可选）
      // const deleteCommand = new DeleteObjectCommand({
      //   Bucket: config.r2!.bucketName,
      //   Key: testKey,
      // });
      // await client.send(deleteCommand);
      
      return { available: true, provider: config.provider };
    }
    
    return { available: false, provider: config.provider, error: 'Unsupported provider' };
  } catch (error: any) {
    return { 
      available: false, 
      provider: config.provider, 
      error: error.message || 'Unknown error' 
    };
  }
}

// 获取存储统计信息
export function getStorageInfo(): {
  provider: string;
  enabled: boolean;
  bucketName?: string;
  publicUrl?: string;
} {
  const config = getStorageConfig();
  
  return {
    provider: config.provider,
    enabled: config.enabled,
    bucketName: config.r2?.bucketName,
    publicUrl: config.r2?.publicUrl,
  };
}
import { VercelRequest, VercelResponse } from '@vercel/node';

// 直接在这里实现存储检查逻辑，避免导入问题
function getStorageConfig() {
  return {
    provider: (process.env.STORAGE_PROVIDER as 'r2' | 's3' | 'local') || 'r2',
    enabled: process.env.STORAGE_ENABLED === 'true',
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucketName: process.env.R2_BUCKET_NAME || 'imagetech-storage',
      publicUrl: process.env.R2_PUBLIC_URL || '',
    },
  };
}

function getStorageInfo() {
  const config = getStorageConfig();
  return {
    provider: config.provider,
    enabled: config.enabled,
    bucketName: config.r2?.bucketName,
    publicUrl: config.r2?.publicUrl,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只允许GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 获取存储配置信息
    const storageInfo = getStorageInfo();
    
    return res.status(200).json({
      success: true,
      storage: storageInfo
    });
    
  } catch (error) {
    console.error('Storage API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check storage status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
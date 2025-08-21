import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 从请求头中获取API Key
    const apiKey = req.headers['x-api-key'] as string;
    
    console.log('=== Vercel环境详细调试信息 ===');
    console.log('- 请求方法:', req.method);
    console.log('- 请求URL:', req.url);
    console.log('- 请求头:', JSON.stringify(req.headers, null, 2));
    console.log('- API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined');
    console.log('- 所有环境变量:');
    console.log('  TOKEN_API_BASE_URL:', process.env.TOKEN_API_BASE_URL);
    console.log('  NODE_ENV:', process.env.NODE_ENV);
    console.log('  VERCEL:', process.env.VERCEL);
    console.log('  VERCEL_ENV:', process.env.VERCEL_ENV);
    console.log('=== 环境变量调试结束 ===');
    
    if (!apiKey) {
      console.error('缺少API Key');
      return res.status(400).json({ error: 'Missing API Key' });
    }

    // 这里需要配置实际的API服务地址
    // 根据API文档，需要调用 BASE_URL/v1/token/quota (外部API)
    let tokenApiBaseUrl = process.env.TOKEN_API_BASE_URL;
    
    // 如果环境变量未设置，使用硬编码的fallback
    if (!tokenApiBaseUrl) {
      console.warn('TOKEN_API_BASE_URL环境变量未设置，使用fallback值');
      tokenApiBaseUrl = 'https://ai.comfly.chat';
    }
    
    console.log('最终使用的API基础URL:', tokenApiBaseUrl);

    const apiUrl = `${tokenApiBaseUrl}/v1/token/quota`;
    console.log('=== API调用信息 ===');
    console.log('- 基础URL:', tokenApiBaseUrl);
    console.log('- 完整API URL:', apiUrl);
    console.log('- 请求头将包含 x-api-key:', apiKey ? '是' : '否');
    console.log('=== 开始调用外部API ===');

    // 调用外部API查询令牌余额
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log('外部API响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('外部API错误:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `External API error: ${response.status} ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('外部API返回数据:', JSON.stringify(data, null, 2));
    return res.status(200).json(data);

  } catch (error) {
    console.error('Token quota API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
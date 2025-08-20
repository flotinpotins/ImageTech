import type { FastifyInstance } from 'fastify';

export default async function tokenRoutes(app: FastifyInstance) {
  // 查询令牌余额的代理端点
  app.get('/api/token/quota', async (req, res) => {
    try {
      // 从请求头中获取API Key
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        return res.status(400).send({ error: 'Missing API Key' });
      }

      // 这里需要配置实际的API服务地址
      // 根据API文档，需要调用 BASE_URL/v1/token/quota
      // 暂时使用环境变量来配置BASE_URL
      const baseUrl = process.env.TOKEN_API_BASE_URL || 'https://api.example.com';
      const apiUrl = `${baseUrl}/v1/token/quota`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // 如果需要用户ID，可以从请求头获取
          ...(req.headers['new-api-user'] && {
            'new-api-user': req.headers['new-api-user'] as string
          })
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token API error:', response.status, errorText);
        return res.status(response.status).send({
          error: `API request failed: ${response.status} ${response.statusText}`,
          details: errorText
        });
      }

      const data = await response.json();
      console.log('Token API response:', JSON.stringify(data, null, 2));
      return res.status(200).send(data);
      
    } catch (error: any) {
      console.error('Token quota query error:', error);
      return res.status(500).send({
        error: 'Internal server error',
        message: error.message
      });
    }
  });
}
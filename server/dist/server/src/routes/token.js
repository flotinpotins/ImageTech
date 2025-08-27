export default async function tokenRoutes(app) {
    // 查询令牌余额的代理端点
    app.get('/api/token/quota', async (req, res) => {
        try {
            // 从请求头中获取API Key
            const apiKey = req.headers['x-api-key'];
            console.log('=== 本地服务器令牌查询调试信息 ===');
            console.log('- 请求方法:', req.method);
            console.log('- 请求URL:', req.url);
            console.log('- API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined');
            console.log('- TOKEN_API_BASE_URL:', process.env.TOKEN_API_BASE_URL);
            if (!apiKey) {
                console.error('缺少API Key');
                return res.status(400).send({ error: 'Missing API Key' });
            }
            // 这里需要配置实际的API服务地址
            // 根据API文档，需要调用 BASE_URL/v1/token/quota
            // 暂时使用环境变量来配置BASE_URL
            const baseUrl = process.env.TOKEN_API_BASE_URL || 'https://ai.comfly.chat';
            const apiUrl = `${baseUrl}/v1/token/quota`;
            console.log('- 基础URL:', baseUrl);
            console.log('- 完整API URL:', apiUrl);
            console.log('=== 开始调用外部API ===');
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    // 如果需要用户ID，可以从请求头获取
                    ...(req.headers['new-api-user'] && {
                        'new-api-user': req.headers['new-api-user']
                    })
                },
            });
            console.log('外部API响应状态:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('外部API错误:', response.status, errorText);
                return res.status(response.status).send({
                    error: `External API error: ${response.status} ${response.statusText}`,
                    details: errorText
                });
            }
            const data = await response.json();
            console.log('外部API返回数据:', JSON.stringify(data, null, 2));
            return res.status(200).send(data);
        }
        catch (error) {
            console.error('Token quota query error:', error);
            return res.status(500).send({
                error: 'Internal server error',
                message: error.message
            });
        }
    });
}

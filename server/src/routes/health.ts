import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(app: FastifyInstance) {
  // 健康检查端点
  app.get('/api/health', async (req, res) => {
    try {
      return res.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'AI Image Generator Backend',
        uptime: process.uptime()
      });
    } catch (error) {
      // 使用结构化日志，兼容 unknown 类型的 error
      app.log.error({ error }, 'Health check error');
      return res.status(500).send({
        status: 'error',
        error: 'Internal server error'
      });
    }
  });
}
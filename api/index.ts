import Fastify from "fastify";
import cors from "@fastify/cors";
import routes from "../server/src/routes/tasks";
import { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from "dotenv";

dotenv.config();

let app: any = null;

async function createApp() {
  if (app) return app;
  
  app = Fastify({ 
    logger: false, // 在Vercel中禁用日志
    bodyLimit: 50 * 1024 * 1024 // 50MB 请求体限制
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  });

  await app.register(routes);
  await app.ready();
  
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastifyApp = await createApp();
  fastifyApp.server.emit('request', req, res);
}
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import routes from "./routes/tasks.js";
import tokenRoutes from "./routes/token.js";
import uploadRoutes from "./routes/upload.js";
import healthRoutes from "./routes/health.js";
import dotenv from "dotenv";
dotenv.config();
const app = Fastify({
    logger: true,
    bodyLimit: 50 * 1024 * 1024 // 50MB 请求体限制
});
// 注册 multipart 插件，用于处理文件上传
await app.register(multipart, {
    attachFieldsToBody: false, // 禁用自动附加，使用手动处理
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB 文件大小限制
    },
});
await app.register(cors, {
    origin: true, // TODO: restrict to your frontend origin
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "new-api-user"],
});
await app.register(routes);
await app.register(tokenRoutes);
await app.register(uploadRoutes);
await app.register(healthRoutes);
const port = Number(process.env.PORT || 3003);
app.listen({ port, host: "0.0.0.0" }).then((address) => {
    app.log.info(`BFF listening at ${address}`);
});

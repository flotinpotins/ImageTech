import Fastify from "fastify";
import cors from "@fastify/cors";
import routes from "./routes/tasks.js";
import dotenv from "dotenv";
dotenv.config();
const app = Fastify({
    logger: true,
    bodyLimit: 50 * 1024 * 1024 // 50MB 请求体限制
});
await app.register(cors, {
    origin: true, // TODO: restrict to your frontend origin
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
});
await app.register(routes);
const port = Number(process.env.PORT || 3001);
app.listen({ port, host: "0.0.0.0" }).then((address) => {
    app.log.info(`BFF listening at ${address}`);
});

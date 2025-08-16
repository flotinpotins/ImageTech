import Fastify from "fastify";
import cors from "@fastify/cors";
import { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from "dotenv";
import { z } from "zod";
import { dispatchGenerate } from "./adapters/index.js";

dotenv.config();

let app: any = null;

async function createApp() {
  if (app) return app;
  app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  });

  const tasks = new Map<string, any>();
  const CreateSchema = z.object({
    model: z.enum(["jimeng-t2i", "jimeng-i2i", "gpt-image-1"]),
    prompt: z.string().min(1),
    provider: z.string().optional(),
    params: z
      .object({
        size: z.string().optional(),
        response_format: z.enum(["url", "b64_json"]).optional(),
        guidance_scale: z.number().optional(),
        watermark: z.boolean().optional(),
        seed: z.number().optional(),
        model: z.string().optional(),
        image: z.string().optional(),
        images: z.array(z.string()).optional(),
        mask: z.string().optional(),
        n: z.number().optional(),
        quality: z.enum(["high", "medium", "low", "auto"]).optional(),
        imageFormat: z.enum(["png", "jpg"]).optional(),
      })
      .optional(),
  });

  app.post("/api/tasks", async (req, res) => {
    const parse = CreateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).send(parse.error.flatten());
    }
    const { model, prompt, params } = parse.data;

    const apiKey = req.headers['x-api-key'] as string;

    try {
      const { urls, seed } = await dispatchGenerate(model, { prompt, ...params }, apiKey);
      const id = `tsk_${Date.now()}`;
      const payload = { id, status: "succeeded", outputUrls: urls, seed, meta: { model, params }, prompt };
      tasks.set(id, payload);
      res.send({ id, seed });
    } catch (e: any) {
      res.status(502).send(e?.message || "provider error");
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const id = (req.params as any)?.id as string;
    const t = tasks.get(id);
    if (!t) return res.status(404).send("not found");
    res.send(t);
  });

  await app.ready();
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastifyApp = await createApp();
  fastifyApp.server.emit('request', req, res);
}



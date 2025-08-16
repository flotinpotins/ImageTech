import { FastifyInstance } from "fastify";
import { z } from "zod";
import { dispatchGenerate } from "../adapters/index.js";

const tasks = new Map();

const CreateSchema = z.object({
  model: z.enum(["jimeng-t2i", "jimeng-i2i", "gpt-image-1"]),
  prompt: z.string().min(1),
  provider: z.string().optional(), // 兼容前端现有字段
  params: z
    .object({
      size: z.string().optional(),
      response_format: z.enum(["url", "b64_json"]).optional(),
      guidance_scale: z.number().optional(),
      watermark: z.boolean().optional(),
      seed: z.number().optional(),
      model: z.string().optional(), // 兼容前端传递的内部模型名
      image: z.string().optional(), // i2i 图片数据
      images: z.array(z.string()).optional(), // i2i 图片数组
      // gpt-image-1 特有
      mask: z.string().optional(),
      n: z.number().optional(),
      quality: z.enum(["high", "medium", "low", "auto"]).optional(),
    })
    .optional(),
});

export default async function routes(app: FastifyInstance) {
  app.post("/api/tasks", async (req, res) => {
    const parse = CreateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).send(parse.error.flatten());
    }
    const { model, prompt, params } = parse.data;
    
    // 从请求头中获取API Key
    const apiKey = req.headers['x-api-key'] as string;
    
    try {
      const { urls, seed } = await dispatchGenerate(model, { prompt, ...params }, apiKey);
      const id = `tsk_${Date.now()}`;
      const payload = {
        id,
        status: "succeeded",
        outputUrls: urls,
        seed,
        meta: { model, params },
        prompt,
      };
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
}
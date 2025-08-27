import { FastifyInstance } from "fastify";
import { z } from "zod";
import { dispatchGenerate } from "../adapters/index.js";

const tasks = new Map();

// 传统格式的schema
const CreateSchema = z.object({
  model: z.enum(["jimeng-t2i", "gpt-image-1", "gemini-2.5-flash-image-preview", "nano-banana"]),
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
      quality: z.enum(["high", "medium", "low"]).optional(),
      // nano-banana 特有
      mode: z.enum(["text-to-image", "image-to-image"]).optional(),

    })
    .optional(),
});

// Tool Calling格式的schema (用于gemini-2.5-flash-image-preview)
const ToolCallingSchema = z.object({
  model: z.enum(["gemini-2.5-flash-image-preview"]),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string()
  })),
  tools: z.array(z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.object({
        type: z.literal("object"),
        properties: z.record(z.any()),
        required: z.array(z.string()).optional()
      })
    })
  })),
  tool_choice: z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string()
    })
  }).optional()
});

export default async function routes(app: FastifyInstance) {
  app.post("/api/tasks", async (req, res) => {
    console.log('=== TASKS DEBUG ===');
    const apiKey = req.headers['x-api-key'] as string;

    // 优先处理 multipart/form-data 请求 (用于图生图)
    if (req.isMultipart()) {
      console.log('Multipart request detected.');
      
      try {
        // 当启用 attachFieldsToBody: true 时，文件和字段都会附加到 req.body
        const body = req.body as { [key: string]: any };
        console.log('Received body keys:', Object.keys(body));
        console.log('Body content:', body);
        
        // 检查是否有 image 字段
        if (!body.image) {
          console.log('ERROR: No image field found in multipart request');
          return res.status(400).send({ message: "Image file is required for multipart request." });
        }
        
        // 获取图片数据 (可能是 Buffer 或文件对象)
        const imageData = body.image;
        let imageBuffer: Buffer;
        
        if (Buffer.isBuffer(imageData)) {
          imageBuffer = imageData;
        } else if (imageData && typeof imageData === 'object' && 'toBuffer' in imageData) {
          // 如果是文件对象，调用 toBuffer()
          imageBuffer = await imageData.toBuffer();
        } else {
          console.log('ERROR: Invalid image data type:', typeof imageData);
          return res.status(400).send({ message: "Invalid image data format." });
        }
        
        console.log(`Received image buffer, size: ${imageBuffer.length}`);

        // 获取其他字段
        const fields = { ...body };
        delete fields.image; // 移除 image 字段，避免重复
        console.log('Received fields:', fields);
        console.log('Fields keys:', Object.keys(fields));

        // 提取字段值 (attachFieldsToBody: true 会将字段包装成对象)
        const model = fields.model?.value || fields.model;
        const prompt = fields.prompt?.value || fields.prompt;
        
        // 提取其他参数的值
        const params: any = {};
        Object.entries(fields).forEach(([key, field]) => {
          if (key !== 'model' && key !== 'prompt') {
            params[key] = (field as any)?.value || field;
          }
        });
        
        console.log('Extracted model:', model, 'prompt:', prompt);
        console.log('Extracted params:', params);

        if (model !== 'nano-banana') {
            console.log('ERROR: Invalid model for multipart:', model);
            return res.status(400).send({ message: "Multipart is only supported for 'nano-banana' model." });
        }

        if (!prompt) {
            console.log('ERROR: Missing prompt in multipart request');
            return res.status(400).send({ message: "Prompt is required." });
        }

        const requestPayload = { prompt, ...params, image: imageBuffer };
        console.log('Calling dispatchGenerate with payload keys:', Object.keys(requestPayload));
        
        const result = await dispatchGenerate(model, requestPayload, apiKey);
        
        const id = `tsk_${Date.now()}`;
        const { urls, seed } = result;
        const responsePayload = {
          id,
          status: "succeeded",
          outputUrls: urls,
          seed,
          meta: { model, params },
          prompt,
        };
        tasks.set(id, responsePayload);
        res.send({ id, seed });

      } catch (e: any) {
        console.log('ERROR in multipart processing:', e.message);
        console.log('Error stack:', e.stack);
        res.status(500).send({ message: e?.message || "Internal server error" });
      }
      return;
    }
    
    // --- 处理 application/json 请求 ---
    const body = req.body || {};
    const imageLen = typeof (body as any).image === 'string' ? (body as any).image.length : 0;
    console.log('JSON Request body keys:', Object.keys(body));
    console.log('Image provided:', !!(body as any).image, 'length:', imageLen);
    console.log('==================');
    
    // 首先尝试Tool Calling格式
    const toolCallingParse = ToolCallingSchema.safeParse(req.body);
    
    if (toolCallingParse.success) {
      // 处理Tool Calling格式请求
      const { model, messages, tools, tool_choice } = toolCallingParse.data;
      
      try {
        // 对于Tool Calling格式，直接传递完整的请求体给适配器
        const result = await dispatchGenerate(model, req.body, apiKey);
        const id = `tsk_${Date.now()}`;
        
        // 处理同步任务
        const { urls, seed } = result;
        const payload = {
          id,
          status: "succeeded",
          outputUrls: urls,
          seed,
          meta: { model, tool_calling: true },
          prompt: messages[0]?.content || "Tool calling request",
        };
        tasks.set(id, payload);
        res.send({ id, seed });
      } catch (e: any) {
        res.status(502).send(e?.message || "provider error");
      }
      return;
    }
    
    // 如果不是Tool Calling格式，尝试传统格式
    const parse = CreateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).send(parse.error.flatten());
    }
    const { model, prompt, params } = parse.data;
    
    try {
      // 构建传递给适配器的requestPayload，确保特殊参数在顶层
      const requestPayload = { prompt, ...params };
      
      // 对于nano-banana模型，确保image和mode参数在顶层
      if (model === 'nano-banana' && params) {
        if (params.image) requestPayload.image = params.image;
        if (params.mode) requestPayload.mode = params.mode;
      }
      
      const result = await dispatchGenerate(model, requestPayload, apiKey);
      const id = `tsk_${Date.now()}`;
      
      // 处理同步任务
      const { urls, seed } = result;
      const responsePayload = {
        id,
        status: "succeeded",
        outputUrls: urls,
        seed,
        meta: { model, params },
        prompt,
      };
      tasks.set(id, responsePayload);
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

  // 处理查询参数格式的GET请求 /api/tasks?taskId=xxx
  app.get("/api/tasks", async (req, res) => {
    const taskId = (req.query as any)?.taskId as string;
    if (!taskId) {
      return res.status(400).send("Missing taskId parameter");
    }
    const t = tasks.get(taskId);
    if (!t) return res.status(404).send("not found");
    
    res.send(t);
  });
}
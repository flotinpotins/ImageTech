import { FastifyInstance } from "fastify";
import { z } from "zod";
import { dispatchGenerate } from "../adapters/index.js";
import { saveTask, getTask } from "../../../api/tasks.js";

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
        const parts = req.parts();
        const fields: { [key: string]: any } = {};
        let imageBuffer: Buffer | null = null;
        let partCount = 0;

        for await (const part of parts) {
          partCount++;
          console.log(`Processing part ${partCount}: type=${part.type}, fieldname=${part.fieldname}`);
          
          if (part.type === 'file') {
            console.log(`File part details: fieldname=${part.fieldname}, filename=${part.filename}, mimetype=${part.mimetype}`);
            if (part.fieldname === 'image') {
              imageBuffer = await part.toBuffer();
              console.log(`Received image buffer, size: ${imageBuffer.length}`);
            }
          } else if (part.type === 'field') {
            console.log(`Field part: ${part.fieldname} = ${part.value}`);
            fields[part.fieldname] = part.value;
          }
        }

        console.log(`Total parts processed: ${partCount}`);
        console.log(`ImageBuffer exists: ${!!imageBuffer}`);
        
        if (!imageBuffer) {
          console.log('ERROR: No image buffer found in multipart request');
          return res.status(400).send({ message: "Image file is required for multipart request." });
        }

        console.log('Received fields:', fields);

        const { model, prompt, ...params } = fields;

        if (model !== 'nano-banana') {
            console.log('ERROR: Invalid model for multipart:', model);
            return res.status(400).send({ message: "Multipart is only supported for 'nano-banana' model." });
        }

        if (!prompt) {
            console.log('ERROR: Missing prompt in multipart request');
            return res.status(400).send({ message: "Prompt is required." });
        }

        // 确保 mode 参数正确设置
        if (!params.mode) {
          params.mode = 'image-to-image';
        }
        
        // 将 Buffer 转换为 base64 字符串，因为 editGeminiImage 期望 DataURL
        console.log('Converting imageBuffer to base64, buffer size:', imageBuffer.length);
        const imageBase64 = imageBuffer.toString('base64');
        const imageDataUrl = `data:image/png;base64,${imageBase64}`;
        console.log('Generated imageDataUrl length:', imageDataUrl.length);
        console.log('ImageDataUrl preview:', imageDataUrl.substring(0, 100) + '...');
        
        const requestPayload = { 
          prompt, 
          ...params, 
          image: imageDataUrl,
          mode: 'image-to-image',
          n: params.n || 1,
          size: params.size || '1024x1024'
        };
        console.log('Calling dispatchGenerate with payload:', {
          prompt: requestPayload.prompt,
          mode: requestPayload.mode,
          n: requestPayload.n,
          size: requestPayload.size,
          imageLength: requestPayload.image.length
        });
        
        const result = await dispatchGenerate(model, requestPayload, apiKey);
        
        const id = `tsk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const { urls, seed } = result;
        const responsePayload = {
          id,
          status: "succeeded",
          outputUrls: urls,
          seed,
          meta: { model, params: params || {} },
          prompt,
        };
        
        // 保存到内存和数据库
        tasks.set(id, responsePayload);
        try {
          await saveTask(responsePayload);
          console.log(`Task ${id} saved to database successfully`);
        } catch (dbError) {
          console.error(`Failed to save task ${id} to database:`, dbError);
        }
        
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
        const id = `tsk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 处理同步任务
        const { urls, seed } = result;
        const payload = {
          id,
          status: "succeeded",
          outputUrls: urls,
          seed,
          meta: { model, params: { tool_calling: true } },
          prompt: messages[0]?.content || "Tool calling request",
        };
        
        // 保存到内存和数据库
        tasks.set(id, payload);
        try {
          await saveTask(payload);
          console.log(`Task ${id} saved to database successfully`);
        } catch (dbError) {
          console.error(`Failed to save task ${id} to database:`, dbError);
        }
        
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
      const id = `tsk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 处理同步任务
      const { urls, seed } = result;
      const responsePayload = {
        id,
        status: "succeeded",
        outputUrls: urls,
        seed,
        meta: { model, params: params || {} },
        prompt,
      };
      
      // 保存到内存和数据库
      tasks.set(id, responsePayload);
      try {
        await saveTask(responsePayload);
        console.log(`Task ${id} saved to database successfully`);
      } catch (dbError) {
        console.error(`Failed to save task ${id} to database:`, dbError);
      }
      
      res.send({ id, seed });
    } catch (e: any) {
      res.status(502).send(e?.message || "provider error");
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const id = (req.params as any)?.id as string;
    
    // 先从内存查询
    let t = tasks.get(id);
    
    // 如果内存中没有，从数据库查询
    if (!t) {
      try {
        t = await getTask(id);
        if (t) {
          // 将数据库中的任务缓存到内存
          tasks.set(id, t);
        }
      } catch (dbError) {
        console.error(`Failed to get task ${id} from database:`, dbError);
      }
    }
    
    if (!t) return res.status(404).send("not found");
    
    res.send(t);
  });

  // 处理查询参数格式的GET请求 /api/tasks?taskId=xxx
  app.get("/api/tasks", async (req, res) => {
    const taskId = (req.query as any)?.taskId as string;
    if (!taskId) {
      return res.status(400).send("Missing taskId parameter");
    }
    
    // 先从内存查询
    let t = tasks.get(taskId);
    
    // 如果内存中没有，从数据库查询
    if (!t) {
      try {
        t = await getTask(taskId);
        if (t) {
          // 将数据库中的任务缓存到内存
          tasks.set(taskId, t);
        }
      } catch (dbError) {
        console.error(`Failed to get task ${taskId} from database:`, dbError);
      }
    }
    
    if (!t) return res.status(404).send("not found");
    
    res.send(t);
  });
}
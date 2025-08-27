import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateGeminiImage, editGeminiImage } from './adapters/comfly_gemini.js';
import formidable from 'formidable';
import { readFileSync } from 'fs';

const tasks = new Map<string, any>();

// 导出tasks Map以便其他文件使用
export { tasks };

// T2I Types and Functions
export type T2IParams = {
  prompt: string;
  size?: string;
  seed?: number;
  guidance_scale?: number;
  watermark?: boolean;
  imageFormat?: string; // "png"|"jpg", 默认 "png"
};

export async function generateJimengT2I(p: T2IParams, apiKey?: string) {
  const base = process.env.PROVIDER_BASE_URL!;
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!base || !key) throw new Error("MISSING_PROVIDER_CONFIG");

  const body: Record<string, any> = {
    model: "doubao-seedream-3-0-t2i-250415",
    prompt: p.prompt,
    response_format: "b64_json",
    size: p.size,
    seed: p.seed,
    guidance_scale: p.guidance_scale,
    watermark: p.watermark ?? false,
  };

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 120_000);
  try {
    const url = `${base}/v1/images/generations`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => r.statusText);
      throw new Error(`PROVIDER_${r.status}:${msg}`);
    }
    const j: any = await r.json();
    
    const data = j?.data || [];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('PROVIDER_EMPTY_RESULTS');
    }
    
    const imageFormat = p.imageFormat || 'png';
    const mimeType = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const urls = data
      .map((item: any) => item.b64_json)
      .filter(Boolean)
      .map((b64: string) => `data:${mimeType};base64,${b64}`);
    
    if (urls.length === 0) {
      throw new Error('PROVIDER_NO_VALID_IMAGES');
    }
    
    return { urls, seed: p.seed };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("PROVIDER_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(to);
  }
}

// GPT Image Types and Functions
export type GPTImageParams = {
  prompt: string;
  images?: string[];
  mask?: string;
  size?: string;
  n?: number;
  quality?: string;
  imageFormat?: string;
};

function dataURLToBuffer(dataURL: string): { buffer: Buffer; mimeType: string } {
  const matches = dataURL.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
  if (!matches) {
    throw new Error('Invalid dataURL format');
  }
  
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  return { buffer, mimeType };
}

function getFileExtension(mimeType: string): string {
  const ext = mimeType.split('/')[1];
  return ext === 'jpeg' ? 'jpg' : ext;
}

export async function generateGPTImage(p: GPTImageParams, apiKey?: string) {
  const base = process.env.PROVIDER_BASE_URL!;
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!base || !key) throw new Error("MISSING_PROVIDER_CONFIG");

  const hasImages = p.images && p.images.length > 0;
  const endpoint = hasImages ? '/v1/images/edits' : '/v1/images/generations';
  const url = `${base}${endpoint}`;

  let body: any;
  let headers: any = {
    'Authorization': `Bearer ${key}`,
  };

  if (hasImages) {
    const formData = new FormData();
    formData.append('prompt', p.prompt);
    
    if (p.images && p.images[0]) {
      const { buffer, mimeType } = dataURLToBuffer(p.images[0]);
      const ext = getFileExtension(mimeType);
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      formData.append('image', blob, `image.${ext}`);
    }
    
    if (p.mask) {
      const { buffer, mimeType } = dataURLToBuffer(p.mask);
      const ext = getFileExtension(mimeType);
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      formData.append('mask', blob, `mask.${ext}`);
    }
    
    if (p.size && p.size !== 'auto') formData.append('size', p.size);
    if (p.n) formData.append('n', p.n.toString());
    // 注意：quality 在图像编辑模式下不被支持，不传递以避免提供商错误
    
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      model: 'gpt-image-1',
      prompt: p.prompt,
      size: p.size || '1024x1024',
      n: p.n || 1,
      quality: p.quality || 'high'
    });
  }

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 120_000);
  
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: ctl.signal,
    });
    
    if (!r.ok) {
      const msg = await r.text().catch(() => r.statusText);
      throw new Error(`PROVIDER_${r.status}:${msg}`);
    }
    
    const j: any = await r.json();
    const data = j?.data || [];
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('PROVIDER_EMPTY_RESULTS');
    }
    
    // 处理不同格式的响应数据
    const imageFormat = p.imageFormat || 'png';
    const mimeType = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const urls = data
      .map((item: any) => {
        // 支持 b64_json 和 url 两种格式
        if (item.b64_json) {
          return `data:${mimeType};base64,${item.b64_json}`;
        } else if (item.url) {
          return item.url;
        }
        return null;
      })
      .filter(Boolean);
    
    if (urls.length === 0) {
      throw new Error('PROVIDER_NO_VALID_IMAGES');
    }
    
    return { urls, seed: undefined };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("PROVIDER_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(to);
  }
}

// Dispatch Function
export async function dispatchGenerate(model: string, payload: any, apiKey?: string) {
  if (model === "jimeng-t2i") {
    return generateJimengT2I({
      prompt: payload.prompt,
      size: payload?.size ?? payload?.params?.size,
      seed: payload?.seed ?? payload?.params?.seed,
      guidance_scale: payload?.guidance_scale ?? payload?.params?.guidance_scale,
      watermark: payload?.watermark ?? payload?.params?.watermark ?? false,
      imageFormat: payload?.imageFormat ?? payload?.params?.imageFormat,
    }, apiKey);
  }
  
  if (model === "gpt-image-1") {
    return generateGPTImage({
      prompt: payload.prompt,
      images: payload?.images ?? payload?.params?.images,
      mask: payload?.mask ?? payload?.params?.mask,
      size: payload?.size ?? payload?.params?.size,
      n: payload?.n ?? payload?.params?.n,
      quality: payload?.quality ?? payload?.params?.quality,
      imageFormat: payload?.imageFormat ?? payload?.params?.imageFormat,
    }, apiKey);
  }
  

  
  if (model === "gemini-2.5-flash-image-preview") {
    return generateGeminiImage({
      prompt: payload.prompt,
      images: payload?.images ?? payload?.params?.images,
      size: payload?.size ?? payload?.params?.size,
      n: payload?.n ?? payload?.params?.n,
      quality: payload?.quality ?? payload?.params?.quality,
    }, apiKey);
  }

  if (model === "nano-banana") {
    const mode = payload?.mode ?? payload?.params?.mode ?? 'text-to-image';
    const image = payload?.image ?? payload?.params?.image;
    
    console.log('nano-banana模型处理:', { 
      mode, 
      hasImage: !!image,
      imageLength: image ? image.length : 0,
      payloadKeys: Object.keys(payload || {}),
      paramsKeys: Object.keys(payload?.params || {})
    });
    
    if (mode === 'image-to-image') {
      if (!image) {
        console.error('NANO_BANANA_MISSING_IMAGE - payload:', JSON.stringify(payload, null, 2));
        throw new Error('NANO_BANANA_MISSING_IMAGE');
      }
      console.log('调用editGeminiImage，图片长度:', image.length);
      return editGeminiImage({
        prompt: payload.prompt,
        image: image,
        size: payload?.size ?? payload?.params?.size,
        n: payload?.n ?? payload?.params?.n,
        quality: payload?.quality ?? payload?.params?.quality,
        response_format: payload?.response_format ?? payload?.params?.response_format,
      }, apiKey);
    } else {
      return generateGeminiImage({
        prompt: payload.prompt,
        size: payload?.size ?? payload?.params?.size,
        n: payload?.n ?? payload?.params?.n,
        quality: payload?.quality ?? payload?.params?.quality,
        response_format: payload?.response_format ?? payload?.params?.response_format,
      }, apiKey);
    }
  }

  throw new Error(`UNSUPPORTED_MODEL:${model}`);
}

// Helper function to parse multipart form data
async function parseMultipartForm(req: VercelRequest): Promise<{ fields: any; files: any }> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true,
    });
    
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
}

// Helper function to convert file to base64 data URL
function fileToDataURL(filePath: string, mimeType: string): string {
  const fileBuffer = readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

// Main Handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    if (req.method === 'POST') {
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        return res.status(401).json({ error: { code: "invalid_request", message: "未提供令牌", type: "new_api_error" } });
      }
      
      let body: any;
      
      // Check if request is multipart/form-data
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        console.log('Processing multipart/form-data request');
        
        try {
          const { fields, files } = await parseMultipartForm(req);
          console.log('Parsed fields:', Object.keys(fields));
          console.log('Parsed files:', Object.keys(files));
          
          // Convert formidable fields format to our expected format
          body = {
            model: Array.isArray(fields.model) ? fields.model[0] : fields.model,
            prompt: Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt,
            params: {
              mode: Array.isArray(fields.mode) ? fields.mode[0] : fields.mode,
              response_format: Array.isArray(fields.response_format) ? fields.response_format[0] : fields.response_format,
            }
          };
          
          // Handle uploaded image file
          if (files.image) {
            const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
            if (imageFile && imageFile.filepath) {
              // Convert uploaded file to data URL
              const mimeType = imageFile.mimetype || 'image/png';
              const dataURL = fileToDataURL(imageFile.filepath, mimeType);
              body.params.image = dataURL;
              console.log('Image converted to data URL, size:', dataURL.length);
            }
          }
        } catch (parseError) {
          console.error('Error parsing multipart form:', parseError);
          return res.status(400).json({ error: 'Failed to parse multipart form data' });
        }
      } else {
        // Regular JSON request
        body = req.body;
      }
      
      if (!body || !body.model || !body.prompt) {
        return res.status(400).json({ error: "Missing required fields: model, prompt" });
      }
      
      const taskId = `tsk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        console.log('开始处理图片生成请求:', { model: body.model, prompt: body.prompt });
        
        const { urls, seed } = await dispatchGenerate(body.model, { prompt: body.prompt, ...body.params }, apiKey);
        
        const payload = {
          id: taskId,
          status: "succeeded",
          outputUrls: urls,
          seed,
          meta: { model: body.model, params: body.params },
          prompt: body.prompt,
        };
        
        tasks.set(taskId, payload);
        
        return res.status(200).json({ id: taskId });
        
      } catch (apiError: any) {
        console.error('图片生成API调用失败:', apiError);
        
        const errorPayload = {
          id: taskId,
          status: "failed",
          error: apiError.message || 'Unknown error',
          meta: { model: body.model, params: body.params },
          prompt: body.prompt,
        };
        
        tasks.set(taskId, errorPayload);
        
        return res.status(200).json({ id: taskId });
      }
    }
    
    if (req.method === 'GET') {
      const { query } = req;
      
      // 处理 /api/tasks?taskId=xxx 格式的请求
      const taskId = Array.isArray(query.taskId) ? query.taskId[0] : query.taskId;
      
      if (!taskId) {
        return res.status(400).json({ error: "Missing taskId parameter" });
      }
      
      const task = tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      return res.status(200).json(task);
    }
    
    return res.status(405).json({ error: "Method not allowed" });
    
  } catch (error: any) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
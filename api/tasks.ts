import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateGeminiImage } from './adapters/comfly_gemini.js';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import { Client } from 'pg';
import { uploadImagesToStorage } from './storage.js';
import { generateNanoBanana, editNanoBanana } from './adapters/nano_banana.js';
import { generateGPTImage as generateGPTImageAdapter } from './adapters/gpt_image_1.js';

// 数据库连接
function createDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// 数据库操作函数
export async function saveTask(taskData: any) {
  const client = createDbClient();
  try {
    await client.connect();
    // 安全序列化参数
    let serializedParams = '{}';
    try {
      const paramsToSerialize = taskData.meta?.params || {};
      // 确保参数是可序列化的对象
      if (typeof paramsToSerialize === 'object' && paramsToSerialize !== null) {
        serializedParams = JSON.stringify(paramsToSerialize);
      }
    } catch (error) {
      console.error(`Failed to serialize params for task ${taskData.id}:`, error);
      serializedParams = '{}';
    }
    
    await client.query(
      `INSERT INTO tasks (id, model, prompt, params, status, seed, error, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET 
       status = $5, seed = $6, error = $7, updated_at = NOW()`,
      [taskData.id, taskData.meta?.model, taskData.prompt, serializedParams, 
        taskData.status, taskData.seed, taskData.error]
     );
    
    // 处理图片存储
    if (taskData.outputUrls && taskData.outputUrls.length > 0) {
      // 检查是否为Base64数据URL，如果是则上传到对象存储
      const dataUrls = taskData.outputUrls.filter((url: string) => url.startsWith('data:'));
      const regularUrls = taskData.outputUrls.filter((url: string) => !url.startsWith('data:'));
      
      let finalUrls = [...regularUrls]; // 保留非Base64的URL
      let storageProvider = 'external'; // 外部URL的默认提供商
      
      // 如果有Base64数据，尝试上传到对象存储
      if (dataUrls.length > 0) {
        try {
          console.log(`Uploading ${dataUrls.length} images to object storage for task ${taskData.id}`);
          const uploadResults = await uploadImagesToStorage(dataUrls, {
            prefix: `task_${taskData.id}`,
            metadata: {
              taskId: taskData.id,
              model: taskData.meta?.model || 'unknown'
            }
          });
          
          // 使用上传后的URL
          const uploadedUrls = uploadResults.map(result => result.url);
          finalUrls.push(...uploadedUrls);
          
          // 检查是否成功上传到对象存储
          const hasObjectStorageUrls = uploadResults.some(result => result.key && result.key.length > 0);
          storageProvider = hasObjectStorageUrls ? 'r2' : 'database';
          
          console.log(`Successfully processed ${uploadResults.length} images, storage provider: ${storageProvider}`);
        } catch (uploadError) {
          console.error(`Failed to upload images for task ${taskData.id}:`, uploadError);
          // 如果上传失败，回退到原始Base64 URL
          finalUrls.push(...dataUrls);
          storageProvider = 'database';
        }
      }
      
      // 保存图片记录到数据库
      for (let i = 0; i < finalUrls.length; i++) {
        const url = finalUrls[i];
        const isDataUrl = url.startsWith('data:');
        
        // 从URL或参数中推断图片格式
        let format = 'png'; // 默认格式
        if (isDataUrl) {
          const mimeMatch = url.match(/data:image\/(\w+);/);
          if (mimeMatch) {
            format = mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1];
          }
        } else if (taskData.meta?.params?.imageFormat) {
          format = taskData.meta.params.imageFormat;
        }
        
        // 确保format不为空
        if (!format || format.trim() === '') {
          format = 'png';
        }
        
        // 确定存储提供商和迁移状态
        const currentStorageProvider = isDataUrl ? 'database' : storageProvider;
        const isMigrated = !isDataUrl;
        
        await client.query(
          `INSERT INTO images (task_id, url, provider, format, storage_provider, is_migrated, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT DO NOTHING`,
          [taskData.id, url, taskData.meta?.model || 'unknown', format, currentStorageProvider, isMigrated]
        );
      }
    }
  } finally {
    await client.end();
  }
}

export async function getTask(taskId: string) {
  const client = createDbClient();
  try {
    await client.connect();
    const taskResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1',
      [taskId]
    );
    
    if (taskResult.rows.length === 0) {
      return null;
    }
    
    const task = taskResult.rows[0];
    
    // 获取关联的图片
    const imagesResult = await client.query(
      'SELECT url FROM images WHERE task_id = $1 ORDER BY created_at',
      [taskId]
    );

    // 将历史上保存为 S3 API 域名的 R2 URL 动态映射到公开域名，避免 403 无法预览
    const publicBase = process.env.R2_PUBLIC_URL || '';
    const normalizeUrl = (url: string) => {
      try {
        if (!url || url.startsWith('data:')) return url;
        if (!publicBase) return url;
        if (url.startsWith(publicBase)) return url;
        const m = url.match(/^https?:\/\/[^.]+\.[^.]+\.r2\.cloudflarestorage\.com\/(.+)$/);
        if (m && m[1]) {
          return `${publicBase.replace(/\/$/, '')}/${m[1]}`;
        }
        return url;
      } catch {
        return url;
      }
    };
    
    // 安全解析JSON参数
    let parsedParams = {};
    if (task.params) {
      try {
        // 检查是否是有效的JSON字符串
        if (typeof task.params === 'string' && task.params !== '[object Object]') {
          parsedParams = JSON.parse(task.params);
        } else {
          console.warn(`Invalid JSON params for task ${taskId}: ${task.params}`);
          parsedParams = {};
        }
      } catch (error) {
        console.error(`Failed to parse JSON params for task ${taskId}:`, error);
        parsedParams = {};
      }
    }
    
    return {
      id: task.id,
      status: task.status,
      outputUrls: imagesResult.rows.map(row => normalizeUrl(row.url)),
      seed: task.seed,
      error: task.error,
      meta: parsedParams,
      prompt: task.prompt
    };
  } finally {
    await client.end();
  }
}

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

// GPT Image functions are now imported from adapters/gpt_image_1.js

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
    return generateGPTImageAdapter({
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
    const images = payload?.images ?? payload?.params?.images;
    const n = payload?.n ?? payload?.params?.n;
    const seed = payload?.seed ?? payload?.params?.seed;

    console.log('nano-banana模型处理(tasks.ts):', {
      mode,
      hasImage: !!image,
      imagesLen: Array.isArray(images) ? images.length : 0,
    });

    if (mode === 'image-to-image') {
      if (!image && (!images || images.length === 0)) {
        console.error('NANO_BANANA_MISSING_IMAGE - payload:', JSON.stringify(payload, null, 2));
        throw new Error('NANO_BANANA_MISSING_IMAGE');
      }
      return editNanoBanana({
        prompt: payload.prompt,
        image,
        images,
        n,
        seed,
      }, apiKey);
    } else {
      return generateNanoBanana({
        prompt: payload.prompt,
        images,
        n,
        seed,
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
            params: {}
          };
          
          // Add all other fields to params (except model and prompt)
          Object.keys(fields).forEach(key => {
            if (key !== 'model' && key !== 'prompt') {
              const value = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
              body.params[key] = value;
            }
          });
          
          console.log('Parsed body.params:', body.params);
          
          // Handle uploaded image files - support both 'image' and 'images' field names
          const imageFiles = [];
          
          // Check for 'images' field (multiple files)
          if (files.images) {
            const imagesArray = Array.isArray(files.images) ? files.images : [files.images];
            imageFiles.push(...imagesArray);
          }
          
          // Check for 'image' field (single file) - for backward compatibility
          if (files.image) {
            const imageArray = Array.isArray(files.image) ? files.image : [files.image];
            imageFiles.push(...imageArray);
          }
          
          if (imageFiles.length > 0) {
            console.log(`Processing ${imageFiles.length} uploaded image(s)`);
            const imageDataUrls = imageFiles.map((imageFile, index) => {
              if (imageFile && imageFile.filepath) {
                const mimeType = imageFile.mimetype || 'image/png';
                const dataURL = fileToDataURL(imageFile.filepath, mimeType);
                console.log(`Image ${index + 1} converted to data URL, size:`, dataURL.length);
                return dataURL;
              }
              return null;
            }).filter(Boolean);
            
            // Store images in the same format as backend server
            if (imageDataUrls.length === 1) {
              // Single image - store as both 'image' and 'images' for compatibility
              body.params.image = imageDataUrls[0];
              body.params.images = imageDataUrls;
            } else if (imageDataUrls.length > 1) {
              // Multiple images - store as 'images' array and first image as 'image'
              body.params.images = imageDataUrls;
              body.params.image = imageDataUrls[0];
            }
            
            console.log('Images processed:', {
              imageCount: imageDataUrls.length,
              hasImage: !!body.params.image,
              hasImages: !!body.params.images
            });
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
        
        await saveTask(payload);
        
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
        
        await saveTask(errorPayload);
        
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
      
      const task = await getTask(taskId);
      
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
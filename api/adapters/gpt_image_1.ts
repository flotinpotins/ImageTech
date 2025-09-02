// 使用内置的 fetch 和 FormData
import { uploadImageToStorage } from '../storage.js';

// 辅助函数：将dataURL转换为Buffer
function dataURLToBuffer(dataURL: string): { buffer: Buffer; mimeType: string } {
  const matches = dataURL.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URL format');
  }
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType };
}

// 辅助函数：将Buffer转换为dataURL
function bufferToDataURL(buffer: Buffer, mimeType: string): string {
  const base64Data = buffer.toString('base64');
  return `data:${mimeType};base64,${base64Data}`;
}

export type GPTImageParams = {
  prompt: string;
  images?: string[];  // dataURL 数组
  mask?: string;      // dataURL (PNG)
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
  imageFormat?: string; // "png"|"jpg", 默认 "png"
};



// 获取文件扩展名
function getFileExtension(mimeType: string): string {
  const ext = mimeType.split('/')[1];
  return ext === 'jpeg' ? 'jpg' : ext;
}

export async function generateGPTImage(p: GPTImageParams, apiKey?: string) {
  // 添加详细的参数日志
  console.log('=== GPT Image Generation Request ===');
  console.log('Prompt:', p.prompt);
  console.log('Images count:', p.images?.length || 0);
  console.log('Has mask:', !!p.mask);
  console.log('Size:', p.size);
  console.log('N:', p.n);
  console.log('Quality:', p.quality);
  console.log('API Key provided:', !!apiKey);
  console.log('=====================================');
  
  const base = process.env.PROVIDER_BASE_URL!;
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!base || !key) throw new Error("MISSING_PROVIDER_CONFIG");

  // 根据是否有 images 决定走哪个端点
  const hasImages = p.images && p.images.length > 0;
  const endpoint = hasImages ? '/v1/images/edits' : '/v1/images/generations';
  const url = `${base}${endpoint}`;

  let body: any;
  let headers: Record<string, string> = {
    'Authorization': `Bearer ${key}`,
  };

  if (hasImages) {
    // 图像编辑模式 - 使用 multipart/form-data
    const form = new FormData();
    
    // 添加图片（仅使用第一张，以兼容提供商的 edits 接口约束）
    const editImages = (p.images || []).slice(0, 1);
    for (let i = 0; i < editImages.length; i++) {
      const { buffer, mimeType } = dataURLToBuffer(editImages[i]);
      const ext = getFileExtension(mimeType);
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      form.append('image', blob, `image_${i}.${ext}`);
    }
    
    // 添加 mask (如果有)
    if (p.mask) {
      const { buffer, mimeType } = dataURLToBuffer(p.mask);
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      form.append('mask', blob, 'mask.png');
    }
    
    // 添加其他参数
    form.append('prompt', p.prompt);
    form.append('model', 'gpt-image-1');
    // 移除 response_format 参数，因为提供商不支持
    
    if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
      form.append('size', p.size);
    }
    // 总是传递 n 参数，默认为 1
    form.append('n', (p.n || 1).toString());
    // 尝试传递 quality 参数，如果提供商不支持会忽略
    if (p.quality) {
      form.append('quality', p.quality);
    }
    
    body = form;
    // 在Vercel环境中，FormData会自动设置正确的Content-Type
    // 不需要手动设置headers
  } else {
    // 文生图模式 - 使用 JSON
    headers['Content-Type'] = 'application/json';
    
    const jsonBody: Record<string, any> = {
      model: 'gpt-image-1',
      prompt: p.prompt,
      // 移除 response_format 参数，因为提供商不支持
    };
    
    if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
      jsonBody.size = p.size;
    }
    // 总是传递 n 参数，默认为 1
    jsonBody.n = p.n || 1;
    // 为避免供应商参数不兼容，暂不传递 quality 字段
    
    body = JSON.stringify(jsonBody);
  }

  // 发送请求
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 300_000); // 300s 超时，处理大图片
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: ctl.signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error('=== GPT Image API Error ===');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      console.error('Error Response:', errorText);
      console.error('Request URL:', url);
      console.error('API Key used:', key ? `${key.substring(0, 10)}...` : 'None');
      console.error('============================');
      throw new Error(`PROVIDER_${response.status}:${errorText}`);
    }
    
    const result: any = await response.json();
    
    // 处理响应数据
    const data = result.data || [];
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
    
    // 将图片上传到R2存储
     const uploadedUrls = [];
     for (const url of urls) {
       try {
         let dataURL: string;
         
         if (url.startsWith('data:')) {
           // 已经是dataURL格式
           dataURL = url;
         } else {
           // 处理URL，下载图片并转换为dataURL
           const imageResponse = await fetch(url);
           if (!imageResponse.ok) {
             throw new Error(`Failed to download image: ${imageResponse.statusText}`);
           }
           const arrayBuffer = await imageResponse.arrayBuffer();
           const buffer = Buffer.from(arrayBuffer);
           const contentType = imageResponse.headers.get('content-type') || mimeType;
           dataURL = bufferToDataURL(buffer, contentType);
         }
         
         // 上传到R2存储
         const uploadResult = await uploadImageToStorage(dataURL, {
           prefix: 'gpt-img',
           metadata: {
             model: 'gpt-image-1',
             prompt: p.prompt.substring(0, 100), // 截取前100字符作为元数据
           }
         });
         uploadedUrls.push(uploadResult.url);
       } catch (error) {
         console.error('Failed to upload image to storage:', error);
         // 如果上传失败，使用原始URL作为fallback
         uploadedUrls.push(url);
       }
     }
    
    return { urls: uploadedUrls, seed: undefined };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('PROVIDER_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
import FormData from 'form-data';
import fetch from 'node-fetch';

export type GPTImageParams = {
  prompt: string;
  images?: string[];  // dataURL 数组，支持多图上传
  mask?: string;      // dataURL (PNG)，可选遮罩
  model?: string;     // 模型名称，支持 gpt-image-1、flux-kontext-pro、flux-kontext-max
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
  response_format?: string; // "url"|"b64_json"
  imageFormat?: string; // "png"|"jpg", 默认 "png"
};

// 将 dataURL 转为 Buffer
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

// 获取文件扩展名
function getFileExtension(mimeType: string): string {
  const ext = mimeType.split('/')[1];
  return ext === 'jpeg' ? 'jpg' : ext;
}

// 并发控制变量
let activeGPTRequests = 0;
const MAX_CONCURRENT_GPT_REQUESTS = 5; // 支持全速模式的并发数

// 等待可用槽位
async function waitForGPTSlot(): Promise<void> {
  while (activeGPTRequests >= MAX_CONCURRENT_GPT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  activeGPTRequests++;
  console.log(`GPT request slot acquired (active: ${activeGPTRequests}/${MAX_CONCURRENT_GPT_REQUESTS})`);
}

// 释放槽位
function releaseGPTSlot(): void {
  activeGPTRequests = Math.max(0, activeGPTRequests - 1);
  console.log(`GPT request slot released (active: ${activeGPTRequests}/${MAX_CONCURRENT_GPT_REQUESTS})`);
}

export async function generateGPTImage(p: GPTImageParams, apiKey?: string) {
  // 等待可用的请求槽位
  await waitForGPTSlot();
  
  try {
  // 添加详细的参数日志
  console.log('=== GPT Image Generation Request ===');
  console.log('Prompt:', p.prompt);
  console.log('Images count:', p.images?.length || 0);
  console.log('Images array:', p.images);
  console.log('First image preview:', p.images?.[0]?.substring(0, 100));
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
  console.log('🔍 Image detection:', { hasImages, imagesLength: p.images?.length, imagesType: typeof p.images });
  const endpoint = hasImages ? '/v1/images/edits' : '/v1/images/generations';
  const url = `${base}${endpoint}`;
  console.log('📡 Using endpoint:', endpoint);

  let body: any;
  let headers: Record<string, string> = {
    'Authorization': `Bearer ${key}`,
  };

  if (hasImages) {
    // 图像编辑模式 - 使用 multipart/form-data
    const form = new FormData();
    
    // 添加图片（支持多图上传）
    const editImages = p.images || [];
    console.log('🖼️ Processing images:', { editImagesLength: editImages.length, firstImagePreview: editImages[0]?.substring(0, 50) });
    
    if (editImages.length === 0) {
      throw new Error('MISSING_IMAGES: At least one image is required for image editing');
    }
    
    // 根据API文档，支持多图上传
    for (let i = 0; i < editImages.length; i++) {
      try {
        console.log(`🔄 Processing image ${i + 1}:`, editImages[i].substring(0, 100));
        const { buffer, mimeType } = dataURLToBuffer(editImages[i]);
        const ext = getFileExtension(mimeType);
        console.log(`✅ Image ${i + 1} processed:`, { bufferLength: buffer.length, mimeType, ext });
        
        // 验证图片格式（PNG, WEBP, JPG）
        if (!['png', 'webp', 'jpg', 'jpeg'].includes(ext.toLowerCase())) {
          throw new Error(`UNSUPPORTED_FORMAT: Image ${i + 1} format ${ext} not supported. Use PNG, WEBP, or JPG.`);
        }
        
        // 验证图片大小（<25MB）
        if (buffer.length > 25 * 1024 * 1024) {
          throw new Error(`IMAGE_TOO_LARGE: Image ${i + 1} exceeds 25MB limit`);
        }
        
        form.append('image', buffer, `image_${i}.${ext}`);
      } catch (error) {
        console.error(`❌ Error processing image ${i + 1}:`, error);
        throw error;
      }
    }
    
    // 添加 mask (如果有)
    if (p.mask) {
      const { buffer } = dataURLToBuffer(p.mask);
      form.append('mask', buffer, 'mask.png');
    }
    
    // 添加其他参数
    form.append('prompt', p.prompt);
    
    // 验证prompt长度（最大32000字符）
    if (p.prompt.length > 32000) {
      throw new Error('PROMPT_TOO_LONG: Prompt exceeds 32000 character limit');
    }
    
    // 模型参数（支持多种模型）
    const model = p.model || 'gpt-image-1';
    form.append('model', model);
    
    // 尺寸参数
    if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
      form.append('size', p.size);
    }
    
    // 数量参数（1-10）
    const n = Math.min(Math.max(p.n || 1, 1), 10);
    form.append('n', n.toString());
    
    // 质量参数（gpt-image-1支持）
    if (p.quality && ['high', 'medium', 'low'].includes(p.quality)) {
      form.append('quality', p.quality);
    }
    
    // 注意：gpt-image-1模型不支持response_format参数，默认返回b64_json格式
    
    body = form;
    headers = {
      ...headers,
      ...form.getHeaders(),
    };
  } else {
    // 文生图模式 - 使用 JSON
    headers['Content-Type'] = 'application/json';
    
    // 验证prompt长度
    if (p.prompt.length > 32000) {
      throw new Error('PROMPT_TOO_LONG: Prompt exceeds 32000 character limit');
    }
    
    const jsonBody: Record<string, any> = {
      model: p.model || 'gpt-image-1',
      prompt: p.prompt,
    };
    
    // 尺寸参数
    if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
      jsonBody.size = p.size;
    }
    
    // 数量参数（1-10）
    const n = Math.min(Math.max(p.n || 1, 1), 10);
    jsonBody.n = n;
    
    // 质量参数
    if (p.quality && ['high', 'medium', 'low'].includes(p.quality)) {
      jsonBody.quality = p.quality;
    }
    
    // 注意：gpt-image-1模型不支持response_format参数，默认返回b64_json格式
    
    body = JSON.stringify(jsonBody);
  }

  // 发送请求 - 添加重试机制
  const maxRetries = 2;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 180_000); // 180s超时
    
    // 添加请求开始时间用于调试
    const requestStartTime = Date.now();
    console.log(`GPT Attempt ${attempt}/${maxRetries} - Starting request at:`, new Date(requestStartTime).toISOString());
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: ctl.signal,
      });
      
      const requestDuration = Date.now() - requestStartTime;
      console.log(`GPT Attempt ${attempt} - Request completed in ${requestDuration}ms`);
    
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error('=== GPT Image API Error ===');
        console.error('Status:', response.status);
        console.error('Status Text:', response.statusText);
        console.error('Error Response:', errorText);
        console.error('Request URL:', url);
        console.error('API Key used:', key ? `${key.substring(0, 10)}...` : 'None');
        console.error('Model:', p.model || 'gpt-image-1');
        console.error('Endpoint:', endpoint);
        console.error('============================');
        
        // 根据状态码提供更友好的错误信息
        let errorMessage = `PROVIDER_${response.status}`;
        switch (response.status) {
          case 400:
            errorMessage = 'BAD_REQUEST: Invalid parameters or image format';
            break;
          case 401:
            errorMessage = 'UNAUTHORIZED: Invalid API key';
            break;
          case 403:
            errorMessage = 'FORBIDDEN: Access denied or quota exceeded';
            break;
          case 413:
            errorMessage = 'PAYLOAD_TOO_LARGE: Image file too large (max 25MB)';
            break;
          case 429:
            errorMessage = 'RATE_LIMITED: Too many requests';
            break;
          case 500:
            errorMessage = 'SERVER_ERROR: Provider internal error';
            break;
          default:
            errorMessage = `PROVIDER_ERROR_${response.status}: ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }
    
    const result: any = await response.json();
    
    // 处理响应数据
    console.log('GPT API Response structure:', {
      hasData: !!result.data,
      dataLength: result.data?.length,
      hasUsage: !!result.usage,
      created: result.created
    });
    
    const data = result.data || [];
    if (!Array.isArray(data) || data.length === 0) {
      console.error('Empty or invalid response data:', result);
      throw new Error('PROVIDER_EMPTY_RESULTS: No images returned from API');
    }
    
    // 处理不同格式的响应数据
    const imageFormat = p.imageFormat || 'png';
    const mimeType = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const urls = data
      .map((item: any, index: number) => {
        console.log(`Processing result item ${index + 1}:`, {
          hasB64: !!item.b64_json,
          hasUrl: !!item.url,
          b64Preview: item.b64_json?.substring(0, 50)
        });
        
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
      console.error('No valid images found in response:', data);
      throw new Error('PROVIDER_NO_VALID_IMAGES: No valid image data found in response');
    }
    
    console.log(`✅ GPT Image generation successful: ${urls.length} images generated`);
    
    // 返回结果，包含使用情况信息
    return { 
      urls, 
      seed: undefined,
      usage: result.usage // 包含token使用情况
    };
      
    } catch (err: any) {
      const requestDuration = Date.now() - requestStartTime;
      console.log(`GPT Attempt ${attempt} failed after ${requestDuration}ms:`, err.message);
      
      lastError = err;
      
      // 清理超时
      clearTimeout(timeout);
      
      // 如果是超时错误且还有重试机会，继续重试
      if (err?.name === 'AbortError' && attempt < maxRetries) {
        console.log(`GPT timeout on attempt ${attempt}, retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      // 如果是网络错误且还有重试机会，继续重试
      if (err.message.includes('fetch') && attempt < maxRetries) {
        console.log(`GPT network error on attempt ${attempt}, retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      // 最后一次尝试失败，抛出错误
      if (attempt === maxRetries) {
        if (err?.name === 'AbortError') {
          throw new Error('GPT_TIMEOUT_AFTER_RETRIES');
        }
        
        // 添加更详细的错误信息
        if (err.message.includes('fetch')) {
          console.error('GPT Network error details:', {
            message: err.message,
            stack: err.stack,
            duration: requestDuration,
            attempts: maxRetries
          });
        }
        
        throw err;
      }
    }
  }
  
  // 如果所有重试都失败了
  throw lastError || new Error('GPT: All retry attempts failed');
  
  } finally {
    // 释放请求槽位
    releaseGPTSlot();
  }
}
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
  images?: string[];  // dataURL 数组，支持多图上传
  mask?: string;      // dataURL (PNG)，可选遮罩
  model?: string;     // 模型名称，支持 gpt-image-1、flux-kontext-pro、flux-kontext-max
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
  response_format?: string; // "url"|"b64_json"
  imageFormat?: string; // "png"|"jpg", 默认 "png"
};



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
    
    // 添加图片（支持多图上传，与nano-banana保持一致）
    const editImages = p.images || [];
    console.log('🖼️ Processing images:', { editImagesLength: editImages.length, firstImagePreview: editImages[0]?.substring(0, 50) });
    
    if (editImages.length === 0) {
      throw new Error('MISSING_IMAGES: At least one image is required for image editing');
    }
    
    // 批量处理所有图片
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
        
        const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
        form.append('image', blob, `image_${i}.${ext}`);
      } catch (error) {
        console.error(`❌ Error processing image ${i + 1}:`, error);
        throw error;
      }
    }
    
    // 添加 mask (如果有)
    if (p.mask) {
      const { buffer, mimeType } = dataURLToBuffer(p.mask);
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      form.append('mask', blob, 'mask.png');
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
    
    // 质量参数
    if (p.quality && ['high', 'medium', 'low'].includes(p.quality)) {
      form.append('quality', p.quality);
    }
    
    // 注意：gpt-image-1模型不支持response_format参数，默认返回b64_json格式
    
    body = form;
    // 在Vercel环境中，FormData会自动设置正确的Content-Type
    // 不需要手动设置headers
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

  // 等待并发槽位
  await waitForGPTSlot();
  
  // 发送请求 - 添加重试机制
  const maxRetries = 2;
  let lastError: any;
  
  try {
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
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          console.error('=== GPT Image API Error ===');
          console.error('Status:', response.status);
          console.error('Status Text:', response.statusText);
          console.error('Error Response:', errorText);
          console.error('Request URL:', url);
          console.error('API Key used:', key ? `${key.substring(0, 10)}...` : 'None');
          console.error('============================');
          
          // 对于某些错误码，不进行重试
          if ([400, 401, 403, 404].includes(response.status)) {
            throw new Error(`PROVIDER_${response.status}:${errorText}`);
          }
          
          lastError = new Error(`PROVIDER_${response.status}:${errorText}`);
          if (attempt === maxRetries) {
            throw lastError;
          }
          console.log(`Retrying attempt ${attempt + 1}/${maxRetries} after error:`, lastError.message);
          continue;
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
        
        console.log(`✅ GPT Image generation successful: ${uploadedUrls.length} images generated`);
        return { urls: uploadedUrls, seed: undefined };
        
      } catch (error) {
        clearTimeout(timeout);
        console.error(`GPT Attempt ${attempt} failed:`, error);
        
        // 如果是网络错误或超时，可以重试
        if (error.name === 'AbortError' || error.message.includes('fetch')) {
          lastError = error;
          if (attempt === maxRetries) {
            throw new Error(`GPT_REQUEST_FAILED_AFTER_RETRIES: ${lastError.message}`);
          }
          console.log(`Network error, retrying attempt ${attempt + 1}/${maxRetries}`);
          continue;
        }
        
        // 其他错误直接抛出
        throw error;
      }
    }
    
    // 如果所有重试都失败了
    throw lastError || new Error('GPT_REQUEST_FAILED: Unknown error');
    
  } finally {
    releaseGPTSlot();
  }
}
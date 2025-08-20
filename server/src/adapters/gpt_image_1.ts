import FormData from 'form-data';
import fetch from 'node-fetch';

export type GPTImageParams = {
  prompt: string;
  images?: string[];  // dataURL 数组
  mask?: string;      // dataURL (PNG)
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
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
      form.append('image', buffer, `image_${i}.${ext}`);
    }
    
    // 添加 mask (如果有)
    if (p.mask) {
      const { buffer } = dataURLToBuffer(p.mask);
      form.append('mask', buffer, 'mask.png');
    }
    
    // 添加其他参数
    form.append('prompt', p.prompt);
    form.append('model', 'gpt-image-1');
    // 移除 response_format 参数，因为提供商不支持
    
    if (p.size && p.size !== 'adaptive') {
      form.append('size', p.size === 'auto' ? 'auto' : p.size);
    }
    // 总是传递 n 参数，默认为 1
    form.append('n', (p.n || 1).toString());
    // 注意：quality 在图像编辑模式（edits）下不被支持，不传递以避免提供商错误
    
    body = form;
    headers = {
      ...headers,
      ...form.getHeaders(),
    };
  } else {
    // 文生图模式 - 使用 JSON
    headers['Content-Type'] = 'application/json';
    
    const jsonBody: Record<string, any> = {
      model: 'gpt-image-1',
      prompt: p.prompt,
      // 移除 response_format 参数，因为提供商不支持
    };
    
    if (p.size && p.size !== 'adaptive') {
      jsonBody.size = p.size === 'auto' ? 'auto' : p.size;
    }
    // 总是传递 n 参数，默认为 1
    jsonBody.n = p.n || 1;
    if (p.quality) {
      jsonBody.quality = p.quality;
    }
    
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
    
    return { urls, seed: undefined };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('PROVIDER_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
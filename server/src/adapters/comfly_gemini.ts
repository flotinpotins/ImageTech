/**
 * Gemini 2.5 Flash Image Preview 适配器
 * 使用 OpenAI Dall-e 格式调用 Gemini 2.5 Flash Image Preview 模型
 * 根据官方文档，使用 /v1/images/generations 接口
 */

// import FormData from 'form-data'; // 暂时不使用，因为fetch API与form-data库兼容性问题

// 并发控制 - 限制同时进行的请求数量
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3;

const waitForSlot = async (): Promise<void> => {
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    console.log(`Waiting for request slot... (active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  activeRequests++;
  console.log(`Request slot acquired (active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS})`);
};

const releaseSlot = (): void => {
  activeRequests = Math.max(0, activeRequests - 1);
  console.log(`Request slot released (active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS})`);
};

export type GeminiImageParams = {
  prompt: string;
  images?: string[];  // dataURL 数组
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
};

export type GeminiImageEditParams = {
  prompt: string;
  image: string;      // dataURL 格式的图片或图片URL
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
  response_format?: string; // "url" 或 "b64_json"
};

export async function generateGeminiImage(p: GeminiImageParams | any, apiKey?: string) {
  console.log('=== Gemini Image Generation Request (Dall-e Format) ===');
  console.log('Prompt:', p.prompt);
  console.log('Images count:', p.images?.length || 0);
  console.log('Size:', p.size);
  console.log('N:', p.n);
  console.log('Quality:', p.quality);
  console.log('API Key provided:', !!apiKey);
  console.log('======================================');

  // 使用新的base URL
  const base = 'https://ai.comfly.chat';
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!key) throw new Error("MISSING_API_KEY");

  // 使用 OpenAI Dall-e 格式的接口
  const url = `${base}/v1/images/generations`;

  // 构建 OpenAI Dall-e 格式的请求体
  const validSizes = ['1024x1024', '1536x1024', '1024x1536', 'adaptive'];
  const finalSize = p.size && validSizes.includes(p.size) ? p.size : '1024x1024';
  
  const payload = {
    model: "nano-banana", // 根据文档，实际模型名称是 nano-banana
    prompt: p.prompt,
    response_format: "url", // 或 "b64_json"
    size: finalSize,
    n: p.n || 1,
    quality: p.quality || "standard"
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`
  };

  console.log('Final payload for Gemini API:', JSON.stringify(payload, null, 2));
  console.log('Request URL:', url);

  // 发送请求
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 300_000); // 300s 超时

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error('=== Gemini API Error ===');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      console.error('Error Response:', errorText);
      console.error('Request URL:', url);
      console.error('============================');
      throw new Error(`GEMINI_${response.status}:${errorText}`);
    }

    // 解析响应
    const result = await response.json();
    console.log('Gemini API Response:', JSON.stringify(result, null, 2));

    // 检查响应格式
    if (!result.data || !Array.isArray(result.data)) {
      console.error('Unexpected response format:', result);
      throw new Error('GEMINI_INVALID_RESPONSE_FORMAT');
    }

    // 提取图像URLs
    const imageUrls: string[] = [];
    for (const item of result.data) {
      if (item.url) {
        imageUrls.push(item.url);
      } else if (item.b64_json) {
        // 如果返回的是base64格式，转换为dataURL
        const dataUrl = `data:image/png;base64,${item.b64_json}`;
        imageUrls.push(dataUrl);
      }
    }

    console.log('Extracted image URLs:', imageUrls);

    if (imageUrls.length === 0) {
      throw new Error('GEMINI_NO_IMAGES_IN_RESPONSE');
    }

    return imageUrls;
    
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('GEMINI_TIMEOUT');
    }
    console.error('Gemini API Error:', err);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Gemini 图生图功能
 * 使用 /v1/images/edits 接口
 */
export async function editGeminiImage(p: GeminiImageEditParams, apiKey?: string) {
  console.log('=== Gemini Image Edit Request ===');
  console.log('Prompt:', p.prompt);
  console.log('Image provided:', !!p.image);
  console.log('Image length:', p.image ? p.image.length : 0);
  console.log('Size:', p.size);
  console.log('N:', p.n);
  console.log('Quality:', p.quality);
  console.log('Response format:', p.response_format || 'url');
  console.log('API Key provided:', !!apiKey);
  console.log('======================================');

  // 使用新的base URL
  const base = 'https://ai.comfly.chat';
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!key) throw new Error("MISSING_API_KEY");

  // 使用图生图接口
  const url = `${base}/v1/images/edits`;

  // 将 dataURL、纯 base64 或 Buffer 转换为 Buffer（Node 环境更稳定）
  const dataToBuffer = async (input: string | Buffer): Promise<{ buffer: Buffer, mimeType: string }> => {
    // 如果是 Buffer，直接返回
    if (Buffer.isBuffer(input)) {
      console.log('Input is already Buffer, size:', input.length);
      return { buffer: input, mimeType: 'image/png' };
    }
    
    // 如果是网络图片URL，先下载图片
    if (input.startsWith('http')) {
      try {
        console.log('Downloading image from URL:', input);
        const imageResponse = await fetch(input);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = imageResponse.headers.get('content-type') || 'image/png';
        console.log('Downloaded image buffer, size:', buffer.length, 'type:', contentType);
        return { buffer, mimeType: contentType };
      } catch (error) {
        console.error('Error downloading image:', error);
        throw new Error(`DOWNLOAD_IMAGE_FAILED: ${error.message}`);
      }
    }

    // 处理 dataURL 或纯 base64
    let mimeType = 'image/png'; // 默认 MIME 类型
    let base64 = input;

    if (input.startsWith('data:')) {
      const match = input.match(/^data:(.*?);base64,(.*)$/);
      if (!match) {
        throw new Error('INVALID_DATA_URL');
      }
      mimeType = match[1] || 'image/png';
      base64 = match[2];
    }

    try {
      // 验证base64数据
      if (!base64 || base64.length === 0) {
        throw new Error('Empty base64 data');
      }
      
      console.log('Converting base64 to buffer, base64 length:', base64.length);
      const buffer = Buffer.from(base64, 'base64');
      console.log('Buffer created, size:', buffer.length, 'mimeType:', mimeType);
      
      if (buffer.length === 0) {
        throw new Error('Buffer conversion resulted in empty buffer');
      }
      
      return { buffer, mimeType };
    } catch (error) {
      console.error('Error converting data to Buffer:', error);
      console.error('Input type:', typeof input);
      console.error('Input length:', input.length);
      console.error('Base64 length:', base64.length);
      console.error('MIME type:', mimeType);
      throw new Error(`CONVERT_TO_BUFFER_FAILED: ${error.message}`);
    }
  };

  try {
    // 等待并发控制槽位
    await waitForSlot();
    
    // 添加图片文件
    console.log('Processing image for FormData...');
    console.log('Original image data type:', typeof p.image);
    console.log('Original image data length:', p.image ? p.image.length : 0);
    console.log('Image data preview:', p.image ? p.image.substring(0, 100) + '...' : 'null');
    
    const { buffer: imageBuffer, mimeType } = await dataToBuffer(p.image);
    console.log('Image Buffer created, size:', imageBuffer.length, 'mimeType:', mimeType);
    
    // 验证Buffer内容
    if (imageBuffer.length === 0) {
      throw new Error('Generated image buffer is empty');
    }
    
    // 使用原生 FormData 但确保 Blob 正确创建
    const formData = new FormData();
    formData.append('model', 'nano-banana');
    formData.append('prompt', p.prompt);
    formData.append('response_format', p.response_format || 'url');
    
    // 添加尺寸参数 - 支持 'adaptive' 及有效尺寸值
    const validSizes = ['1024x1024', '1536x1024', '1024x1536', 'adaptive'];
    const finalSize = p.size && validSizes.includes(p.size) ? p.size : '1024x1024';
    formData.append('size', finalSize);
    
    // 添加其他参数
    formData.append('n', (p.n || 1).toString());
    if (p.quality) {
      formData.append('quality', p.quality);
    }
    
    // 确保创建正确的 Blob 对象
    const imageBlob = new Blob([imageBuffer], { type: mimeType });
    console.log('Created Blob:', {
      type: imageBlob.type,
      size: imageBlob.size,
      bufferSize: imageBuffer.length,
      mimeType: mimeType
    });
    
    // 验证 Blob 是否正确创建
    if (imageBlob.size === 0) {
      throw new Error('Failed to create valid Blob from buffer');
    }
    
    formData.append('image', imageBlob, 'upload.png');
    
    console.log('FormData created with native FormData');
    console.log('Image blob size:', imageBlob.size);
    console.log('Image content type:', imageBlob.type);

    const headers = {
      'Authorization': `Bearer ${key}`
      // 不设置 Content-Type，让浏览器自动设置 multipart/form-data 边界
    };

    console.log('Request URL:', url);
    console.log('Request headers:', headers);

    // 发送请求 - 增强重试机制
    const maxRetries = 3; // 增加重试次数
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const ctl = new AbortController();
      // 根据重试次数递增超时时间
      const timeoutMs = 180_000 + (attempt - 1) * 60_000; // 180s, 240s, 300s
      const timeout = setTimeout(() => ctl.abort(), timeoutMs);
      
      // 添加请求开始时间用于调试
      const requestStartTime = Date.now();
      console.log(`Attempt ${attempt}/${maxRetries} - Starting request with ${timeoutMs/1000}s timeout at:`, new Date(requestStartTime).toISOString());

    try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData, // 原生 FormData
          signal: ctl.signal,
        });
        
        const requestDuration = Date.now() - requestStartTime;
        console.log(`Attempt ${attempt} - Request completed in ${requestDuration}ms`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error('=== Gemini Image Edit API Error ===');
        console.error('Status:', response.status);
        console.error('Status Text:', response.statusText);
        console.error('Error Response:', errorText);
        console.error('Request URL:', url);
        console.error('============================');
        throw new Error(`GEMINI_EDIT_${response.status}:${errorText}`);
      }

      // 解析响应
      const result = await response.json();
      console.log('Gemini Image Edit API Response:', JSON.stringify(result, null, 2));

      // 检查响应格式
      if (!result.data || !Array.isArray(result.data)) {
        console.error('Unexpected response format:', result);
        throw new Error('GEMINI_EDIT_INVALID_RESPONSE_FORMAT');
      }

      // 提取图像URLs
      const imageUrls: string[] = [];
      for (const item of result.data) {
        if (item.url) {
          imageUrls.push(item.url);
        } else if (item.b64_json) {
          // 如果返回的是base64格式，转换为dataURL
          const dataUrl = `data:image/png;base64,${item.b64_json}`;
          imageUrls.push(dataUrl);
        }
      }

      console.log('Generated image URLs:', imageUrls);

      if (imageUrls.length === 0) {
        throw new Error('GEMINI_EDIT_NO_IMAGES_IN_RESPONSE');
      }

      return imageUrls;

      } catch (err: any) {
        const requestDuration = Date.now() - requestStartTime;
        console.log(`Attempt ${attempt} failed after ${requestDuration}ms:`, err.message);
        
        lastError = err;
        
        // 清理超时
        clearTimeout(timeout);
        
        // 如果是超时错误且还有重试机会，继续重试
        if (err?.name === 'AbortError' && attempt < maxRetries) {
          const waitTime = 3000 + (attempt - 1) * 2000; // 3s, 5s, 7s
          console.log(`Timeout on attempt ${attempt}, retrying in ${waitTime/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // 如果是网络错误且还有重试机会，继续重试
        if (err.message.includes('fetch') && attempt < maxRetries) {
          const waitTime = 4000 + (attempt - 1) * 2000; // 4s, 6s, 8s
          console.log(`Network error on attempt ${attempt}, retrying in ${waitTime/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // 如果是408超时错误且还有重试机会，继续重试
        if (err.message.includes('408') && attempt < maxRetries) {
          const waitTime = 5000 + (attempt - 1) * 3000; // 5s, 8s, 11s
          console.log(`API timeout (408) on attempt ${attempt}, retrying in ${waitTime/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // 最后一次尝试失败，抛出错误
        if (attempt === maxRetries) {
          if (err?.name === 'AbortError') {
            throw new Error(`GEMINI_EDIT_TIMEOUT_AFTER_${maxRetries}_RETRIES`);
          }
          
          // 添加更详细的错误信息
          if (err.message.includes('fetch')) {
            console.error('Network error details:', {
              message: err.message,
              stack: err.stack,
              duration: requestDuration,
              attempts: maxRetries
            });
          }
          
          if (err.message.includes('408')) {
            console.error('API timeout error details:', {
              message: err.message,
              duration: requestDuration,
              attempts: maxRetries,
              finalTimeout: timeoutMs
            });
            throw new Error(`GEMINI_EDIT_408_AFTER_${maxRetries}_RETRIES:${err.message}`);
          }
          
          throw err;
        }
      }
    }
    
    // 如果所有重试都失败了
    throw lastError || new Error('All retry attempts failed');

  } catch (error) {
    console.error('Error in editGeminiImage:', error);
    throw error;
  } finally {
    // 确保释放并发控制槽位
    releaseSlot();
  }
}
/**
 * Gemini 2.5 Flash Image Preview 适配器
 * 使用 OpenAI Dall-e 格式调用 Gemini 2.5 Flash Image Preview 模型
 * 根据官方文档，使用 /v1/images/generations 接口
 */

// import FormData from 'form-data'; // 暂时不使用，因为fetch API与form-data库兼容性问题

// 并发控制 - 限制同时进行的请求数量（优化版）
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5; // 支持全速模式的并发数
const MAX_WAIT_TIME = 300000; // 最大等待时间5分钟

const waitForSlot = async (): Promise<void> => {
  const startTime = Date.now();
  
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    // 检查是否超过最大等待时间
    if (Date.now() - startTime > MAX_WAIT_TIME) {
      console.error(`Slot wait timeout after ${MAX_WAIT_TIME}ms, forcing slot acquisition`);
      // 强制重置并发计数器，避免死锁
      activeRequests = Math.max(0, MAX_CONCURRENT_REQUESTS - 1);
      break;
    }
    
    console.log(`Waiting for request slot... (active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS}, waited: ${Date.now() - startTime}ms)`);
    // 减少等待间隔，提高响应性
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  activeRequests++;
  console.log(`Request slot acquired (active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS}, wait time: ${Date.now() - startTime}ms)`);
};

const releaseSlot = (): void => {
  const previousCount = activeRequests;
  activeRequests = Math.max(0, activeRequests - 1);
  console.log(`Request slot released (${previousCount} -> ${activeRequests}/${MAX_CONCURRENT_REQUESTS})`);
  
  // 安全检查：如果计数器异常，重置为0
  if (activeRequests < 0) {
    console.warn('Active requests count went negative, resetting to 0');
    activeRequests = 0;
  }
};

// 定期检查并发计数器健康状态
setInterval(() => {
  if (activeRequests > MAX_CONCURRENT_REQUESTS) {
    console.warn(`Active requests count exceeded limit (${activeRequests}/${MAX_CONCURRENT_REQUESTS}), resetting`);
    activeRequests = MAX_CONCURRENT_REQUESTS;
  }
}, 60000); // 每分钟检查一次

export type GeminiImageParams = {
  prompt: string;
  images?: string[];  // dataURL 数组
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
};

export type GeminiImageEditParams = {
  prompt: string;
  image?: string | string[];      // dataURL 格式的图片或图片URL，支持多图参考或不带参考图
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
  response_format?: string; // "url" 或 "b64_json"
};

export async function generateGeminiImage(p: GeminiImageParams | any, apiKey?: string) {
  const functionStartTime = Date.now();
  console.log('=== Gemini Image Generation Request (Dall-e Format) ===');
  console.log('Prompt:', p.prompt);
  console.log('Images count:', p.images?.length || 0);
  console.log('Size:', p.size);
  console.log('N:', p.n);
  console.log('Quality:', p.quality);
  console.log('API Key provided:', !!apiKey);
  console.log('======================================');

  // 等待并发槽位
  const slotWaitStartTime = Date.now();
  await waitForSlot();
  const slotWaitDuration = Date.now() - slotWaitStartTime;
  console.log(`⏱️ Slot wait completed in ${slotWaitDuration}ms`);
  let slotReleased = false;
  
  // 确保槽位一定会被释放的安全函数
  const safeReleaseSlot = () => {
    if (!slotReleased) {
      releaseSlot();
      slotReleased = true;
    }
  };

  // 使用新的base URL
  const base = 'https://ai.comfly.chat';
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!key) {
    safeReleaseSlot();
    throw new Error("MISSING_API_KEY");
  }

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

    const totalDuration = Date.now() - functionStartTime;
    console.log(`🎉 Image generation completed successfully in ${totalDuration}ms`);
    return imageUrls;
    
  } catch (err: any) {
    const totalDuration = Date.now() - functionStartTime;
    if (err?.name === 'AbortError') {
      console.error(`❌ Generation timeout after ${totalDuration}ms`);
      throw new Error('GEMINI_TIMEOUT');
    }
    console.error(`❌ Error in generateGeminiImage after ${totalDuration}ms:`, err);
    throw err;
  } finally {
    clearTimeout(timeout);
    // 确保释放并发控制槽位
    safeReleaseSlot();
    const totalDuration = Date.now() - functionStartTime;
    console.log(`🏁 generateGeminiImage function completed in ${totalDuration}ms`);
  }
}

/**
 * Gemini 图生图功能
 * 使用 /v1/images/edits 接口
 */
export async function editGeminiImage(p: GeminiImageEditParams, apiKey?: string) {
  const functionStartTime = Date.now();
  console.log('🚀 === Gemini Image Edit Request ===');
  console.log('📋 Input params:', {
    prompt: p.prompt,
    imageProvided: !!p.image,
    imageLength: p.image ? p.image.length : 0,
    size: p.size,
    n: p.n,
    quality: p.quality,
    responseFormat: p.response_format || 'url',
    apiKeyProvided: !!apiKey,
    timestamp: new Date().toISOString()
  });
  console.log('======================================');

  // 等待并发槽位
  const slotWaitStartTime = Date.now();
  await waitForSlot();
  const slotWaitDuration = Date.now() - slotWaitStartTime;
  console.log(`⏱️ Slot wait completed in ${slotWaitDuration}ms`);
  let slotReleased = false;
  
  // 确保槽位一定会被释放的安全函数
  const safeReleaseSlot = () => {
    if (!slotReleased) {
      releaseSlot();
      slotReleased = true;
    }
  };

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
      safeReleaseSlot();
      throw new Error(`DOWNLOAD_IMAGE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
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
      safeReleaseSlot();
      throw new Error(`CONVERT_TO_BUFFER_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  try {
    
    // 使用原生 FormData 构建请求
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
    
    // 处理图片参数 - 根据API文档，image字段是required的，但支持多图或不带参考图
    const imageProcessStartTime = Date.now();
    if (p.image && p.image.length > 0) {
      console.log('🖼️ Processing images for FormData...');
      
      // 将图片参数标准化为数组
      const images = Array.isArray(p.image) ? p.image : [p.image];
      console.log(`Processing ${images.length} image(s)`);
      
      // 处理每张图片
      for (let i = 0; i < images.length; i++) {
        const imageData = images[i];
        console.log(`Processing image ${i + 1}/${images.length}:`);
        console.log('- Image data type:', typeof imageData);
        console.log('- Image data length:', imageData ? imageData.length : 0);
        console.log('- Image data preview:', imageData ? imageData.substring(0, 100) + '...' : 'null');
        
        const { buffer: imageBuffer, mimeType } = await dataToBuffer(imageData);
        console.log(`- Buffer created, size: ${imageBuffer.length}, mimeType: ${mimeType}`);
        
        // 验证Buffer内容
        if (imageBuffer.length === 0) {
          throw new Error(`Generated image buffer ${i + 1} is empty`);
        }
        
        // 创建 Blob 对象
        const imageBlob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
        console.log(`- Created Blob ${i + 1}:`, {
          type: imageBlob.type,
          size: imageBlob.size,
          bufferSize: imageBuffer.length,
          mimeType: mimeType
        });
        
        // 验证 Blob 是否正确创建
        if (imageBlob.size === 0) {
          throw new Error(`Failed to create valid Blob ${i + 1} from buffer`);
        }
        
        // 验证图像数据的前几个字节（PNG/JPEG魔数）
        const firstBytes = Array.from(imageBuffer.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`- Image ${i + 1} buffer first 8 bytes (hex):`, firstBytes);
        
        // PNG文件应该以 89 50 4E 47 开头，JPEG文件应该以 FF D8 开头
        const isPNG = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47;
        const isJPEG = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
        console.log(`- Image ${i + 1} format validation:`, { isPNG, isJPEG, detectedFormat: isPNG ? 'PNG' : isJPEG ? 'JPEG' : 'Unknown' });
        
        if (!isPNG && !isJPEG) {
          console.warn(`⚠️ Warning: Image ${i + 1} data does not appear to be valid PNG or JPEG format`);
        }
        
        // 根据API文档，多图时使用多个image字段
        formData.append('image', imageBlob, `upload_${i + 1}.png`);
      }
      
      const imageProcessDuration = Date.now() - imageProcessStartTime;
      console.log(`⏱️ All images processing completed in ${imageProcessDuration}ms`);
    } else {
      console.log('🖼️ No images provided - text-to-image mode');
      // 根据API文档，即使是文生图模式，image字段也是required的
      // 创建一个1x1像素的透明PNG作为占位符
      const placeholderPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const { buffer: placeholderBuffer, mimeType } = await dataToBuffer(placeholderPng);
      const placeholderBlob = new Blob([new Uint8Array(placeholderBuffer)], { type: mimeType });
      formData.append('image', placeholderBlob, 'placeholder.png');
      console.log('🖼️ Added placeholder image for text-to-image mode');
    }
    
    const formDataCreateDuration = Date.now() - imageProcessStartTime;
    console.log('📦 FormData created with native FormData');
    console.log(`⏱️ FormData creation completed in ${formDataCreateDuration}ms`);

    const headers = {
      'Authorization': `Bearer ${key}`
      // 不设置 Content-Type，让浏览器自动设置 multipart/form-data 边界
    };

    console.log('Request URL:', url);
    console.log('Request headers:', headers);
    
    // 调试FormData内容
    console.log('📋 FormData debug info:');
    console.log('- model:', formData.get('model'));
    console.log('- prompt:', formData.get('prompt'));
    console.log('- response_format:', formData.get('response_format'));
    console.log('- size:', formData.get('size'));
    console.log('- n:', formData.get('n'));
    console.log('- quality:', formData.get('quality'));
    const imageFile = formData.get('image');
    console.log('- image file:', {
      type: imageFile instanceof Blob ? imageFile.type : typeof imageFile,
      size: imageFile instanceof Blob ? imageFile.size : 'N/A',
      constructor: imageFile?.constructor?.name
    });

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

      const totalDuration = Date.now() - functionStartTime;
      console.log(`🎉 Image edit completed successfully in ${totalDuration}ms`);
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
    const totalDuration = Date.now() - functionStartTime;
    console.error(`❌ Error in editGeminiImage after ${totalDuration}ms:`, error);
    throw error;
  } finally {
    // 确保释放并发控制槽位
    safeReleaseSlot();
    const totalDuration = Date.now() - functionStartTime;
    console.log(`🏁 editGeminiImage function completed in ${totalDuration}ms`);
  }
}
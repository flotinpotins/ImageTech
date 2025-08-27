/**
 * Gemini 2.5 Flash Image Preview 适配器
 * 使用 OpenAI Dall-e 格式调用 Gemini 2.5 Flash Image Preview 模型
 * 根据官方文档，使用 /v1/images/generations 接口
 */

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

// 将 dataURL 转换为 Blob
async function dataToBlob(dataURL: string): Promise<Blob> {
  if (dataURL.startsWith('http')) {
    // 如果是URL，先下载
    const response = await fetch(dataURL);
    return response.blob();
  }
  
  // 如果是dataURL，手动解析转换为Blob
  const matches = dataURL.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
  if (!matches) {
    throw new Error('Invalid dataURL format');
  }
  
  const mimeType = matches[1];
  const base64Data = matches[2];
  
  try {
    // 在Node.js环境中，使用Buffer来解码base64
    const buffer = Buffer.from(base64Data, 'base64');
    return new Blob([buffer], { type: mimeType });
  } catch (error) {
    console.error('Error converting dataURL to Blob:', error);
    throw new Error(`CONVERT_TO_BLOB_FAILED: ${error.message}`);
  }
}

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
  const payload = {
    model: "nano-banana", // 根据文档，实际模型名称是 nano-banana
    prompt: p.prompt,
    response_format: "url", // 或 "b64_json"
    size: p.size || "1024x1024",
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

    console.log('Generated image URLs:', imageUrls);

    if (imageUrls.length === 0) {
      throw new Error('GEMINI_NO_IMAGES_IN_RESPONSE');
    }

    return { urls: imageUrls, seed: undefined };

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('GEMINI_TIMEOUT');
    }
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
  console.log('Response format:', p.response_format || 'url');
  console.log('API Key provided:', !!apiKey);
  console.log('======================================');

  // 使用新的base URL
  const base = 'https://ai.comfly.chat';
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!key) throw new Error("MISSING_API_KEY");

  // 使用图生图接口
  const url = `${base}/v1/images/edits`;

  // 构建 FormData
  const formData = new FormData();
  formData.append('model', 'nano-banana');
  formData.append('prompt', p.prompt);
  formData.append('response_format', p.response_format || 'url');
  
  // 添加尺寸参数
  if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
    formData.append('size', p.size);
  }
  
  // 添加其他参数
  if (p.n) {
    formData.append('n', p.n.toString());
  }
  if (p.quality) {
    formData.append('quality', p.quality);
  }
  
  try {
    // 添加图片文件
    console.log('Converting image to blob, original length:', p.image.length);
    const imageBlob = await dataToBlob(p.image);
    console.log('Blob created successfully, size:', imageBlob.size, 'type:', imageBlob.type);
    formData.append('image', imageBlob, 'image.png');
    console.log('Image blob appended to FormData');

    const headers = {
      'Authorization': `Bearer ${key}`
      // 注意：不要设置 Content-Type，让运行时自动设置 multipart/form-data 边界
    };

    console.log('Request URL:', url);
    console.log('FormData keys:', Array.from((formData as any).keys?.() || []));

    // 发送请求
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 300_000); // 300s 超时

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: ctl.signal,
      });

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

      return { urls: imageUrls, seed: undefined };

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('GEMINI_EDIT_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error('Error in editGeminiImage:', error);
    throw error;
  }
}
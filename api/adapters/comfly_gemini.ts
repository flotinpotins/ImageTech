// 使用新的OpenAI聊天完成格式调用Gemini 2.5 Flash Image
// 支持文生图和图像修改功能

export type GeminiImageParams = {
  prompt: string;
  images?: string[];  // dataURL 数组
  size?: string;      // "1024x1024"|"1536x1024"|"1024x1536"|"auto"
  n?: number;         // 1-10, 默认 1
  quality?: string;   // "high"|"medium"|"low"
};

// 将 dataURL 转为 base64 字符串
function dataURLToBase64(dataURL: string): string {
  const matches = dataURL.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
  if (!matches) {
    throw new Error('Invalid dataURL format');
  }
  return matches[2];
}

// 获取图片的 MIME 类型
function getMimeType(dataURL: string): string {
  const matches = dataURL.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
  if (!matches) {
    return 'image/png'; // 默认类型
  }
  return matches[1];
}

export async function generateGeminiImage(p: GeminiImageParams, apiKey?: string) {
  console.log('=== Gemini Image Generation Request ===');
  console.log('Prompt:', p.prompt);
  console.log('Images count:', p.images?.length || 0);
  console.log('Size:', p.size);
  console.log('N:', p.n);
  console.log('Quality:', p.quality);
  console.log('API Key provided:', !!apiKey);
  console.log('======================================');

  const base = process.env.PROVIDER_BASE_URL!;
  const key = apiKey || process.env.PROVIDER_API_KEY!;
  if (!base || !key) throw new Error("MISSING_PROVIDER_CONFIG");

  const url = `${base}/v1/chat/completions`;

  // 构建消息内容
  const content: any[] = [];

  // 构建优化的文本提示
  let optimizedPrompt = p.prompt;
  
  // 如果是图像编辑（有输入图片）
  if (p.images && p.images.length > 0) {
    optimizedPrompt = `请根据提供的图片进行修改，要求：${p.prompt}。请直接返回修改后的图片URL或base64数据，不要包含其他文字说明。`;
  } else {
    // 文本生成图片
    optimizedPrompt = `请根据以下描述生成图片：${p.prompt}。请直接返回生成的图片URL或base64数据，不要包含其他文字说明。`;
  }
  
  // 添加文本提示
  content.push({
    type: "text",
    text: optimizedPrompt
  });

  // 如果有图片，添加到消息内容中
  if (p.images && p.images.length > 0) {
    for (const imageDataURL of p.images) {
      const base64Data = dataURLToBase64(imageDataURL);
      const mimeType = getMimeType(imageDataURL);
      
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`
        }
      });
    }
  }

  const payload = {
    model: "gemini-2.5-flash-image-preview", // 使用指定的Gemini 2.5 Flash Image模型
    messages: [
      {
        role: "user",
        content: content
      }
    ],
    stream: true, // 根据文档要求，必须使用流式返回
    max_tokens: 4000, // 增加token限制以适应图片生成
    temperature: 0.7,
    top_p: 0.9
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`
  };

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

    // 处理流式响应
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('GEMINI_NO_RESPONSE_BODY');
    }

    let fullResponse = '';
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        console.log('Received chunk:', chunk); // 调试日志
        
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              console.log('Stream completed');
              break;
            }

            try {
              const parsed = JSON.parse(data);
              console.log('Parsed chunk:', parsed);
              
              // 检查是否有错误
              if (parsed.error) {
                throw new Error(`GEMINI_ERROR: ${parsed.error.message || JSON.stringify(parsed.error)}`);
              }
              
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                console.log('Accumulated response:', fullResponse);
              }
            } catch (e) {
              console.warn('Failed to parse chunk:', line, e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log('Full response received:', fullResponse);
    
    // 从响应中提取图片信息
    const imageUrls = extractImageUrls(fullResponse);
    
    if (imageUrls.length === 0) {
      console.warn('No images found in response:', fullResponse);
      // 如果响应看起来是有效的但没有找到图片，返回整个响应作为后备
      if (fullResponse.trim()) {
        return { urls: [fullResponse.trim()], seed: undefined };
      }
      throw new Error('GEMINI_NO_VALID_IMAGES');
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

// 从响应文本中提取图片URL或base64数据
function extractImageUrls(responseText: string): string[] {
  const urls: string[] = [];
  
  // 1. 查找 markdown 格式的图片链接 ![alt](url)
  const markdownRegex = /!\[.*?\]\((.*?)\)/g;
  let match;
  while ((match = markdownRegex.exec(responseText)) !== null) {
    urls.push(match[1]);
  }

  // 2. 查找 HTML img 标签 <img src="url">
  const htmlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((match = htmlRegex.exec(responseText)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }

  // 3. 查找直接的图片URL
  const urlRegex = /https?:\/\/[^\s"'>]+(?:\.(?:png|jpg|jpeg|gif|webp|svg)|\?[^\s"'>]*)/gi;
  while ((match = urlRegex.exec(responseText)) !== null) {
    if (!urls.includes(match[0])) {
      urls.push(match[0]);
    }
  }

  // 4. 查找 base64 图片数据
  const base64Regex = /data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/]+={0,2}/g;
  while ((match = base64Regex.exec(responseText)) !== null) {
    urls.push(match[0]);
  }

  // 5. 查找可能包含在引号中的URL
  const quotedUrlRegex = /["'](https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|gif|webp|svg))["']/gi;
  while ((match = quotedUrlRegex.exec(responseText)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }

  return urls.filter(url => url && url.length > 10);
}
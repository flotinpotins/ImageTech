import { uploadImageToStorage } from '../storage';

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
    response_format: "b64_json", // 改为b64_json以便处理格式
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
    
    // 处理响应数据
    const data = j?.data || [];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('PROVIDER_EMPTY_RESULTS');
    }
    
    // 将 b64_json 转换为 data URLs，根据选择的格式设置MIME类型
    const imageFormat = p.imageFormat || 'png';
    const mimeType = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const urls = data
      .map((item: any) => item.b64_json)
      .filter(Boolean)
      .map((b64: string) => `data:${mimeType};base64,${b64}`);
    
    if (urls.length === 0) {
      throw new Error('PROVIDER_NO_VALID_IMAGES');
    }
    
    // 将图片上传到R2存储
    const uploadedUrls = [];
    for (const dataURL of urls) {
      try {
        // 上传到R2存储
        const uploadResult = await uploadImageToStorage(dataURL, {
          prefix: 'jimeng-img',
          metadata: {
            model: 'doubao-seedream-3-0-t2i-250415',
            prompt: p.prompt.substring(0, 100), // 截取前100字符作为元数据
            seed: p.seed?.toString() || 'random',
          }
        });
        uploadedUrls.push(uploadResult.url);
      } catch (error) {
        console.error('Failed to upload image to storage:', error);
        // 如果上传失败，使用原始dataURL作为fallback
        uploadedUrls.push(dataURL);
      }
    }
    
    return { urls: uploadedUrls, seed: p.seed };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("PROVIDER_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(to);
  }
}
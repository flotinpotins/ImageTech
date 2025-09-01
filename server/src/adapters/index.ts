import { generateJimengT2I } from "./jimeng_t2i.js";
import { generateGPTImage } from "./gpt_image_1.js";
import { generateGeminiImage, editGeminiImage } from "./comfly_gemini.js";

export async function dispatchGenerate(model: string, payload: any, apiKey?: string): Promise<{urls: string[], seed?: number}> {
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
    return generateGPTImage({
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
    const urls = await generateGeminiImage({
      prompt: payload.prompt,
      images: payload?.images ?? payload?.params?.images,
      size: payload?.size ?? payload?.params?.size,
      n: payload?.n ?? payload?.params?.n,
      quality: payload?.quality ?? payload?.params?.quality,
    }, apiKey);
    return { urls, seed: undefined };
  }
  
  if (model === "nano-banana") {
    // nano-banana 模型支持文生图和图生图两种模式
    const mode = payload?.mode ?? 'text-to-image';
    const image = payload?.image;
    const images = payload?.images;
    
    console.log('=== NANO-BANANA DEBUG ===');
    console.log('Mode:', mode);
    console.log('Image provided:', !!image);
    console.log('Images provided:', !!images);
    console.log('Image length:', image ? image.length : 0);
    console.log('Images count:', images ? images.length : 0);
    console.log('Payload keys:', Object.keys(payload));
    // Remove verbose full payload logging to avoid flooding logs with base64 data
    // console.log('Full payload:', JSON.stringify(payload, null, 2));
    console.log('========================');
    
    // 根据API文档，nano-banana图生图使用/v1/images/edits接口，文生图使用/v1/images/generations接口
    if (mode === 'image-to-image') {
      // 图生图模式 - 使用/v1/images/edits接口，editGeminiImage函数
      const finalImage = images?.[0] || image;
      
      if (!finalImage) {
        throw new Error('NANO_BANANA_MISSING_IMAGE: nano-banana model requires at least one image for editing in image-to-image mode');
      }
      
      const urls = await editGeminiImage({
        prompt: payload.prompt,
        image: finalImage,
        size: payload?.size ?? payload?.params?.size,
        n: payload?.n ?? payload?.params?.n,
        quality: payload?.quality ?? payload?.params?.quality,
      }, apiKey);
      return { urls, seed: undefined };
    } else {
      // 文生图模式 - 使用正确的/v1/images/generations接口
      const urls = await generateGeminiImage({
        prompt: payload.prompt,
        size: payload?.size ?? payload?.params?.size,
        n: payload?.n ?? payload?.params?.n,
        quality: payload?.quality ?? payload?.params?.quality,
      }, apiKey);
      return { urls, seed: undefined };
    }
  }

  throw new Error(`UNSUPPORTED_MODEL:${model}`);
}
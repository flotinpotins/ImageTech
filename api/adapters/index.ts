import { generateJimengT2I } from "./jimeng_t2i";
import { generateGPTImage } from "./gpt_image_1";
import { generateGeminiImage, editGeminiImage } from "./comfly_gemini";

export async function dispatchGenerate(model: string, payload: any, apiKey?: string) {
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
    return generateGeminiImage({
      prompt: payload.prompt,
      images: payload?.images ?? payload?.params?.images,
      size: payload?.size ?? payload?.params?.size,
      n: payload?.n ?? payload?.params?.n,
      quality: payload?.quality ?? payload?.params?.quality,
    }, apiKey);
  }

  if (model === "nano-banana") {
    // nano-banana 模型支持文生图和图生图两种模式
    const mode = payload?.mode ?? payload?.params?.mode ?? 'text-to-image';
    const image = payload?.image ?? payload?.params?.image;
    
    console.log('=== NANO-BANANA DEBUG ===');
    console.log('Mode:', mode);
    console.log('Image provided:', !!image);
    console.log('Image length:', image ? image.length : 0);
    console.log('Payload keys:', Object.keys(payload));
    console.log('========================');
    
    if (mode === 'image-to-image') {
      // 图生图模式
      if (!image) {
        throw new Error('NANO_BANANA_MISSING_IMAGE: nano-banana model requires an image for editing in image-to-image mode');
      }
      
      return editGeminiImage({
        prompt: payload.prompt,
        image: image,
        response_format: payload?.response_format ?? payload?.params?.response_format ?? 'url',
      }, apiKey).then(urls => ({ urls, seed: undefined }));
    } else {
      // 文生图模式
      return generateGeminiImage({
        prompt: payload.prompt,
        size: payload?.size ?? payload?.params?.size,
        n: payload?.n ?? payload?.params?.n,
        quality: payload?.quality ?? payload?.params?.quality,
      }, apiKey).then(urls => ({ urls, seed: undefined }));
    }
  }
  
  throw new Error(`UNSUPPORTED_MODEL:${model}`);
}
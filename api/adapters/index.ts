import { generateJimengT2I } from "./jimeng_t2i";
import { generateGPTImage } from "./gpt_image_1";
import { generateGeminiImage } from './comfly_gemini.js';
import { generateNanoBanana, editNanoBanana } from './nano_banana.js'

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
    const images = payload?.images ?? payload?.params?.images;
    const n = payload?.n ?? payload?.params?.n;
    const seed = payload?.seed ?? payload?.params?.seed;
    
    console.log('=== NANO-BANANA DEBUG (adapters/index) ===');
    console.log('Mode:', mode);
    console.log('Image provided:', !!image);
    console.log('Images len:', Array.isArray(images) ? images.length : 0);
    
    if (mode === 'image-to-image') {
      if (!image && (!images || images.length === 0)) {
        throw new Error('NANO_BANANA_MISSING_IMAGE: nano-banana model requires an image for editing in image-to-image mode');
      }
      return editNanoBanana({
        prompt: payload.prompt,
        image,
        images,
        n,
        seed,
      }, apiKey);
    } else {
      return generateNanoBanana({
        prompt: payload.prompt,
        images,
        n,
        seed,
      }, apiKey);
    }
  }
  
  throw new Error(`UNSUPPORTED_MODEL:${model}`);
}
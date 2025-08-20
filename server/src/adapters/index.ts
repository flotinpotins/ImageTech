import { generateJimengT2I } from "./jimeng_t2i.js";
import { generateGPTImage } from "./gpt_image_1.js";

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
    const gptParams = {
      prompt: payload.prompt,
      images: payload?.images ?? payload?.params?.images,
      mask: payload?.mask ?? payload?.params?.mask,
      size: payload?.size ?? payload?.params?.size,
      n: payload?.n ?? payload?.params?.n,
      quality: payload?.quality ?? payload?.params?.quality,
      imageFormat: payload?.imageFormat ?? payload?.params?.imageFormat,
    };
    
    // 添加参数验证日志
    console.log('=== Backend dispatchGenerate (GPT) ===');
    console.log('Received payload:', JSON.stringify(payload, null, 2));
    console.log('Processed GPT params:', JSON.stringify(gptParams, null, 2));
    console.log('=====================================');
    
    return generateGPTImage(gptParams, apiKey);
  }
  

  throw new Error(`UNSUPPORTED_MODEL:${model}`);
}
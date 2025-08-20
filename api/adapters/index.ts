import { generateJimengT2I } from "./jimeng_t2i";
import { generateGPTImage } from "./gpt_image_1";

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
  

  
  throw new Error(`UNSUPPORTED_MODEL:${model}`);
}
}
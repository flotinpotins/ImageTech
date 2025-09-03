import { generateJimengT2I } from "./jimeng_t2i.js";
import { generateGPTImage } from "./gpt_image_1.js";
import { generateGeminiImage } from "./comfly_gemini.js";
import { generateNanoBanana, editNanoBanana } from "./nano_banana.js";
export async function dispatchGenerate(model, payload, apiKey) {
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
        // GPT模型使用单图字段，需要转换为images数组
        const singleImage = payload?.image ?? payload?.params?.image;
        const imagesArray = payload?.images ?? payload?.params?.images;
        const finalImages = singleImage ? [singleImage] : imagesArray;
        return generateGPTImage({
            prompt: payload.prompt,
            images: finalImages,
            mask: payload?.mask ?? payload?.params?.mask,
            model: payload?.model ?? payload?.params?.model ?? "gpt-image-1",
            size: payload?.size ?? payload?.params?.size,
            n: payload?.n ?? payload?.params?.n,
            quality: payload?.quality ?? payload?.params?.quality,
            response_format: payload?.response_format ?? payload?.params?.response_format,
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
        // 使用 nano-banana 适配器，支持文生图与图生图
        const mode = payload?.mode ?? 'text-to-image';
        if (mode === 'image-to-image') {
            const finalImage = payload?.images?.[0] || payload?.image;
            if (!finalImage) {
                throw new Error('NANO_BANANA_MISSING_IMAGE: nano-banana model requires an image for editing in image-to-image mode');
            }
            const { urls, seed } = await editNanoBanana({
                prompt: payload.prompt,
                image: finalImage,
                n: payload?.n,
                seed: payload?.seed,
            }, apiKey);
            return { urls, seed };
        }
        else {
            const { urls, seed } = await generateNanoBanana({
                prompt: payload.prompt,
                images: payload?.images,
                n: payload?.n,
                seed: payload?.seed,
            }, apiKey);
            return { urls, seed };
        }
    }
    throw new Error(`UNSUPPORTED_MODEL:${model}`);
}

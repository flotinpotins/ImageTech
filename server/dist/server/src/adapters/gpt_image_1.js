import FormData from 'form-data';
import fetch from 'node-fetch';
// 将 dataURL 转为 Buffer
function dataURLToBuffer(dataURL) {
    const matches = dataURL.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    if (!matches) {
        throw new Error('Invalid dataURL format');
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    return { buffer, mimeType };
}
// 获取文件扩展名
function getFileExtension(mimeType) {
    const ext = mimeType.split('/')[1];
    return ext === 'jpeg' ? 'jpg' : ext;
}
// 并发控制变量
let activeGPTRequests = 0;
const MAX_CONCURRENT_GPT_REQUESTS = 3;
// 等待可用槽位
async function waitForGPTSlot() {
    while (activeGPTRequests >= MAX_CONCURRENT_GPT_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    activeGPTRequests++;
    console.log(`GPT request slot acquired (active: ${activeGPTRequests}/${MAX_CONCURRENT_GPT_REQUESTS})`);
}
// 释放槽位
function releaseGPTSlot() {
    activeGPTRequests = Math.max(0, activeGPTRequests - 1);
    console.log(`GPT request slot released (active: ${activeGPTRequests}/${MAX_CONCURRENT_GPT_REQUESTS})`);
}
export async function generateGPTImage(p, apiKey) {
    // 等待可用的请求槽位
    await waitForGPTSlot();
    try {
        // 添加详细的参数日志
        console.log('=== GPT Image Generation Request ===');
        console.log('Prompt:', p.prompt);
        console.log('Images count:', p.images?.length || 0);
        console.log('Has mask:', !!p.mask);
        console.log('Size:', p.size);
        console.log('N:', p.n);
        console.log('Quality:', p.quality);
        console.log('API Key provided:', !!apiKey);
        console.log('=====================================');
        const base = process.env.PROVIDER_BASE_URL;
        const key = apiKey || process.env.PROVIDER_API_KEY;
        if (!base || !key)
            throw new Error("MISSING_PROVIDER_CONFIG");
        // 根据是否有 images 决定走哪个端点
        const hasImages = p.images && p.images.length > 0;
        const endpoint = hasImages ? '/v1/images/edits' : '/v1/images/generations';
        const url = `${base}${endpoint}`;
        let body;
        let headers = {
            'Authorization': `Bearer ${key}`,
        };
        if (hasImages) {
            // 图像编辑模式 - 使用 multipart/form-data
            const form = new FormData();
            // 添加图片（仅使用第一张，以兼容提供商的 edits 接口约束）
            const editImages = (p.images || []).slice(0, 1);
            for (let i = 0; i < editImages.length; i++) {
                const { buffer, mimeType } = dataURLToBuffer(editImages[i]);
                const ext = getFileExtension(mimeType);
                form.append('image', buffer, `image_${i}.${ext}`);
            }
            // 添加 mask (如果有)
            if (p.mask) {
                const { buffer } = dataURLToBuffer(p.mask);
                form.append('mask', buffer, 'mask.png');
            }
            // 添加其他参数
            form.append('prompt', p.prompt);
            form.append('model', 'gpt-image-1');
            // 移除 response_format 参数，因为提供商不支持
            if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
                form.append('size', p.size);
            }
            // 总是传递 n 参数，默认为 1
            form.append('n', (p.n || 1).toString());
            // 注意：quality 在图像编辑模式（edits）下不被支持，不传递以避免提供商错误
            body = form;
            headers = {
                ...headers,
                ...form.getHeaders(),
            };
        }
        else {
            // 文生图模式 - 使用 JSON
            headers['Content-Type'] = 'application/json';
            const jsonBody = {
                model: 'gpt-image-1',
                prompt: p.prompt,
                // 移除 response_format 参数，因为提供商不支持
            };
            if (p.size && p.size !== 'adaptive' && p.size !== 'auto') {
                jsonBody.size = p.size;
            }
            // 总是传递 n 参数，默认为 1
            jsonBody.n = p.n || 1;
            // 为避免供应商参数不兼容，暂不传递 quality 字段
            body = JSON.stringify(jsonBody);
        }
        // 发送请求 - 添加重试机制
        const maxRetries = 2;
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const ctl = new AbortController();
            const timeout = setTimeout(() => ctl.abort(), 180000); // 减少到180s超时
            // 添加请求开始时间用于调试
            const requestStartTime = Date.now();
            console.log(`GPT Attempt ${attempt}/${maxRetries} - Starting request at:`, new Date(requestStartTime).toISOString());
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: ctl.signal,
                });
                const requestDuration = Date.now() - requestStartTime;
                console.log(`GPT Attempt ${attempt} - Request completed in ${requestDuration}ms`);
                if (!response.ok) {
                    const errorText = await response.text().catch(() => response.statusText);
                    console.error('=== GPT Image API Error ===');
                    console.error('Status:', response.status);
                    console.error('Status Text:', response.statusText);
                    console.error('Error Response:', errorText);
                    console.error('Request URL:', url);
                    console.error('API Key used:', key ? `${key.substring(0, 10)}...` : 'None');
                    console.error('============================');
                    throw new Error(`PROVIDER_${response.status}:${errorText}`);
                }
                const result = await response.json();
                // 处理响应数据
                const data = result.data || [];
                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error('PROVIDER_EMPTY_RESULTS');
                }
                // 处理不同格式的响应数据
                const imageFormat = p.imageFormat || 'png';
                const mimeType = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
                const urls = data
                    .map((item) => {
                    // 支持 b64_json 和 url 两种格式
                    if (item.b64_json) {
                        return `data:${mimeType};base64,${item.b64_json}`;
                    }
                    else if (item.url) {
                        return item.url;
                    }
                    return null;
                })
                    .filter(Boolean);
                if (urls.length === 0) {
                    throw new Error('PROVIDER_NO_VALID_IMAGES');
                }
                return { urls, seed: undefined };
            }
            catch (err) {
                const requestDuration = Date.now() - requestStartTime;
                console.log(`GPT Attempt ${attempt} failed after ${requestDuration}ms:`, err.message);
                lastError = err;
                // 清理超时
                clearTimeout(timeout);
                // 如果是超时错误且还有重试机会，继续重试
                if (err?.name === 'AbortError' && attempt < maxRetries) {
                    console.log(`GPT timeout on attempt ${attempt}, retrying in 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                // 如果是网络错误且还有重试机会，继续重试
                if (err.message.includes('fetch') && attempt < maxRetries) {
                    console.log(`GPT network error on attempt ${attempt}, retrying in 3 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                // 最后一次尝试失败，抛出错误
                if (attempt === maxRetries) {
                    if (err?.name === 'AbortError') {
                        throw new Error('GPT_TIMEOUT_AFTER_RETRIES');
                    }
                    // 添加更详细的错误信息
                    if (err.message.includes('fetch')) {
                        console.error('GPT Network error details:', {
                            message: err.message,
                            stack: err.stack,
                            duration: requestDuration,
                            attempts: maxRetries
                        });
                    }
                    throw err;
                }
            }
        }
        // 如果所有重试都失败了
        throw lastError || new Error('GPT: All retry attempts failed');
    }
    finally {
        // 释放请求槽位
        releaseGPTSlot();
    }
}

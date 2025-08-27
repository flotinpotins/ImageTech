// 并发控制变量
let activeJimengRequests = 0;
const MAX_CONCURRENT_JIMENG_REQUESTS = 3;
// 等待可用槽位
async function waitForJimengSlot() {
    while (activeJimengRequests >= MAX_CONCURRENT_JIMENG_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    activeJimengRequests++;
    console.log(`Jimeng request slot acquired (active: ${activeJimengRequests}/${MAX_CONCURRENT_JIMENG_REQUESTS})`);
}
// 释放槽位
function releaseJimengSlot() {
    activeJimengRequests = Math.max(0, activeJimengRequests - 1);
    console.log(`Jimeng request slot released (active: ${activeJimengRequests}/${MAX_CONCURRENT_JIMENG_REQUESTS})`);
}
export async function generateJimengT2I(p, apiKey) {
    // 等待可用的请求槽位
    await waitForJimengSlot();
    try {
        const base = process.env.PROVIDER_BASE_URL;
        const key = apiKey || process.env.PROVIDER_API_KEY;
        if (!base || !key)
            throw new Error("MISSING_PROVIDER_CONFIG");
        const body = {
            model: "doubao-seedream-3-0-t2i-250415",
            prompt: p.prompt,
            response_format: "b64_json", // 改为b64_json以便处理格式
            size: p.size,
            seed: p.seed,
            guidance_scale: p.guidance_scale,
            watermark: p.watermark ?? false,
        };
        // 发送请求 - 添加重试机制
        const maxRetries = 2;
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const ctl = new AbortController();
            const timeout = setTimeout(() => ctl.abort(), 180000); // 增加到180s超时
            // 添加请求开始时间用于调试
            const requestStartTime = Date.now();
            console.log(`Jimeng Attempt ${attempt}/${maxRetries} - Starting request at:`, new Date(requestStartTime).toISOString());
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
                const requestDuration = Date.now() - requestStartTime;
                console.log(`Jimeng Attempt ${attempt} - Request completed in ${requestDuration}ms`);
                if (!r.ok) {
                    const msg = await r.text().catch(() => r.statusText);
                    throw new Error(`PROVIDER_${r.status}:${msg}`);
                }
                const j = await r.json();
                // 处理响应数据
                const data = j?.data || [];
                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error('PROVIDER_EMPTY_RESULTS');
                }
                // 将 b64_json 转换为 data URLs，根据选择的格式设置MIME类型
                const imageFormat = p.imageFormat || 'png';
                const mimeType = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
                const urls = data
                    .map((item) => item.b64_json)
                    .filter(Boolean)
                    .map((b64) => `data:${mimeType};base64,${b64}`);
                if (urls.length === 0) {
                    throw new Error('PROVIDER_NO_VALID_IMAGES');
                }
                return { urls, seed: p.seed };
            }
            catch (err) {
                const requestDuration = Date.now() - requestStartTime;
                console.log(`Jimeng Attempt ${attempt} failed after ${requestDuration}ms:`, err.message);
                lastError = err;
                // 清理超时
                clearTimeout(timeout);
                // 如果是超时错误且还有重试机会，继续重试
                if (err?.name === 'AbortError' && attempt < maxRetries) {
                    console.log(`Jimeng timeout on attempt ${attempt}, retrying in 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                // 如果是网络错误且还有重试机会，继续重试
                if (err.message.includes('fetch') && attempt < maxRetries) {
                    console.log(`Jimeng network error on attempt ${attempt}, retrying in 3 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                // 最后一次尝试失败，抛出错误
                if (attempt === maxRetries) {
                    if (err?.name === 'AbortError') {
                        throw new Error('JIMENG_TIMEOUT_AFTER_RETRIES');
                    }
                    // 添加更详细的错误信息
                    if (err.message.includes('fetch')) {
                        console.error('Jimeng Network error details:', {
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
        throw lastError || new Error('Jimeng: All retry attempts failed');
    }
    finally {
        // 释放请求槽位
        releaseJimengSlot();
    }
}

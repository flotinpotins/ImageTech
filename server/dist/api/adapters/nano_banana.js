import { uploadImageToStorage } from '../storage.js';
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function normalizeImageInputs(p) {
    const list = [];
    if (Array.isArray(p.images))
        list.push(...p.images);
    if (p.image)
        list.push(p.image);
    // 去重
    return Array.from(new Set(list.filter(Boolean)));
}
async function downloadToDataURL(url) {
    const resp = await fetch(url);
    if (!resp.ok)
        throw new Error(`DOWNLOAD_${resp.status}:${resp.statusText}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'image/png';
    const b64 = buf.toString('base64');
    return `data:${contentType};base64,${b64}`;
}
async function requestAndPoll(modelPath, payload, apiKey) {
    const base = 'https://ai.comfly.chat';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };
    const reqUrl = `${base}/fal-ai/${modelPath}`;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 300000); // 300s
    try {
        const initRes = await fetch(reqUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: ctl.signal,
        });
        if (!initRes.ok) {
            const errTxt = await initRes.text().catch(() => initRes.statusText);
            throw new Error(`NANO_INIT_${initRes.status}:${errTxt}`);
        }
        const initJson = await initRes.json();
        const requestId = initJson?.request_id;
        let responseUrl = initJson?.response_url || '';
        if (!requestId && !responseUrl) {
            throw new Error('NANO_INVALID_INIT_RESPONSE');
        }
        if (!responseUrl) {
            responseUrl = `${base}/fal-ai/${modelPath}/requests/${requestId}`;
        }
        if (responseUrl.includes('queue.fal.run')) {
            responseUrl = responseUrl.replace('https://queue.fal.run', base);
        }
        // poll until images available
        const pollHeaders = { 'Authorization': `Bearer ${apiKey}` };
        const maxRetries = 120; // ~120s
        for (let i = 0; i < maxRetries; i++) {
            const res = await fetch(responseUrl, { headers: pollHeaders });
            if (res.ok) {
                const j = await res.json();
                if (j?.images && Array.isArray(j.images) && j.images.length > 0) {
                    return j.images;
                }
            }
            await sleep(1000);
        }
        throw new Error('NANO_BANANA_TIMEOUT');
    }
    finally {
        clearTimeout(to);
    }
}
async function processResultAndUpload(images, prompt) {
    const urls = [];
    for (const it of images) {
        try {
            let dataUrl = null;
            if (typeof it === 'string') {
                // sometimes API may directly return url string
                const url = it;
                if (url.startsWith('data:')) {
                    dataUrl = url;
                }
                else {
                    const fixedUrl = url.includes('queue.fal.run') ? url.replace('https://queue.fal.run', 'https://ai.comfly.chat') : url;
                    dataUrl = await downloadToDataURL(fixedUrl);
                }
            }
            else if (it?.url) {
                const raw = String(it.url);
                const fixedUrl = raw.includes('queue.fal.run') ? raw.replace('https://queue.fal.run', 'https://ai.comfly.chat') : raw;
                dataUrl = await downloadToDataURL(fixedUrl);
            }
            if (!dataUrl)
                continue;
            const up = await uploadImageToStorage(dataUrl, {
                prefix: 'nano-banana',
                metadata: {
                    model: 'nano-banana',
                    prompt: String(prompt || '').slice(0, 100),
                },
            });
            urls.push(up.url);
        }
        catch (e) {
            console.error('nano-banana upload error:', e);
            // fallback: ignore error, or push original when available
            if (it?.url)
                urls.push(String(it.url));
        }
    }
    if (urls.length === 0)
        throw new Error('NANO_EMPTY_RESULTS');
    return urls;
}
export async function generateNanoBanana(p, apiKey) {
    const key = apiKey || process.env.PROVIDER_API_KEY;
    if (!key)
        throw new Error('MISSING_API_KEY');
    const images = normalizeImageInputs(p);
    const num_images = clamp(p.n ?? 1, 1, 4);
    const payload = {
        prompt: p.prompt,
        num_images,
    };
    if (typeof p.seed === 'number' && p.seed > 0)
        payload.seed = p.seed;
    if (images.length > 0)
        payload.image_urls = images; // 支持 dataURL 或 http(s) URL
    const results = await requestAndPoll('nano-banana', payload, key);
    const urls = await processResultAndUpload(results, p.prompt);
    return { urls, seed: p.seed };
}
export async function editNanoBanana(p, apiKey) {
    const key = apiKey || process.env.PROVIDER_API_KEY;
    if (!key)
        throw new Error('MISSING_API_KEY');
    const images = normalizeImageInputs(p);
    if (images.length === 0)
        throw new Error('NANO_BANANA_MISSING_IMAGE');
    const num_images = clamp(p.n ?? 1, 1, 4);
    const payload = {
        prompt: p.prompt,
        num_images,
        image_urls: images, // 支持 dataURL 或 http(s) URL
    };
    if (typeof p.seed === 'number' && p.seed > 0)
        payload.seed = p.seed;
    const results = await requestAndPoll('nano-banana/edit', payload, key);
    const urls = await processResultAndUpload(results, p.prompt);
    return { urls, seed: p.seed };
}

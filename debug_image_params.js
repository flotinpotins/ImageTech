// Debug script to test image parameter passing
console.log('=== Image Parameter Debug Test ===');

// 模拟前端发送的请求数据
const frontendRequest = {
  model: "gpt-image-1",
  prompt: "test prompt",
  params: {
    images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="],
    size: "1024x1024",
    n: 1,
    quality: "auto"
  }
};

console.log('Frontend request structure:');
console.log(JSON.stringify(frontendRequest, null, 2));

// 模拟后端 dispatchGenerate 的参数
const { prompt, params } = frontendRequest;
const dispatchPayload = { prompt, ...params };

console.log('\nDispatch payload:');
console.log(JSON.stringify(dispatchPayload, null, 2));

// 测试当前的参数解析逻辑
function testParameterResolution(payload) {
  console.log('\n=== Parameter Resolution Test ===');
  
  const images = payload?.images ?? payload?.params?.images;
  const mask = payload?.mask ?? payload?.params?.mask;
  const size = payload?.size ?? payload?.params?.size;
  const n = payload?.n ?? payload?.params?.n;
  const quality = payload?.quality ?? payload?.params?.quality;
  
  console.log('Resolved parameters:');
  console.log('images:', images ? `[${images.length} images]` : 'undefined');
  console.log('mask:', mask || 'undefined');
  console.log('size:', size || 'undefined');
  console.log('n:', n || 'undefined');
  console.log('quality:', quality || 'undefined');
  
  return { images, mask, size, n, quality };
}

// 测试当前逻辑
console.log('\n--- Testing Current Logic ---');
testParameterResolution(dispatchPayload);

// 测试修复后的逻辑
console.log('\n--- Testing Fixed Logic (direct access) ---');
const fixedResult = {
  images: dispatchPayload.images,
  mask: dispatchPayload.mask,
  size: dispatchPayload.size,
  n: dispatchPayload.n,
  quality: dispatchPayload.quality
};
console.log('Fixed parameters:');
console.log('images:', fixedResult.images ? `[${fixedResult.images.length} images]` : 'undefined');
console.log('mask:', fixedResult.mask || 'undefined');
console.log('size:', fixedResult.size || 'undefined');
console.log('n:', fixedResult.n || 'undefined');
console.log('quality:', fixedResult.quality || 'undefined');
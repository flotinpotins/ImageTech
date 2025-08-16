// Debug script to test dataURL parsing in gpt_image_1.ts
console.log('=== DataURL Parsing Debug Test ===');

// 模拟 dataURLToBuffer 函数
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

// 测试不同类型的图片 dataURL
const testDataURLs = [
  // 正常的PNG
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  
  // 正常的JPEG
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwDX4DoAAAAAElFTkSuQmCC",
  
  // WebP
  "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/v8AAAA=",
  
  // 无效格式1 - 没有 base64 前缀
  "data:image/png,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  
  // 无效格式2 - 完全错误的格式
  "invalid_data_url",
  
  // 无效格式3 - 缺少 MIME type
  "data:;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
];

console.log('\n--- Testing dataURL parsing ---');
testDataURLs.forEach((dataUrl, index) => {
  console.log(`\nTest ${index + 1}:`);
  console.log(`Input: ${dataUrl.substring(0, 50)}...`);
  
  try {
    const result = dataURLToBuffer(dataUrl);
    console.log(`✓ Success - MIME: ${result.mimeType}, Buffer size: ${result.buffer.length} bytes`);
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
});

// 测试来自 ImageUpload 组件的模拟 dataURL
console.log('\n--- Testing ImageUpload generated dataURL format ---');

// 模拟 FileReader.readAsDataURL 的输出
function simulateFileToDataURL(fileName, fileType) {
  // 生成模拟的 base64 数据（实际应用中这会是真实的图片数据）
  const mockBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  return `data:${fileType};base64,${mockBase64}`;
}

const simulatedFiles = [
  { name: "test.png", type: "image/png" },
  { name: "test.jpg", type: "image/jpeg" },
  { name: "test.webp", type: "image/webp" },
  { name: "test.gif", type: "image/gif" },
];

simulatedFiles.forEach(file => {
  console.log(`\nTesting ${file.name} (${file.type}):`);
  const dataUrl = simulateFileToDataURL(file.name, file.type);
  console.log(`Generated: ${dataUrl.substring(0, 50)}...`);
  
  try {
    const result = dataURLToBuffer(dataUrl);
    console.log(`✓ Parsing success - MIME: ${result.mimeType}, Buffer: ${result.buffer.length} bytes`);
  } catch (error) {
    console.log(`✗ Parsing failed: ${error.message}`);
  }
});

console.log('\n=== Test Complete ===');
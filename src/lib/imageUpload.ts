// 图片上传工具函数
export async function uploadImageToTemp(dataUrl: string): Promise<string> {
  try {
    const response = await fetch('http://localhost:3001/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataUrl }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.url;
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error('图片上传失败，请重试');
  }
}

// 批量上传图片
export async function uploadImagesToTemp(dataUrls: string[]): Promise<string[]> {
  const uploadPromises = dataUrls.map(dataUrl => uploadImageToTemp(dataUrl));
  return Promise.all(uploadPromises);
}
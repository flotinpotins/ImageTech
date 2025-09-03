import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { 
  SingleGenerationForm, 
  CreateTaskRequest,
  BatchTaskItem,
  TaskResult,
  GetTaskResponse,
  CreateTaskResponse
} from "@/types";

// Tailwind CSS类名合并工具
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 生成唯一ID
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// 简单的文件转DataURL（不压缩，避免Trae浏览器环境兼容性问题）
export function simpleFileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('Converting file to DataURL, file size:', file.size, 'type:', file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      console.log('FileReader success, DataURL length:', result.length);
      resolve(result);
    };
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

// 压缩图片并转换为DataURL（优化版）
export function compressImage(file: File, maxWidth: number = 1920, maxHeight: number = 1080, quality: number = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('Compressing image, original size:', file.size, 'type:', file.type);
    
    // 调整压缩阈值，2MB以下不压缩，避免不必要的质量损失
    if (file.size <= 2 * 1024 * 1024) {
      console.log('File size is acceptable, using simple conversion');
      return simpleFileToDataURL(file).then(resolve).catch(reject);
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            console.error('Failed to get canvas context');
            return simpleFileToDataURL(file).then(resolve).catch(reject);
          }
          
          // 计算压缩后的尺寸
          let { width, height } = img;
          console.log('Original image dimensions:', width, 'x', height);
          
          // 更智能的尺寸压缩策略
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
            console.log('Resized image dimensions:', width, 'x', height);
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // 使用更好的图像渲染质量
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // 绘制压缩后的图片
          ctx.drawImage(img, 0, 0, width, height);
          
          // 根据文件类型选择最佳压缩格式
          let outputFormat = file.type;
          let outputQuality = quality;
          
          // 对于大文件，使用更激进的压缩
          if (file.size > 5 * 1024 * 1024) {
            outputFormat = 'image/jpeg'; // 强制使用JPEG获得更好的压缩率
            outputQuality = 0.75;
          }
          
          // 转换为压缩后的DataURL
          const compressedDataUrl = canvas.toDataURL(outputFormat, outputQuality);
          
          // 验证压缩结果
          if (!compressedDataUrl || compressedDataUrl.length < 100) {
            console.warn('Compression resulted in invalid data, using original');
            return simpleFileToDataURL(file).then(resolve).catch(reject);
          }
          
          const compressionRatio = compressedDataUrl.length / (file.size * 1.37); // base64编码约增加37%
          console.log('Compression complete:', {
            originalSize: file.size,
            compressedLength: compressedDataUrl.length,
            compressionRatio: compressionRatio.toFixed(2),
            format: outputFormat,
            quality: outputQuality
          });
          
          resolve(compressedDataUrl);
        } catch (error) {
          console.error('Canvas compression failed:', error);
          simpleFileToDataURL(file).then(resolve).catch(reject);
        }
      };
      img.onerror = (error) => {
        console.error('Image load failed:', error);
        simpleFileToDataURL(file).then(resolve).catch(reject);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (error) => {
      console.error('FileReader failed:', error);
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

// 文件转换为DataURL（已弃用，使用压缩版本）
export function fileToDataURL(file: File): Promise<string> {
  return compressImage(file);
}

// 验证图片文件
export function validateImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const maxSize = 5 * 1024 * 1024; // 5MB，降低限制以提高上传成功率
  
  return validTypes.includes(file.type) && file.size <= maxSize;
}

// 解析批量输入文本
export function parseBatchInput(text: string, defaultModel: string = 'jimeng-t2i'): BatchTaskItem[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  return lines.map((line, index) => {
    const id = generateId();
    const lineNumber = index + 1;
    
    let parsed: SingleGenerationForm | null = null;
    
    try {
      if (line.trim().startsWith('{')) {
        // JSONL格式
        const jsonData = JSON.parse(line);
        parsed = {
          prompt: jsonData.prompt || '',
          size: jsonData.size || '1024x1024',
          model: jsonData.model || defaultModel,
          guidanceScale: jsonData.guidanceScale,
          images: jsonData.images,
          mask: jsonData.mask,
          n: jsonData.n,
          quality: jsonData.quality,
        } as SingleGenerationForm;
      } else {
        // 纯文本格式
        parsed = {
          prompt: line.trim(),
          size: '1024x1024',
          model: defaultModel
        } as SingleGenerationForm;
      }
    } catch (error) {
      console.error(`解析第${lineNumber}行失败:`, error);
    }
    
    return {
      id,
      lineNumber,
      content: line,
      parsed,
      status: 'queued' as const
    };
  });
}

// 构建API请求参数
export async function buildTaskRequest(form: SingleGenerationForm): Promise<CreateTaskRequest> {
  const { model, prompt, size, guidanceScale, images, mask, n, quality, imageFormat } = form;
  
  // 将"自适应"规范化为 undefined，避免把无效的 size 传给后端/服务商
  const normalizedSize = size === 'adaptive' ? undefined : size;
  
  let params: Record<string, any> = {
    size: normalizedSize,
    response_format: 'url'
  };
  
  switch (model) {
    case 'jimeng-t2i':
      params = {
        ...params,
        model: 'doubao-seedream-3-0-t2i-250415',
        // 与后端/服务商对齐使用 guidance_scale
        guidance_scale: guidanceScale ?? 7.5
      };
      break;
      
    case 'gpt-image-1': {
      // gpt-image-1模型不支持response_format参数，默认返回适当格式
      params = {
        model: 'gpt-image-1',
        size: normalizedSize,
        // 由后端根据是否有 images 选择 generations 或 edits
        images: images || undefined,
        mask: mask || undefined,
        n: n || undefined,
        quality: quality || undefined,
        imageFormat: imageFormat || 'png',
      };
      break;
    }
    

    
    case 'nano-banana': {
      // nano-banana 支持文生图和图生图两种模式
      const mode = form.mode || 'text-to-image';
      const requestData: any = {
        response_format: 'url',
        // 传递模式信息给后端
        mode: mode,
        // 添加尺寸参数，但排除 'adaptive'
        size: normalizedSize,
      };
      
      // 只有在图生图模式下才传递图片
      if (mode === 'image-to-image' && images && images.length > 0) {
        // 多图使用 images 数组，同时保留 image 的第一张用于兼容旧逻辑
        requestData.images = images;
        requestData.image = images[0];
      }
      
      params = requestData;
      break;
    }

  }
  
  return {
    provider: 'jimeng_image',
    model,
    prompt,
    params
  };
}

// 错误类型定义
interface ApiError extends Error {
  status?: number;
  code?: string;
  isRetryable?: boolean;
}

// 判断错误是否可重试
export function isRetryableError(error: any): boolean {
  if (error.status) {
    // 5xx 服务器错误通常可重试
    if (error.status >= 500 && error.status < 600) return true;
    // 429 限流错误可重试
    if (error.status === 429) return true;
    // 408 请求超时可重试
    if (error.status === 408) return true;
  }
  
  // 网络错误可重试
  if (error.name === 'TypeError' && error.message.includes('fetch')) return true;
  if (error.message.includes('network') || error.message.includes('timeout')) return true;
  
  return false;
}

// 创建友好的错误信息
export function createFriendlyErrorMessage(error: any): string {
  if (error.status) {
    switch (error.status) {
      case 400:
        return '请求参数有误，请检查输入内容';
      case 401:
        return 'API密钥无效或已过期';
      case 403:
        return '没有权限访问此服务';
      case 404:
        return '服务接口不存在';
      case 429:
        return '请求过于频繁，请稍后再试';
      case 500:
        // 检查是否是特定的API超时错误
        if (error.message && (error.message.includes('GEMINI_EDIT_408') || error.message.includes('408_AFTER_'))) {
          return 'nano-banana模型服务暂时繁忙，已尝试多次重试仍失败，请稍后重试或尝试其他模型';
        }
        if (error.message && (error.message.includes('GEMINI_EDIT_TIMEOUT') || error.message.includes('TIMEOUT_AFTER_'))) {
          return 'nano-banana模型处理超时，已尝试多次重试仍失败，建议降低图片复杂度或稍后重试';
        }
        if (error.message && error.message.includes('timeout')) {
          return '图片处理超时，请稍后重试或尝试其他模型';
        }
        return '服务器内部错误，请稍后重试';
      case 502:
        return '服务暂时不可用，正在重试...';
      case 503:
        return '服务暂时维护中，请稍后重试';
      case 504:
        return '服务响应超时，请稍后重试';
      default:
        if (error.status >= 500) {
          return '服务器错误，请稍后重试';
        }
        return `请求失败 (${error.status})`;
    }
  }
  
  // 检查特定的错误类型
  if (error.message) {
    // 处理Gemini API的特定错误
    if (error.message.includes('GEMINI_EDIT_502')) {
      return 'nano-banana模型服务暂时不可用，请稍后重试或尝试其他模型';
    }
    if (error.message.includes('GEMINI_EDIT_408') || error.message.includes('408_AFTER_') || 
        error.message.includes('GEMINI_EDIT_TIMEOUT') || error.message.includes('TIMEOUT_AFTER_')) {
      return 'nano-banana模型服务暂时繁忙，已尝试多次重试仍失败，请稍后重试或尝试其他模型';
    }
    if (error.message.includes('GEMINI_EDIT_') && error.message.includes('502')) {
      return 'nano-banana模型服务暂时不可用，请稍后重试或尝试其他模型';
    }
    if (error.message.includes('bad response status code 502')) {
      return 'AI服务暂时不可用，请稍后重试或尝试其他模型';
    }
    if (error.message.includes('fetch')) {
      return '网络连接失败，请检查网络连接';
    }
    if (error.message.includes('timeout') || error.message.includes('超时')) {
      return '请求超时，请稍后重试';
    }
  }
  
  return error.message || '未知错误';
}

// 带超时的fetch函数
async function fetchWithTimeout(url: string, options: globalThis.RequestInit, timeoutMs: number = 60000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new Error(`请求超时 (${timeoutMs}ms)`) as ApiError;
      timeoutError.status = 408;
      timeoutError.isRetryable = true;
      throw timeoutError;
    }
    throw error;
  }
}

// dataURL to Blob conversion
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  // The first part is like "data:image/png;base64"
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) {
    throw new Error('Invalid data URL format');
  }
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// API调用函数（增强版，支持重试和超时）
export async function createTask(
  request: CreateTaskRequest, 
  apiKey?: string,
  options?: {
    maxRetries?: number;
    timeoutMs?: number;
    onRetry?: (attempt: number, error: ApiError) => void;
  }
): Promise<CreateTaskResponse> {
  // 根据模型类型调整超时时间和重试策略
  const isNanoBanana = request.model === 'nano-banana';
  const defaultTimeout = isNanoBanana ? 600000 : 300000; // nano-banana使用10分钟超时
  const defaultRetries = isNanoBanana ? 2 : 3; // nano-banana减少重试次数，避免过度重试
  
  const { maxRetries = defaultRetries, timeoutMs = defaultTimeout, onRetry } = options || {};
  
  // 检查是否需要使用 FormData
  const needsFormData = (
    (request.model === 'nano-banana' && request.params?.mode === 'image-to-image' && ((request.params?.images && request.params.images.length > 0) || request.params?.image)) ||
    (request.model === 'gpt-image-1' && request.params?.images && request.params.images.length > 0)
  );

  let lastError: ApiError;
  const taskStartTime = Date.now();
  
  console.log(`🚀 Task creation started:`, {
    model: request.model,
    mode: request.params?.mode || 'text-to-image',
    hasImage: !!(request.params?.image || request.params?.images),
    timeout: timeoutMs,
    maxRetries,
    timestamp: new Date().toISOString()
  });
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStartTime = Date.now();
    try {
      console.log(`⏳ Attempt ${attempt + 1}/${maxRetries + 1} started at ${new Date().toISOString()}`);
      let response: Response;

      if (needsFormData) {
        // --- 使用 FormData 发送请求 ---
        const formDataStartTime = Date.now();
        console.log(`📦 Creating FormData for ${request.model}`);
        const formData = new FormData();
        formData.append('model', request.model);
        formData.append('prompt', request.prompt);
        
        // 将 params 对象中的每个键值对添加到 formData（除了特殊处理的字段）
        if (request.params) {
          Object.entries(request.params).forEach(([key, value]) => {
            // 图片相关字段将单独处理，避免重复添加
            if (!['image', 'images', 'mask'].includes(key) && value !== undefined) {
              formData.append(key, String(value));
            }
          });
        }

        // 根据模型类型处理图片
        if (request.model === 'nano-banana') {
          // nano-banana 模型处理
          formData.append('mode', 'image-to-image');
          
          // 统一从 images/image 收集为数组
          const imageArray = Array.isArray(request.params?.images)
            ? request.params.images
            : (Array.isArray(request.params?.image)
                ? request.params.image
                : (request.params?.image ? [request.params.image] : []));

          if (imageArray.length > 0) {
            const blobStartTime = Date.now();
            imageArray.forEach((imageUrl, index) => {
              const imageBlob = dataURLtoBlob(imageUrl);
              formData.append('images', imageBlob, `upload_${index}.png`);
            });
            console.log('🖼️ Multiple images processing completed:', {
              imageCount: imageArray.length,
              processingTime: Date.now() - blobStartTime + 'ms'
            });
          } else {
            throw new Error('Image is required for image-to-image generation.');
          }
        } else if (request.model === 'gpt-image-1') {
          // GPT 模型处理
          const imageData = request.params?.images;
          if (imageData && imageData.length > 0) {
            const blobStartTime = Date.now();
            
            // GPT 支持多图上传，使用 'images' 字段名与后端保持一致
            imageData.forEach((imageUrl: string, index: number) => {
              const imageBlob = dataURLtoBlob(imageUrl);
              formData.append('images', imageBlob, `image_${index}.png`);
            });
            
            console.log('🖼️ GPT images processing completed:', {
              imageCount: imageData.length,
              processingTime: Date.now() - blobStartTime + 'ms'
            });
            
            // 添加 mask 参数（如果有）
            if (request.params?.mask) {
              const maskBlob = dataURLtoBlob(request.params.mask);
              formData.append('mask', maskBlob, 'mask.png');
            }
          } else {
            throw new Error('Images are required for GPT image editing.');
          }
        }

        const headers: Record<string, string> = {};
        if (apiKey) {
          headers['x-api-key'] = apiKey;
        }
        
        const formDataEndTime = Date.now();
        console.log(`📋 FormData preparation completed in ${formDataEndTime - formDataStartTime}ms`);
        
        const requestStartTime = Date.now();
        // 注意：当 body 是 FormData 时，浏览器会自动设置 Content-Type
        response = await fetchWithTimeout('/api/tasks', {
          method: 'POST',
          headers,
          body: formData
        }, timeoutMs);
        
        const requestEndTime = Date.now();
        console.log(`🌐 FormData request completed in ${requestEndTime - requestStartTime}ms`);

      } else {
        // --- 默认使用 JSON 发送请求 ---
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (apiKey) {
          headers['x-api-key'] = apiKey;
        }
        const requestStartTime = Date.now();
        response = await fetchWithTimeout('/api/tasks', {
          method: 'POST',
          headers,
          body: JSON.stringify(request)
        }, timeoutMs);
        
        const requestEndTime = Date.now();
        console.log(`🌐 JSON request completed in ${requestEndTime - requestStartTime}ms`);
      }
      
      if (!response.ok) {
        let detail = '';
        let errorMessage = '';
        try {
          const errorText = await response.text();
          detail = errorText;
          
          // 尝试解析JSON错误响应
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) {
              errorMessage = errorJson.message;
            }
          } catch {
            // 如果不是JSON，使用原始文本
            errorMessage = errorText;
          }
        } catch {
          // 忽略解析错误，使用默认错误信息
        }
        
        const error = new Error(errorMessage || `HTTP ${response.status}: ${response.statusText}${detail ? ` - ${detail}` : ''}`) as ApiError;
        error.status = response.status;
        error.isRetryable = isRetryableError(error);
        
        // 如果是最后一次尝试或错误不可重试，直接抛出
        if (attempt === maxRetries || !error.isRetryable) {
          error.message = createFriendlyErrorMessage(error);
          throw error;
        }
        
        lastError = error;
        
        const attemptTime = Date.now() - attemptStartTime;
        console.log(`❌ Attempt ${attempt + 1} failed after ${attemptTime}ms:`, {
          status: error.status,
          message: error.message,
          isRetryable: error.isRetryable
        });
        
        // 通知重试回调
        if (onRetry) {
          onRetry(attempt + 1, error);
        }
        
        // 计算重试延迟（指数退避）
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`⏰ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      const parseStartTime = Date.now();
      const result = await response.json();
      const parseEndTime = Date.now();
      const totalTime = Date.now() - taskStartTime;
      const attemptTime = Date.now() - attemptStartTime;
      
      console.log(`✅ Task creation successful:`, {
        attempt: attempt + 1,
        attemptTime: attemptTime + 'ms',
        parseTime: (parseEndTime - parseStartTime) + 'ms',
        totalTime: totalTime + 'ms',
        taskId: result.taskId || 'unknown'
      });
      
      return result;
    } catch (error) {
      const apiError = error as ApiError;
      const attemptTime = Date.now() - attemptStartTime;
      
      console.log(`💥 Attempt ${attempt + 1} exception after ${attemptTime}ms:`, {
        name: apiError.name,
        message: apiError.message,
        isRetryable: isRetryableError(apiError)
      });
      
      // 如果是最后一次尝试或错误不可重试，直接抛出
      if (attempt === maxRetries || !isRetryableError(apiError)) {
        const totalTime = Date.now() - taskStartTime;
        console.log(`🚫 Task creation failed after ${totalTime}ms total time`);
        apiError.message = createFriendlyErrorMessage(apiError);
        throw apiError;
      }
      
      lastError = apiError;
      
      // 通知重试回调
      if (onRetry) {
        onRetry(attempt + 1, apiError);
      }
      
      // 计算重试延迟（指数退避）
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      console.log(`⏰ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // 如果所有重试都失败了
  const totalTime = Date.now() - taskStartTime;
  console.log(`🚫 All retries exhausted after ${totalTime}ms total time`);
  lastError!.message = createFriendlyErrorMessage(lastError!);
  throw lastError!;
}

export async function getTask(taskId: string): Promise<GetTaskResponse> {
  const response = await fetch(`/api/tasks?taskId=${encodeURIComponent(taskId)}`);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// 服务状态检查
export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  lastChecked: number;
  error?: string;
}

// 检查服务健康状态
export async function checkServiceHealth(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    const response = await fetchWithTimeout('/api/health', {
      method: 'GET',
    }, 5000); // 5秒超时
    
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      return {
        status: responseTime > 3000 ? 'degraded' : 'healthy',
        responseTime,
        lastChecked: Date.now()
      };
    } else {
      return {
        status: 'degraded',
        responseTime,
        lastChecked: Date.now(),
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'down',
      responseTime,
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : '服务不可用'
    };
  }
}

// 简化的服务状态检查（用于快速检测）
export async function quickServiceCheck(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('/api/health', {
      method: 'HEAD', // 使用HEAD请求减少数据传输
    }, 5000);
    return response.ok;
  } catch {
    return false;
  }
}

// 轮询任务状态
export async function pollTaskStatus(
  taskId: string, 
  onUpdate: (result: TaskResult) => void,
  maxAttempts: number = 60,
  interval: number = 2000,
  onProgress?: (progress: number) => void
): Promise<TaskResult> {
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        attempts++;
        const result = await getTask(taskId);
        
        // 计算进度百分比（基于轮询次数，最大95%，完成时100%）
        if (onProgress) {
          if (result.status === 'succeeded' || result.status === 'failed') {
            onProgress(100);
          } else {
            // 根据轮询次数计算进度，最大到95%
            const progressPercent = Math.min((attempts / maxAttempts) * 95, 95);
            onProgress(progressPercent);
          }
        }
        
        onUpdate(result);
        
        if (result.status === 'succeeded' || result.status === 'failed') {
          resolve(result);
          return;
        }
        
        if (attempts >= maxAttempts) {
          reject(new Error('轮询超时'));
          return;
        }
        
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
}

// 延迟函数
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 指数回退重试
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      const delayMs = Math.min(baseDelay * Math.pow(2, i), 2000);
      await delay(delayMs);
    }
  }
  
  throw lastError!;
}

// 格式化时间戳
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

// 复制到剪贴板
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

// 下载文件
export function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 安全地打开图片（兼容 data URL 和普通 URL）
export function openImage(
  url: string, 
  options?: {
    prompt?: string;
    usePromptAsFilename?: boolean;
    imageNaming?: {
      enabled: boolean;
      selectedOptions: string[];
    };
    prependPrompt?: string;
    appendPrompt?: string;
    imageFormat?: string;
    taskIndex?: number;
    // 新增：支持图片列表和导航
    imageList?: string[];
    currentIndex?: number;
  }
): void {
  try {
    // 图片列表和当前索引
    const imageList = options?.imageList || [url];
    let currentIndex = options?.currentIndex || 0;
    
    // 确保索引在有效范围内
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= imageList.length) currentIndex = imageList.length - 1;
    
    let currentUrl = imageList[currentIndex];
    let imageSrc = currentUrl;                 // 预览使用的图片地址
    let createdObjectUrl: string | null = null; // 若我们创建了对象URL，用于清理
    let fileExt = 'png';

    // 处理当前图片URL的函数
    const processImageUrl = (url: string) => {
      let src = url;
      let objectUrl: string | null = null;
      let ext = 'png';
      
      // 若为 data:image，先转成 Blob URL 以避免超长 data URL 带来的性能问题
      if (url.startsWith('data:image/')) {
        const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
        if (match) {
          const mime = match[1];
          ext = mime.split('/')[1] || 'png';
          const base64 = match[2];
          const binary = atob(base64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          const imageBlob = new Blob([bytes], { type: mime });
          objectUrl = URL.createObjectURL(imageBlob);
          src = objectUrl;
        }
      } else {
        // 普通 URL：尝试从 URL 推断扩展名
        const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
        if (m) ext = m[1].toLowerCase();
      }
      
      return { src, objectUrl, ext };
    };
    
    const { src, objectUrl, ext } = processImageUrl(currentUrl);
    imageSrc = src;
    createdObjectUrl = objectUrl;
    fileExt = ext;

    // —— 统一的预览层 ——
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:999999;';

    const container = document.createElement('div');
    container.style.cssText = 'max-width:90vw;max-height:90vh;text-align:center;color:#fff;position:relative;';

    const imgEl = document.createElement('img');
    imgEl.src = imageSrc;
    imgEl.alt = 'Generated Image';
    imgEl.style.cssText = 'max-width:90vw;max-height:80vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);';

    // 图片位置指示器（仅在有多张图片时显示）
    let indicator: HTMLElement | null = null;
    if (imageList.length > 1) {
      indicator = document.createElement('div');
      indicator.style.cssText = 'position:absolute;top:-40px;left:50%;transform:translateX(-50%);color:white;background:rgba(0,0,0,0.5);padding:8px 16px;border-radius:20px;font-size:14px;font-family:Arial,sans-serif;pointer-events:none;';
      indicator.textContent = `${currentIndex + 1} / ${imageList.length}`;
      container.appendChild(indicator);
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:12px;display:flex;gap:12px;justify-content:center;';

    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '下载图片';
    downloadBtn.style.cssText = 'padding:8px 16px;background:#0ea5e9;color:#fff;border:none;border-radius:12px;cursor:pointer;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭 (Esc)';
    closeBtn.style.cssText = 'padding:8px 16px;background:#374151;color:#fff;border:none;border-radius:12px;cursor:pointer;';

    actions.appendChild(downloadBtn);
    actions.appendChild(closeBtn);
    container.appendChild(imgEl);
    container.appendChild(actions);
    overlay.appendChild(container);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);

    // 切换到指定索引的图片
    const switchToImage = (newIndex: number) => {
      if (newIndex < 0 || newIndex >= imageList.length) return;
      
      currentIndex = newIndex;
      currentUrl = imageList[currentIndex];
      
      // 清理之前的对象URL
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }
      
      // 处理新图片
      const { src, objectUrl, ext } = processImageUrl(currentUrl);
      imageSrc = src;
      createdObjectUrl = objectUrl;
      fileExt = ext;
      
      // 更新图片显示
      imgEl.src = imageSrc;
      
      // 更新位置指示器
      if (indicator) {
        indicator.textContent = `${currentIndex + 1} / ${imageList.length}`;
      }
    };

    const cleanup = () => {
      try { document.body.style.overflow = prevOverflow; } catch (_) { /* ignore */ }
      try { overlay.remove(); } catch (_) { /* ignore */ }
      if (createdObjectUrl) {
        setTimeout(() => { try { URL.revokeObjectURL(createdObjectUrl!); } catch (_) { /* ignore */ } }, 0);
      }
      document.removeEventListener('keydown', onKeydown);
    };

    const onKeydown = (e: KeyboardEvent) => {
      console.log('键盘事件:', e.key, '图片列表长度:', imageList.length, '当前索引:', currentIndex);
      if (e.key === 'Escape') {
        cleanup();
      } else if (imageList.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const newIndex = currentIndex > 0 ? currentIndex - 1 : imageList.length - 1;
          console.log('左键切换到索引:', newIndex);
          switchToImage(newIndex);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const newIndex = currentIndex < imageList.length - 1 ? currentIndex + 1 : 0;
          console.log('右键切换到索引:', newIndex);
          switchToImage(newIndex);
        }
      }
    };
    document.addEventListener('keydown', onKeydown);
    console.log('键盘事件监听器已添加，图片列表:', imageList, '当前索引:', currentIndex);

    closeBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

    // 下载逻辑：若是我们创建的对象URL，直接下载；否则尝试 fetch->blob，失败则回退新标签打开
    downloadBtn.addEventListener('click', async () => {
      // 生成文件名
      let filename = `generated_image.${fileExt}`;
      
      if (options) {
        const extension = options.imageFormat || fileExt;
        
        if (options.imageNaming?.enabled && options.imageNaming.selectedOptions.length > 0) {
          // 使用自定义命名格式
          const nameParts: string[] = [];
          
          if (options.imageNaming.selectedOptions.includes('prepend') && options.prependPrompt) {
            nameParts.push(options.prependPrompt);
          }
          if (options.imageNaming.selectedOptions.includes('basic') && options.prompt) {
            // 从原始提示词中提取基本提示词（去除前置和后置提示词）
            let originalPrompt = options.prompt;
            if (options.prependPrompt && originalPrompt.startsWith(options.prependPrompt)) {
              originalPrompt = originalPrompt.substring(options.prependPrompt.length);
            }
            if (options.appendPrompt && originalPrompt.endsWith(options.appendPrompt)) {
              originalPrompt = originalPrompt.substring(0, originalPrompt.length - options.appendPrompt.length);
            }
            nameParts.push(originalPrompt.trim());
          }
          if (options.imageNaming.selectedOptions.includes('append') && options.appendPrompt) {
            nameParts.push(options.appendPrompt);
          }
          
          if (nameParts.length > 0) {
            const baseFilename = nameParts.join(' ')
              .replace(/[<>:"/\\|?*]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 100); // 限制长度
            filename = `${baseFilename}.${extension}`;
          } else {
            filename = `image_${options.taskIndex || 1}.${extension}`;
          }
        } else if (options.usePromptAsFilename && options.prompt) {
          // 使用提示词作为文件名，清理特殊字符
          const baseFilename = options.prompt
            .replace(/[<>:"/\\|?*]/g, '_')
            .substring(0, 100); // 限制长度
          filename = `${baseFilename}.${extension}`;
        }
      }
      
      if (createdObjectUrl) {
        const a = document.createElement('a');
        a.href = createdObjectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      try {
        const resp = await fetch(url, { mode: 'cors' });
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ } }, 0);
      } catch {
        // 跨域或网络失败时，回退到新标签打开
        window.open(url, '_blank');
      }
    });


  } catch (err) {
    // 出错则退回最简单的行为
    window.open(url, '_blank');
  }
}

// 导出错误数据
export function exportErrors(errors: BatchTaskItem[], format: 'txt' | 'json'): void {
  const failedItems = errors.filter(item => item.status === 'failed');
  
  let content: string;
  let filename: string;
  let mimeType: string;
  
  if (format === 'txt') {
    content = failedItems.map(item => 
      `Line ${item.lineNumber}: ${item.content}${"\n"}Error: ${item.error || 'Unknown error'}${"\n"}`
    ).join("\n");
    filename = `errors_${Date.now()}.txt`;
    mimeType = 'text/plain';
  } else {
    content = JSON.stringify(failedItems.map(item => ({
      lineNumber: item.lineNumber,
      content: item.content,
      error: item.error || 'Unknown error'
    })), null, 2);
    filename = `errors_${Date.now()}.json`;
    mimeType = 'application/json';
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadFile(url, filename);
  URL.revokeObjectURL(url);
}

// 验证表单
export function validateForm(form: SingleGenerationForm): string[] {
  const errors: string[] = [];
  
  if (!form.prompt.trim()) {
    errors.push('请输入提示词');
  }
  

  // jimeng-t2i 校验：引导系数范围 1-10
  if (form.model === 'jimeng-t2i' && form.guidanceScale !== undefined) {
    if (form.guidanceScale < 1 || form.guidanceScale > 10) {
      errors.push('即梦文生图的引导系数需在 1-10 之间');
    }
  }

  // gpt-image-1 校验
  if (form.model === 'gpt-image-1') {
    if (form.mask && (!form.images || form.images.length === 0)) {
      errors.push('使用蒙版编辑时需要至少上传一张底图');
    }
    if (form.n !== undefined) {
      if (typeof form.n !== 'number' || form.n < 1 || form.n > 10) {
        errors.push('生成数量 n 需在 1-10 之间');
      }
    }
  }

  // nano-banana 校验
  if (form.model === 'nano-banana' && form.mode === 'image-to-image') {
    if (!form.images || form.images.length === 0) {
      errors.push('图生图模式需要上传一张图片');
    }
  }
  
  return errors;
}

// 导出预设到JSON文件
export function exportPresets(presets: any[], filename?: string): void {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    presets: presets
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = filename || `workflow-presets-${formatTimestamp(Date.now())}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(link.href);
}

// 验证导入的预设数据
export function validateImportedPresets(data: any, filename?: string): { isValid: boolean; errors: string[]; presets?: any[] } {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('无效的文件格式');
    return { isValid: false, errors };
  }
  
  if (!data.presets || !Array.isArray(data.presets)) {
    errors.push('文件中未找到有效的预设数据');
    return { isValid: false, errors };
  }
  
  const validPresets: any[] = [];
  
  // 从文件名生成预设标题（去掉.json扩展名）
  const baseTitle = filename ? filename.replace(/\.json$/i, '') : null;
  
  data.presets.forEach((preset: any, index: number) => {
    const presetErrors: string[] = [];
    
    if (!preset.id || typeof preset.id !== 'string') {
      presetErrors.push(`预设${index + 1}: 缺少有效的ID`);
    }
    
    if (!preset.title || typeof preset.title !== 'string') {
      presetErrors.push(`预设${index + 1}: 缺少有效的标题`);
    }
    
    if (!preset.model || typeof preset.model !== 'string') {
      presetErrors.push(`预设${index + 1}: 缺少有效的模型`);
    }
    
    if (!preset.prompt || typeof preset.prompt !== 'string') {
      presetErrors.push(`预设${index + 1}: 缺少有效的提示词`);
    }
    
    if (!preset.size || typeof preset.size !== 'string') {
      presetErrors.push(`预设${index + 1}: 缺少有效的尺寸`);
    }
    
    if (presetErrors.length === 0) {
      // 确保ID唯一性
      preset.id = generateId();
      
      // 如果有文件名，优先使用文件名作为标题
      if (baseTitle) {
        preset.title = data.presets.length > 1 ? `${baseTitle}_${index + 1}` : baseTitle;
      }
      
      validPresets.push(preset);
    } else {
      errors.push(...presetErrors);
    }
  });
  
  if (validPresets.length === 0) {
    errors.push('没有找到有效的预设数据');
    return { isValid: false, errors };
  }
  
  return {
    isValid: true,
    errors: errors.length > 0 ? errors : [],
    presets: validPresets
  };
}

// 处理文件导入
export function importPresetsFromFile(file: File, filename?: string): Promise<{ isValid: boolean; errors: string[]; presets?: any[] }> {
  return new Promise((resolve) => {
    if (!file.type.includes('json')) {
      resolve({ isValid: false, errors: ['请选择JSON格式的文件'] });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const result = validateImportedPresets(data, filename || file.name);
        resolve(result);
      } catch (error) {
        resolve({ isValid: false, errors: ['文件格式错误，请确保是有效的JSON文件'] });
      }
    };
    
    reader.onerror = () => {
      resolve({ isValid: false, errors: ['文件读取失败'] });
    };
    
    reader.readAsText(file);
  });
}
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

// 压缩图片并转换为DataURL
export function compressImage(file: File, maxWidth: number = 1920, maxHeight: number = 1080, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        // 计算压缩后的尺寸
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // 绘制压缩后的图片
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为压缩后的DataURL
        const compressedDataUrl = canvas.toDataURL(file.type, quality);
        resolve(compressedDataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
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
      // gpt-image-1 统一通过后端强制 b64_json，但前端也传 b64_json 以对齐现有协议
      params = {
        size: normalizedSize,
        response_format: 'b64_json',
        // 由后端根据是否有 images 选择 generations 或 edits
        images: images || undefined,
        mask: mask || undefined,
        n: n || undefined,
        quality: quality || undefined,
        imageFormat: imageFormat || 'png',
      };
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
function isRetryableError(error: any): boolean {
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
function createFriendlyErrorMessage(error: any): string {
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
  
  if (error.message.includes('fetch')) {
    return '网络连接失败，请检查网络连接';
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
  const { maxRetries = 3, timeoutMs = 180000, onRetry } = options || {};
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  // 如果提供了API Key，添加到请求头
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  let lastError: ApiError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout('/api/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      }, timeoutMs);
      
      if (!response.ok) {
        let detail = '';
        try {
          detail = await response.text();
        } catch {
          // 忽略解析错误，使用默认错误信息
        }
        
        const error = new Error(`HTTP ${response.status}: ${response.statusText}${detail ? ` - ${detail}` : ''}`) as ApiError;
        error.status = response.status;
        error.isRetryable = isRetryableError(error);
        
        // 如果是最后一次尝试或错误不可重试，直接抛出
        if (attempt === maxRetries || !error.isRetryable) {
          error.message = createFriendlyErrorMessage(error);
          throw error;
        }
        
        lastError = error;
        
        // 通知重试回调
        if (onRetry) {
          onRetry(attempt + 1, error);
        }
        
        // 计算重试延迟（指数退避）
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response.json();
    } catch (error) {
      const apiError = error as ApiError;
      
      // 如果是最后一次尝试或错误不可重试，直接抛出
      if (attempt === maxRetries || !isRetryableError(apiError)) {
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
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // 如果所有重试都失败了
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
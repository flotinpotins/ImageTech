// 模型类型
export type ModelType = 
  | 'jimeng-t2i'
  | 'gpt-image-1'
  | 'nano-banana';

// 生成模式
export type GenerationMode = 'text-to-image' | 'image-to-image';

// 支持图生图的模型
export const IMAGE_EDIT_MODELS: ModelType[] = ['nano-banana', 'gpt-image-1'];

// 任务状态
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

// 尺寸选项
export type SizeOption = '1024x1024' | '1536x1024' | '1024x1536' | 'adaptive';

// 图像格式选项
export type ImageFormat = 'png' | 'jpg';

// 单次生成表单数据
export interface SingleGenerationForm {
  prompt: string;
  size: SizeOption;
  model: ModelType;
  mode: GenerationMode; // 生成模式：文生图或图生图
  imageFormat: ImageFormat; // 图像输出格式
  seed?: number;
  guidanceScale?: number;
  watermark?: boolean;
  images?: string[]; // dataURL数组
  mask?: string; // dataURL (PNG)
  n?: number; // 生成图片数量 1-10
  quality?: 'high' | 'medium' | 'low'; // 图片质量
  usePromptAsFilename?: boolean;
  imageNaming?: ImageNamingConfig;
}

// 批量生成任务项
export interface BatchTaskItem {
  id: string;
  lineNumber: number;
  content: string; // 原始行内容
  parsed: SingleGenerationForm | null; // 解析后的数据
  status: TaskStatus;
  error?: string;
  result?: TaskResult;
}

// 批量生成配置
export interface BatchConfig {
  concurrency: number; // 1-5
  maxRetries: number; // 0-3
  throttleMs: number; // 节流时间
}

// 任务结果
export interface TaskResult {
  id: string;
  status: TaskStatus;
  outputUrls?: string[];
  seed?: number;
  error?: string;
}

// API请求参数
export interface CreateTaskRequest {
  provider: string;
  model: ModelType;
  prompt: string;
  params: Record<string, any>;
}

// API响应
export interface CreateTaskResponse {
  id: string;
  seed?: number;
}

export interface GetTaskResponse {
  id: string;
  status: TaskStatus;
  outputUrls?: string[];
  seed?: number;
  error?: string;
}

// 预设相关
export interface Preset {
  id: string;
  title: string;
  model: ModelType;
  mode?: GenerationMode; // 生成模式，可选以兼容旧预设
  prompt: string;
  size: SizeOption;
  guidanceScale?: number;
  images?: string[];
  previewImage?: string; // 预览图URL
  createdAt: number;
  isOfficial?: boolean;
  prependPrompt?: string;
  appendPrompt?: string;
  // 批量生成特有的参数
  batchConfig?: BatchConfig; // 调度参数配置
  selectedScript?: string; // 选择的脚本
  usePromptAsFilename?: boolean; // 文件命名选项
  imageNaming?: ImageNamingConfig; // 图片命名格式配置
}

// 官方工作流
export interface OfficialWorkflow {
  id: string;
  title: string;
  category: '益智' | '小作家' | 'AI+';
  presets: OfficialPreset[];
}

export interface OfficialPreset {
  id: string;
  title: string;
  model: ModelType;
  prompt: string;
  size: SizeOption;
  guidanceScale?: number;
  watermark?: boolean;
  previewImage: string; // CDN占位图
}

// 历史记录
export interface HistoryItem {
  id: string;
  timestamp: number;
  model: ModelType;
  prompt: string;
  size: SizeOption;
  images?: string[];
  result?: TaskResult;
  status: TaskStatus;
  pinned?: boolean;
}


// 批量执行状态
export type BatchExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'terminated';

// 错误导出格式
export type ErrorExportFormat = 'txt' | 'json';

// 图片命名格式选项
export type ImageNamingOption = 'basic' | 'prepend' | 'append';

// 图片命名格式配置
export interface ImageNamingConfig {
  selectedOptions: ImageNamingOption[];
  enabled: boolean;
}

// 组件Props类型
export interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export interface ModelSelectorProps {
  value: ModelType;
  onChange: (model: ModelType) => void;
}

export interface SizeQuickSelectProps {
  onSizeSelect: (size: SizeOption) => void;
}


export interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  onDimensionsChange?: (dimensions: { width: number; height: number } | null) => void;
}

export interface HistoryGridProps {
  items: HistoryItem[];
  onItemClick: (item: HistoryItem) => void;
}

export interface PresetCardProps {
  preset: Preset | OfficialPreset;
  onApply: (preset: Preset | OfficialPreset) => void;
  onApplyAndGenerate?: (preset: Preset | OfficialPreset) => void;
  onDelete?: (preset: Preset) => void;
  isOfficial?: boolean;
}

// API Key 管理相关
export interface ApiKeyManagerProps {
  value: string;
  onChange: (apiKey: string) => void;
}

// 应用状态中的 API Key 配置
export interface ApiKeyConfig {
  globalApiKey: string;
  useGlobalApiKey: boolean;
}
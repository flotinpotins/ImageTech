import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ImageUpload } from './ImageUpload';
import { Loader2, Save, Square } from 'lucide-react';
import { 
  buildTaskRequest, 
  createTask, 
  pollTaskStatus, 
  validateForm, 
  delay,
  generateId,
  openImage,
  createFriendlyErrorMessage,
  isRetryableError
} from '@/lib/utils';
import { MASK_TEMPLATES, generateMaskForSize } from '@/lib/maskTemplates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


import { useToast } from '@/components/ui/use-toast';
import type { SingleGenerationForm, HistoryItem, Preset, ImageNamingOption } from '@/types';
import { IMAGE_EDIT_MODELS } from '@/types';

interface SingleGenerationProps {
  form: SingleGenerationForm;
  onFormChange: (form: SingleGenerationForm) => void;
  onAddHistory: (item: HistoryItem) => void;
  onUpdateHistory: (id: string, updates: Partial<HistoryItem>) => void;
  onSavePreset: (preset: Preset) => void;
  apiKey?: string;
  state: {
    isGenerating: boolean;
    progress: number;
    result: any;
    showSaveDialog: boolean;
    presetTitle: string;
    previewImage: string;
    prependPrompt: string;
    appendPrompt: string;
    useCustomNaming: boolean;
    selectedPromptTypes: string[];
  };
  onStateChange: (state: any) => void;
  onGenerationComplete?: () => void;
}

export function SingleGeneration({
  form,
  onFormChange,
  onAddHistory,
  onUpdateHistory,
  onSavePreset,
  apiKey,
  state,
  onStateChange,
  onGenerationComplete,
}: SingleGenerationProps) {
  const { isGenerating, progress, result, showSaveDialog, presetTitle, previewImage } = state;
  const { toast } = useToast();

  // 解析尺寸获取宽高比
  const getAspectRatioFromSize = (size: string): number => {
    if (size === 'adaptive' || !size) return 1; // 自适应或无效时返回1:1
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return 1;
    const [, w, h] = match;
    return parseInt(w) / parseInt(h);
  };

  const aspectRatio = getAspectRatioFromSize(form.size);

  const setState = (updates: any) => {
    onStateChange((prev: any) => ({ ...prev, ...updates }));
  };

  const updateForm = (updates: Partial<SingleGenerationForm>) => {
    onFormChange({ ...form, ...updates });
  };

  const handleGenerate = async () => {
    // 添加调试信息
    console.log('=== FRONTEND DEBUG ===');
    console.log('Form data:', JSON.stringify(form, null, 2));
    
    // 表单验证
    const errors = validateForm(form);
    console.log('Validation errors:', errors);
    
    if (errors.length > 0) {
      toast({
        title: '表单验证失败',
        description: errors.join('、'),
        variant: 'destructive',
      });
      return;
    }

    setState({ isGenerating: true, progress: 0, result: null });

    // 创建历史记录
    const historyId = generateId();
    const historyItem: HistoryItem = {
      id: historyId,
      timestamp: Date.now(),
      model: form.model,
      prompt: form.prompt,
      size: form.size,
      images: form.images,
      status: 'queued',
    };
    onAddHistory(historyItem);

    try {
      // 初始化进度
      setState({ progress: 0 });
      
      // 模拟最少2秒的加载时间
      const startTime = Date.now();
      
      // 构建请求
      const request = await buildTaskRequest(form);
      console.log('Built request keys:', Object.keys(request));
      if ((request as any).image) {
        console.log('Built request includes image, length:', ((request as any).image as string).length);
      }
      
      // 创建任务（带重试和进度反馈）
      const createResponse = await createTask(request, apiKey, {
        maxRetries: 2,
        timeoutMs: 300000,
        onRetry: (attempt, error) => {
          toast({
            title: `重试中 (${attempt}/3)`,
            description: `${error.message}，正在重试...`,
            variant: 'default',
          });
        }
      });
      
      // 更新历史记录状态
      onUpdateHistory(historyId, {
        status: 'running' as const,
      });
      
      // 轮询任务状态
      const taskResult = await pollTaskStatus(
        createResponse.id,
        () => {
          // 真实API的进度更新会被我们的模拟进度覆盖
        },
        60, // 保持默认最大尝试次数
        3000, // 增加轮询间隔到3000ms，与批量生成保持一致
        (progress) => {
          setState({ progress });
        }
      );
      
         
      // 确保最少2秒的加载时间
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await delay(2000 - elapsed);
      }
      
      // 最后冲刺到100%
      setState({ progress: 100 });
      await delay(300); // 让用户看到100%的状态
      
      setState({ result: taskResult });
      
      // 更新历史记录
      onUpdateHistory(historyId, {
        status: taskResult.status,
        result: taskResult,
      });
      
      if (taskResult.status === 'succeeded') {
        toast({
          title: '生成成功',
          description: '图片已生成完成',
        });
        
        // 生成完成后刷新余额
        onGenerationComplete?.();
      } else {
        toast({
          title: '生成失败',
          description: taskResult.error || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('生成失败:', error);
      
      // 使用统一的错误处理函数
      const errorDescription = createFriendlyErrorMessage(error);
      const shouldShowRetry = isRetryableError(error);
      
      toast({
        title: '生成失败',
        description: errorDescription,
        variant: 'destructive',
        action: shouldShowRetry ? (
          <button 
            onClick={() => handleGenerate()}
            className="px-3 py-1 bg-white text-red-600 rounded text-sm hover:bg-gray-50"
          >
            重试
          </button>
        ) : undefined,
      });
      
      // 更新历史记录为失败状态
      onUpdateHistory(historyId, {
        status: 'failed' as const,
        result: {
          id: '',
          status: 'failed' as const,
          error: errorDescription,
        },
      });
    } finally {
      setState({ isGenerating: false });
    }
  };

  const handleStop = () => {
    setState({ isGenerating: false, progress: 0, result: null });
    
    toast({
      title: '生成已停止',
      description: '图像生成已被用户停止',
    });
  };

  const [prependPrompt, setPrependPrompt] = useState('');
  const [appendPrompt, setAppendPrompt] = useState('');
  const [useCustomNaming, setUseCustomNaming] = useState(false);
  const [selectedPromptTypes, setSelectedPromptTypes] = useState<string[]>(['basic']); // 默认选中基本提示词

  const handleSavePreset = () => {
    if (!presetTitle.trim()) {
      toast({
        title: '请输入预设标题',
        variant: 'destructive',
      });
      return;
    }

    const preset: Preset = {
      id: generateId(),
      title: presetTitle.trim(),
      model: form.model,
      prompt: form.prompt,
      size: form.size,
      guidanceScale: form.guidanceScale,
      images: form.images,
      prependPrompt,
      appendPrompt,
      previewImage: previewImage || result?.outputUrls?.[0], // 优先使用自定义封面图片
      imageNaming: { 
        enabled: useCustomNaming, 
        selectedOptions: selectedPromptTypes as ImageNamingOption[]
      }, // 图片命名格式配置
      createdAt: Date.now(),
      isOfficial: false,
    };

    onSavePreset(preset);
    setState({ showSaveDialog: false, presetTitle: '' });
    
    toast({
      title: '保存成功',
      description: '预设已保存到「我的预设」',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* 左侧：参数区域 */}
      <div className="space-y-4 overflow-y-auto pr-4">
        <div>
          <label className="text-sm font-medium">模型</label>
          <p className="text-sm text-muted-foreground mb-2">
            当前模型: {form.model}
          </p>
        </div>

        {/* 模式切换 */}
        {IMAGE_EDIT_MODELS.includes(form.model) && (
          <div>
            <label className="text-sm font-medium">生成模式</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => updateForm({ mode: 'text-to-image', images: [] })}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  (form.mode || 'text-to-image') === 'text-to-image'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                文生图
              </button>
              <button
                type="button"
                onClick={() => updateForm({ mode: 'image-to-image' })}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  form.mode === 'image-to-image'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                图生图
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(form.mode || 'text-to-image') === 'text-to-image' ? '根据文字描述生成图片' : '基于上传的图片进行编辑和风格转换'}
            </p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">基础提示词</label>
          <Textarea
            placeholder="输入提示词描述您想要生成的内容..."
            value={form.prompt}
            onChange={(e) => updateForm({ prompt: e.target.value })}
            className="min-h-[100px]"
          />
        </div>

        {/* 提示词设置 */}
        <details className="border rounded-lg p-3 text-sm">
          <summary className="cursor-pointer font-medium text-sm mb-2 text-gray-500">附加提示词</summary>
          <div className="space-y-3 mt-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">前置提示词 (选填)</label>
              <Textarea
                placeholder="添加到每个提示词前面的内容，如画面风格，镜头角度等"
                value={prependPrompt}
                onChange={(e) => setPrependPrompt(e.target.value)}
                className="min-h-[50px] text-xs"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">后置提示词 (选填)</label>
              <Textarea
                placeholder="添加到每个提示词后面的内容，如画面效果，风格词等"
                value={appendPrompt}
                onChange={(e) => setAppendPrompt(e.target.value)}
                className="min-h-[50px] text-xs"
              />
            </div>
          </div>
        </details>

        <div>
          <label className="text-sm font-medium">尺寸</label>
          <select
            value={form.size}
            onChange={(e) => updateForm({ size: e.target.value as any })}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="1024x1024">1024x1024</option>
            <option value="1536x1024">1536x1024</option>
            <option value="1024x1536">1024x1536</option>
            <option value="adaptive">adaptive</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">输出格式</label>
          <select
            value={form.imageFormat}
            onChange={(e) => updateForm({ imageFormat: e.target.value as any })}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>

        </div>

        {/* nano-banana 图生图模式的图片上传 */}
        {form.model === 'nano-banana' && form.mode === 'image-to-image' && (
          <div>
            <label className="text-sm font-medium">上传图片 <span className="text-red-500">*</span></label>
            <div className="mt-2">
              <ImageUpload
                images={form.images || []}
                onChange={(images) => updateForm({ images })}
                maxImages={5}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">支持上传多张图片作为参考（最多5张）</p>
          </div>
        )}

        {/* 图片命名格式 */}
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="useCustomNaming"
                checked={useCustomNaming}
                onChange={(e) => setUseCustomNaming(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="useCustomNaming" className="text-sm text-gray-500">自定义图片保存名称</label>
            </div>
            
            {useCustomNaming && (
              <div className="ml-6 space-y-1">
                <p className="text-xs text-muted-foreground mb-2">加选提示词嵌入到图像保存的文件名</p>
                <div className="space-y-1">
                  {[
                    { value: 'basic', label: '基本提示词', required: true },
                    { value: 'prepend', label: '前置提示词', required: false },
                    { value: 'append', label: '后置提示词', required: false }
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`prompt-${option.value}`}
                        checked={selectedPromptTypes.includes(option.value)}
                        onChange={(e) => {
                          if (option.required) return; // 基本提示词不可取消
                          if (e.target.checked) {
                            setSelectedPromptTypes(prev => [...prev, option.value]);
                          } else {
                            setSelectedPromptTypes(prev => prev.filter(type => type !== option.value));
                          }
                        }}
                        disabled={option.required}
                        className={`rounded ${option.required ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <label htmlFor={`prompt-${option.value}`} className={`text-xs ${option.required ? 'text-muted-foreground' : ''}`}>
                        {option.label}{option.required ? ' (必选)' : ''}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* gpt-image-1 参数区 */}
        {form.model === 'gpt-image-1' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">输入图片（可选）</label>
              <div className="mt-2">
                <ImageUpload
                  images={form.images || []}
                  onChange={(images) => updateForm({ images })}
                  maxImages={4}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">提示：上传图片则自动走“图像编辑/修补”；不上传则为“文本生图”。</p>
            </div>

            {/* 蒙版功能 - 暂时隐藏 */}

            {false && (
              <div>
                <label className="text-sm font-medium">蒙版（mask，可选）</label>
                <div className="mt-2">
                  <Select
                    value={form.mask ? (MASK_TEMPLATES.find(t => t.dataUrl === form.mask)?.id || 'custom') : 'none'}
                    onValueChange={(value) => {
                      if (value === 'none') {
                        updateForm({ mask: undefined });
                        return;
                      }
                      // 根据当前尺寸生成相同比例的蒙版
                      const match = form.size.match(/^(\d+)x(\d+)$/);
                      const [w, h] = match ? [parseInt(match[1]), parseInt(match[2])] : [1024, 1024];
                      const dataUrl = generateMaskForSize(value, w, h);
                      updateForm({ mask: dataUrl });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择蒙版模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {MASK_TEMPLATES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.mask && (
                  <div className="mt-2">
                    <img src={form.mask} alt="蒙版预览" className="w-full h-32 object-contain border rounded" />
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => updateForm({ mask: undefined })}>移除蒙版</Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">要求：尺寸会根据当前选择的尺寸自动生成；透明区域为可编辑区域。</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">生成数量 n</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.n ?? 1}
                  onChange={(e) => updateForm({ n: Math.max(1, Math.min(10, Number(e.target.value))) })}
                />
                <p className="text-xs text-muted-foreground mt-1">范围 1-10，默认 1</p>
              </div>
              <div>
                <label className="text-sm font-medium">质量（quality）</label>
                <select
                  value={form.quality || 'medium'}
                  onChange={(e) => updateForm({ quality: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">仅 gpt-image-1 支持</p>
              </div>
            </div>
          </div>
        )}

        {form.model === 'jimeng-t2i' && (
          <div>
            <label className="text-sm font-medium">引导系数</label>
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={form.guidanceScale || 7.5}
              onChange={(e) => updateForm({ guidanceScale: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="text-sm text-muted-foreground text-center">
              {form.guidanceScale || 7.5}
            </div>
          </div>
        )}




        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              '生成'
            )}
          </Button>
          
          {isGenerating && (
            <Button
              variant="outline"
              onClick={handleStop}
            >
              <Square className="h-4 w-4 mr-2" />
              停止
            </Button>
          )}
          
          <Dialog open={showSaveDialog} onOpenChange={(open) => setState({ showSaveDialog: open })}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Save className="h-4 w-4 mr-2" />
                保存为预设
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>保存为预设</DialogTitle>
                <DialogDescription>
                  将当前配置保存为预设，方便下次使用。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">预设标题</label>
                  <Input
                    placeholder="请输入预设标题"
                    value={presetTitle}
                    onChange={(e) => setState({ presetTitle: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">封面预览图</label>
                  <div className="mt-1 space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setState({ previewImage: event.target?.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="text-sm"
                    />
                    {previewImage && (
                      <div className="relative">
                        <img
                          src={previewImage}
                          alt="预览图"
                          className="w-full h-32 object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => setState({ previewImage: '' })}
                        >
                          移除
                        </Button>
                      </div>
                    )}
                    {!previewImage && result?.outputUrls?.[0] && (
                      <div className="text-sm text-muted-foreground">
                        如不上传自定义封面，将使用生成的第一张图片作为预览图
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setState({ showSaveDialog: false })}
                >
                  取消
                </Button>
                <Button onClick={handleSavePreset}>
                  保存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 右侧：生成结果区域 */}
      <div className="space-y-4 overflow-y-auto pl-4 border-l">
        {/* 生成进度条 */}
        {isGenerating && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-gray-700">生成进度</span>
              <span className="text-base text-gray-500 font-semibold">{progress}%</span>
            </div>
            <div className="relative">
              <Progress value={progress} className="h-3" />
              {/* 进度条上的小装饰 */}
              <div 
                className="absolute top-0 h-2 w-2 bg-white rounded-full shadow-sm transition-all duration-300 ease-out"
                style={{left: `calc(${progress}% - 4px)`}}
              >
                <div className="w-full h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        )}

        {/* 生成结果 */}
        {result && (
          <div className="space-y-4">
            {result.status === 'succeeded' && result.outputUrls && result.outputUrls.length > 0 ? (
              <>
                <div>
                  <h3 className="text-xl font-medium mb-4">生成结果</h3>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {result.outputUrls.map((url: string, index: number) => (
                    <div key={index} className="space-y-2">
                      <div 
                        className="relative rounded-lg border shadow-lg overflow-hidden bg-muted"
                        style={{ 
                          aspectRatio: aspectRatio.toString(),
                          maxWidth: '100%'
                        }}
                      >
                        <img
                          src={url}
                          alt={`生成结果 ${index + 1}`}
                          className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => openImage(url, {
                            prompt: form.prompt,
                            usePromptAsFilename: state.useCustomNaming,
                            imageNaming: {
                              enabled: state.useCustomNaming,
                              selectedOptions: state.selectedPromptTypes
                            },
                            prependPrompt: state.prependPrompt,
                            appendPrompt: state.appendPrompt,
                            imageFormat: form.imageFormat,
                            imageList: result.outputUrls,
                            currentIndex: index
                          })}
                          onError={(e) => {
                            console.error('图片加载失败:', url);
                            (e.target as HTMLImageElement).src = '/placeholder-ai.svg';
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-base text-muted-foreground">
                          图片 {index + 1} (比例: {form.size})
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : result.status === 'failed' ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="text-lg font-medium text-red-800 mb-2">生成失败</h3>
                <p className="text-sm text-red-600">{result.error || '未知错误'}</p>
              </div>
            ) : result.status === 'succeeded' && (!result.outputUrls || result.outputUrls.length === 0) ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="text-lg font-medium text-yellow-800 mb-2">生成完成</h3>
                <p className="text-sm text-yellow-600">生成成功，但未返回图片URL</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
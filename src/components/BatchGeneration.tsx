import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ImageUpload } from './ImageUpload';
import { SizeQuickSelect } from './SizeQuickSelect';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MASK_TEMPLATES, generateMaskForSize } from '@/lib/maskTemplates';
import JSZip from 'jszip';

import { Play, Pause, Square, Download, Upload, RotateCcw, ChevronDown } from 'lucide-react';

// @ts-ignore

import { 
  parseBatchInput, 
  buildTaskRequest, 
  createTask, 
  pollTaskStatus, 
  retryWithBackoff, 
  delay, 
  exportErrors,
  validateForm,
  openImage
} from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { 
  BatchTaskItem, 
  SingleGenerationForm,
  ErrorExportFormat,
  Preset,
  HistoryItem,
  ModelType,
  SizeOption,
  ImageFormat,
  ImageNamingOption 
} from '@/types';

interface BatchGenerationProps {
  defaultForm: SingleGenerationForm;
  onSavePreset: (preset: Preset) => void;
  onAddHistory: (item: HistoryItem) => void;
  onUpdateHistory: (id: string, updates: Partial<HistoryItem>) => void;
  apiKey?: string;
  state: {
    inputText: string;
    tasks: any[];
    config: any;
    status: any;
    progress: { completed: number; total: number };
    prependPrompt: string;
    appendPrompt: string;
    batchImages: string[];
    showSaveDialog: boolean;
    presetTitle: string;
    selectedScript: string;
    usePromptAsFilename: boolean;
    size: string;
    previewImage: string;
    mask?: string;
    n?: number;
    quality?: 'high' | 'medium' | 'low';
    selectedMasks?: string[];
    model: string;
    imageFormat?: ImageFormat;
    imageNaming?: {
      enabled: boolean;
      selectedOptions: string[];
    };
  };
  onStateChange: (state: any) => void;
  onGenerationComplete?: () => void;
}

export function BatchGeneration({ defaultForm, onSavePreset, onAddHistory, onUpdateHistory, apiKey, state, onStateChange, onGenerationComplete }: BatchGenerationProps) {
  const { 
    inputText, 
    tasks, 
    config, 
    status, 
    progress, 
    prependPrompt, 
    appendPrompt, 
    batchImages, 
    showSaveDialog, 
    presetTitle, 
    selectedScript,
    usePromptAsFilename,
    size,
    previewImage 
  } = state;
  
  // 保障：即使 progress 暂时未定义，也不会导致渲染报错
  const safeProgress = progress ?? { completed: 0, total: 0 };
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // 使用函数式更新，避免异步竞态覆盖
  const setState = (updatesOrUpdater: any) => {
    if (typeof updatesOrUpdater === 'function') {
      (onStateChange as any)((prev: any) => ({ ...prev, ...updatesOrUpdater(prev) }));
    } else {
      (onStateChange as any)((prev: any) => ({ ...prev, ...updatesOrUpdater }));
    }
  };

  // 动态脚本清单（默认内置三项，若加载失败则回退到此列表）
  const [scriptsList, setScriptsList] = useState<{ value: string; label: string; file: string }[]>([
    { value: 'remove-brackets', label: '去除大括号 {}', file: '/scripts/remove-brackets.js' },
    { value: 'remove-roman-numerals', label: '去除阿拉伯数字', file: '/scripts/remove-roman-numerals.js' },
    { value: 'remove-before-colon', label: '去除冒号前内容', file: '/scripts/remove-before-colon.js' },
  ]);
  
  // 控制执行的引用
  const executionRef = useRef<{
    shouldStop: boolean;
    isPaused: boolean;
  }>({ shouldStop: false, isPaused: false });

  // 监听 defaultForm 变化，同步到本地状态
  useEffect(() => {
    setState({
      inputText: ((defaultForm as any).prompt as string) || '',
      prependPrompt: ((defaultForm as any).prependPrompt as string) || '',
      appendPrompt: ((defaultForm as any).appendPrompt as string) || '',
      batchImages: (defaultForm.images as string[]) || [],
      model: defaultForm.model
    });
  }, [defaultForm]);

  // 调度参数由Sidebar统一管理，不再使用旧的速率档位

  // 加载 public/scripts/scripts.json 中的脚本列表
  useEffect(() => {
    const loadScripts = async () => {
      try {
        const resp = await fetch('/scripts/scripts.json', { cache: 'no-store' });
        if (!resp.ok) return; // 使用默认回退
        const list = await resp.json();
        if (Array.isArray(list) && list.every((i) => i.value && i.label && i.file)) {
          setScriptsList(list);
        }
      } catch {
        // 忽略错误，使用默认回退列表
      }
    };
    loadScripts();
  }, []);
  
  const updateTask = (taskId: string, updates: Partial<BatchTaskItem>) => {
    console.log('Updating task', taskId, 'with updates:', updates);
    setState((prev: any) => ({
      tasks: prev.tasks.map((task: any) =>
        task.id === taskId ? { ...task, ...updates } : task
      ),
    }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setState({ inputText: content });
    };
    reader.readAsText(file);
  };

  const handleApplyScript = async () => {
    if (!selectedScript) {
      toast({
        title: '未选择脚本',
        description: '请先从下拉菜单选择一个脚本',
        variant: 'destructive',
      });
      return;
    }

    try {
      const item = scriptsList.find(s => s.value === selectedScript);
      if (!item) throw new Error('找不到所选脚本');
      // 从 public 目录加载脚本内容
      const resp = await fetch(item.file);
      const scriptText = await resp.text();
      const processFunction = new Function('text', scriptText);
      const processedText = processFunction(inputText);
      
      // 同时更新输入文本和任务
      const updates: any = { inputText: processedText };
      
      // 如果已有解析的任务，同步更新所有任务的prompt
      if (tasks.length > 0) {
        const updatedTasks = tasks.map(task => {
          if (task.parsed) {
            return {
              ...task,
              parsed: {
                ...task.parsed,
                prompt: processFunction(task.parsed.prompt || '')
              }
            };
          }
          return task;
        });
        updates.tasks = updatedTasks;
      }
      
      // 一次性更新所有状态
      setState(updates);
      
      toast({
        title: '脚本已应用',
        description: `已应用脚本：${item.label}`,
      });
    } catch (error) {
      toast({
        title: '脚本执行失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };





  const handleParse = () => {
    if (!inputText.trim()) {
      toast({
        title: '请输入内容',
        description: '请输入要批量处理的文本内容',
        variant: 'destructive',
      });
      return;
    }

    let parsedTasks = parseBatchInput(inputText, state.model || defaultForm.model);
    
    // 应用prepend和append提示词
    if (prependPrompt || appendPrompt) {
      parsedTasks = parsedTasks.map(task => ({
        ...task,
        parsed: task.parsed ? {
          ...task.parsed,
          prompt: `${prependPrompt}${task.parsed.prompt || ''}${appendPrompt}`.trim()
        } : task.parsed
      }));
    }

    setState({ 
      tasks: parsedTasks, 
      progress: { completed: 0, total: parsedTasks.length } 
    });
    
    toast({
      title: '解析完成',
      description: `共解析出 ${parsedTasks.length} 个任务`,
    });
  };

  const executeTask = async (task: BatchTaskItem, taskIndex: number): Promise<void> => {
    if (!task.parsed) {
      updateTask(task.id, { 
        status: 'failed', 
        error: '解析失败：无效的任务数据' 
      });
      return;
    }

    // 为图生图/编辑模型分配图片
    let taskImages = task.parsed.images || [];
    // 优先使用state.model，确保使用用户当前选择的模型
    const currentModel = state.model || defaultForm.model;
    const isImageBasedModel = (
      task.parsed.model === 'doubao-seededit-3-0-i2i-250628' ||
      currentModel === 'gpt-image-1'
    );

    if (isImageBasedModel && batchImages.length > 0) {
      // 如果有批量上传的图片，优先使用批量图片（按任务索引轮流分配）
      const imageIndex = taskIndex % batchImages.length;
      // gpt-image-1 支持最多 4 张，但批量场景为“一张参考图/任务”更直观，这里沿用单张策略
      taskImages = [batchImages[imageIndex]];
    } else if (isImageBasedModel && defaultForm.images && defaultForm.images.length > 0) {
      // 回退到默认图片
      taskImages = defaultForm.images || [];
    }

    // 合并默认表单和任务特定数据
    const taskForm: SingleGenerationForm = {
      ...defaultForm,
      ...task.parsed,
      model: currentModel as ModelType, // 强制使用当前选择的模型，而不是解析时的模型
      images: taskImages,
      size: (size || defaultForm.size) as SizeOption, // 使用当前选择的尺寸
      imageFormat: (state.imageFormat || 'png') as ImageFormat, // 使用当前选择的图像格式
      // gpt-image-1 专用参数
      ...(currentModel === 'gpt-image-1' && {
         mask: state.mask || task.parsed.mask,
         n: state.n || task.parsed.n || 1,
         quality: state.quality || task.parsed.quality || 'medium',
       })
     };

    // 验证表单
    const errors = validateForm(taskForm);
    if (errors.length > 0) {
      updateTask(task.id, { 
        status: 'failed', 
        error: `验证失败: ${errors.join(', ')}` 
      });
      return;
    }

    // 创建历史记录
    const historyId = `batch_${Date.now()}_${taskIndex}`;
    const historyItem: HistoryItem = {
      id: historyId,
      timestamp: Date.now(),
      model: taskForm.model,
      prompt: taskForm.prompt,
      size: taskForm.size,
      images: taskForm.images,
      status: 'queued',
    };
    onAddHistory(historyItem);

    try {
      updateTask(task.id, { status: 'running' });
      onUpdateHistory(historyId, { status: 'running' });
      
      const request = await buildTaskRequest(taskForm);
      const createResponse = await createTask(request, apiKey);
      
      const result = await pollTaskStatus(
        createResponse.id,
        (intermediateResult) => {
          // 实时更新任务状态和结果
          console.log('Poll update for task', task.id, ':', intermediateResult);
          updateTask(task.id, { 
            status: intermediateResult.status, 
            result: intermediateResult,
            error: intermediateResult.error 
          });
        },
        30, // 减少轮询次数
        3000 // 增加轮询间隔
      );
      
      console.log('Final result for task', task.id, ':', result);
      
      updateTask(task.id, { 
        status: result.status, 
        result,
        error: result.error 
      });
      
      // 更新历史记录
      onUpdateHistory(historyId, {
        status: result.status,
        result: result,
      });
    } catch (error) {
      updateTask(task.id, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : '未知错误' 
      });
      onUpdateHistory(historyId, {
        status: 'failed',
        result: {
          id: '',
          status: 'failed',
          error: error instanceof Error ? error.message : '未知错误',
        },
      });
    }
  };

  // 通用的生成执行函数
  const executeGeneration = async (concurrency: number) => {
    if (tasks.length === 0) {
      toast({
        title: '没有任务',
        description: '请先解析输入内容',
        variant: 'destructive',
      });
      return;
    }

    // 重置所有任务状态为queued
    const resetTasks = tasks.map(task => ({
      ...task,
      status: 'queued' as const,
      result: undefined,
      error: undefined
    }));
    setState({ 
      tasks: resetTasks,
      progress: { completed: 0, total: resetTasks.length }
    });
    
    setState({ status: 'running' });
    executionRef.current = { shouldStop: false, isPaused: false };
    
    const pendingTasks = resetTasks.filter(task => task.status === 'queued');
    let completedCount = 0;
    
    // 并发执行任务
    const executeWithConcurrency = async () => {
        const executing = new Set<Promise<void>>();
        
        for (let i = 0; i < pendingTasks.length; i++) {
          const task = pendingTasks[i];
          const taskIndex = tasks.findIndex(t => t.id === task.id);
          
          // 检查是否需要停止或暂停
          while (executionRef.current.isPaused && !executionRef.current.shouldStop) {
            await delay(100);
          }
          
          if (executionRef.current.shouldStop) {
            break;
          }
          
          // 等待并发数限制
          while (executing.size >= concurrency) {
            await Promise.race(executing);
          }
          
          // 节流
          if (config.throttleMs > 0) {
            await delay(config.throttleMs);
          }
          
          // 执行任务（带重试）
          const taskPromise = retryWithBackoff(
            () => executeTask(task, taskIndex),
            config.maxRetries
          ).finally(() => {
            executing.delete(taskPromise);
            completedCount++;
            setState({ progress: { completed: completedCount, total: pendingTasks.length } });
          });
          
          executing.add(taskPromise);
        }
      
      // 等待所有任务完成
      await Promise.all(executing);
    };
    
    try {
      await executeWithConcurrency();
      
      if (executionRef.current.shouldStop) {
        setState({ status: 'terminated' });
        toast({
          title: '执行已终止',
          description: '批量生成已被用户终止',
        });
      } else {
        setState({ status: 'completed' });
        const failedCount = tasks.filter(task => task.status === 'failed').length;
        toast({
          title: '执行完成',
          description: `批量生成完成，${failedCount > 0 ? `${failedCount} 个任务失败` : '全部成功'}`,
        });
        
        // 批量生成完成后刷新余额
        onGenerationComplete?.();
      }
    } catch (error) {
      setState({ status: 'idle' });
      toast({
        title: '执行失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  // 三种模式的处理函数
  const handleConservativeMode = () => executeGeneration(1);
  const handleStandardMode = () => executeGeneration(2);
  const handleFullSpeedMode = () => executeGeneration(5);

  // 保留原有的handleStart函数用于重新开始功能
  const handleStart = () => executeGeneration(config.concurrency);

  const handlePause = () => {
    executionRef.current.isPaused = true;
    setState({ status: 'paused' });
  };

  const handleResume = () => {
    executionRef.current.isPaused = false;
    setState({ status: 'running' });
  };

  const handleStop = () => {
    executionRef.current.shouldStop = true;
    setState({ status: 'idle' });
  };

  const handleBatchDownload = async () => {
    const successfulTasks = tasks.filter(task => 
      task.status === 'succeeded' && 
      task.result?.outputUrls && 
      task.result.outputUrls.length > 0
    );
    
    if (successfulTasks.length === 0) {
      toast({
        title: '没有可下载的图片',
        description: '当前没有成功生成的图片',
      });
      return;
    }
    
    const totalImages = successfulTasks.reduce((sum, task) => 
      sum + (task.result?.outputUrls?.length || 0), 0
    );
    
    toast({
      title: '开始批量下载',
      description: `正在打包 ${totalImages} 张图片...`,
    });
    
    try {
      const zip = new JSZip();
      let downloadCount = 0;
      
      // 添加所有图片到zip文件
      // 用于跟踪已使用的文件名，避免重复
      const usedFilenames = new Set<string>();
      
      for (const task of successfulTasks) {
        if (task.result?.outputUrls) {
          for (let i = 0; i < task.result.outputUrls.length; i++) {
            const url = task.result.outputUrls[i];
            try {
              // 生成基础文件名（不带数字后缀）
              let baseFilename = '';
              const extension = state.imageFormat || 'png';
              
              if (state.imageNaming?.enabled && state.imageNaming.selectedOptions.length > 0) {
                // 使用自定义命名格式
                const nameParts: string[] = [];
                
                // task.parsed.prompt 已经包含了前置和后置提示词，所以只需要使用它
                // 按照正确顺序添加：前置提示词、基本提示词、后置提示词
                if (state.imageNaming.selectedOptions.includes('prepend') && prependPrompt) {
                  nameParts.push(prependPrompt);
                }
                if (state.imageNaming.selectedOptions.includes('basic') && task.parsed?.prompt) {
                  // 从 task.parsed.prompt 中提取原始提示词（去除前置和后置提示词）
                  let originalPrompt = task.parsed.prompt;
                  if (prependPrompt && originalPrompt.startsWith(prependPrompt)) {
                    originalPrompt = originalPrompt.substring(prependPrompt.length);
                  }
                  if (appendPrompt && originalPrompt.endsWith(appendPrompt)) {
                    originalPrompt = originalPrompt.substring(0, originalPrompt.length - appendPrompt.length);
                  }
                  nameParts.push(originalPrompt.trim());
                }
                if (state.imageNaming.selectedOptions.includes('append') && appendPrompt) {
                  nameParts.push(appendPrompt);
                }
                
                if (nameParts.length > 0) {
                  baseFilename = nameParts.join(' ')
                    .replace(/[<>:"/\\|?*]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 100); // 限制长度
                } else {
                  baseFilename = `batch ${task.lineNumber}`;
                }
              } else if (state.usePromptAsFilename && task.parsed?.prompt) {
                // 使用提示词作为文件名，清理特殊字符
                baseFilename = task.parsed.prompt
                  .replace(/[<>:"/\\|?*]/g, '_')
                  .substring(0, 100); // 限制长度
              } else {
                baseFilename = `batch_${task.lineNumber}`;
              }
              
              // 智能处理文件名重复：只有当文件名真正重复时才添加数字后缀
              let filename = `${baseFilename}.${extension}`;
              let counter = 1;
              
              while (usedFilenames.has(filename)) {
                filename = `${baseFilename} ${counter}.${extension}`;
                counter++;
              }
              
              // 记录已使用的文件名
              usedFilenames.add(filename);
              
              // 获取图片数据
              const response = await fetch(url);
              const blob = await response.blob();
              
              // 添加到zip文件
              zip.file(filename, blob);
              downloadCount++;
              
            } catch (error) {
              console.error('处理图片失败:', error);
            }
          }
        }
      }
      
      // 生成zip文件并下载
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({
        title: '批量下载完成',
        description: `成功打包下载 ${downloadCount} 张图片`,
      });
      
    } catch (error) {
      console.error('批量下载失败:', error);
      toast({
        title: '批量下载失败',
        description: '打包过程中出现错误，请重试',
        variant: 'destructive',
      });
    }
  };

  const handleExportErrors = (format: ErrorExportFormat) => {
    const failedTasks = tasks.filter(task => task.status === 'failed');
    if (failedTasks.length === 0) {
      toast({
        title: '没有错误',
        description: '当前没有失败的任务',
      });
      return;
    }
    
    exportErrors(failedTasks, format);
    toast({
      title: '导出成功',
      description: `已导出 ${failedTasks.length} 个错误任务`,
    });
  };

  const generateId = () => `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleSaveAsPreset = () => {
    if (!presetTitle.trim()) {
      toast({
        title: '请输入预设名称',
        description: '请为预设输入一个名称',
        variant: 'destructive',
      });
      return;
    }

    const preset: Preset = {
      id: generateId(),
      title: presetTitle,
      model: (state.model || defaultForm.model) as ModelType,
      prompt: inputText.trim() || defaultForm.prompt, // 保存原始输入的提示词内容
      size: (size || defaultForm.size) as SizeOption, // 使用当前选择的尺寸
      guidanceScale: defaultForm.guidanceScale,
      images: batchImages.length > 0 ? batchImages : defaultForm.images,
      previewImage, // 保存自定义封面图片
      prependPrompt,
      appendPrompt,
      // 保存批量生成特有的参数
      batchConfig: config, // 调度参数配置
      selectedScript, // 选择的脚本
      usePromptAsFilename, // 文件命名选项
      imageNaming: state.imageNaming ? {
        enabled: state.imageNaming.enabled,
        selectedOptions: state.imageNaming.selectedOptions as ImageNamingOption[]
      } : undefined, // 图片命名格式配置
      // gpt-image-1参数
      ...((state.model || defaultForm.model) === 'gpt-image-1' && {
        mask: state.mask || defaultForm.mask,
        n: state.n || defaultForm.n || 1,
        quality: state.quality || defaultForm.quality || 'medium',
      }),
      isOfficial: false,
      createdAt: Date.now(),
    };

    onSavePreset(preset);
    setState({ showSaveDialog: false, presetTitle: '' });
    
    toast({
      title: '预设已保存',
      description: `已保存预设：${presetTitle}`,
    });
  };

  return (
    <div className="h-full flex flex-col">
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* 左侧：参数设置 */}
        <div className="space-y-4 overflow-y-auto pr-4">
        {/* 批量输入区域 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">基础提示词</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                上传文件
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.jsonl"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>
          
          <Textarea
            placeholder="1. TXT格式：每行一个提示词&#10;2. 手动书写或者粘贴提示词"
            value={inputText}
            onChange={(e) => setState({ inputText: e.target.value })}
            className="min-h-[120px] font-mono text-sm"
          />
          
          {/* 提示词嵌入图像命名 - 默认开启，UI已隐藏 */}
        </div>

        {/* 提示词设置 - 移动到输入框下方，缩小尺寸 */}
        <details className="border rounded-lg p-3 text-sm group">
          <summary className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors list-none">
            <h3 className="text-base font-medium text-gray-500">附加提示词</h3>
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          </summary>
          
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">前置提示词 (选填)</label>
              <Textarea
                placeholder="添加到每个提示词前面的内容，如数量词。"
                value={prependPrompt}
                onChange={(e) => setState({ prependPrompt: e.target.value })}
                className="min-h-[50px] text-xs"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">后置提示词 (选填)</label>
              <Textarea
                placeholder="添加到每个提示词后面的内容，如画面效果，风格词等"
                value={appendPrompt}
                onChange={(e) => setState({ appendPrompt: e.target.value })}
                className="min-h-[50px] text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">提示词格式脚本</label>
              <div className="flex gap-2">
                <Select value={selectedScript} onValueChange={(value) => setState({ selectedScript: value })}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="选择提示词格式脚本" />
                  </SelectTrigger>
                  <SelectContent>
                    {scriptsList.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyScript}
                  disabled={!selectedScript || !inputText}
                  className="h-8 px-2 text-xs"
                >
                  应用
                </Button>
              </div>
            </div>

            {/* gpt-image-1 参数（批量） */}
            {state.model === 'gpt-image-1' && (
              <div className="space-y-3">
                {/* 蒙版选择器 */}
                <div>
                  <label className="text-xs font-medium">蒙版（mask，可选）</label>
                  <div className="mt-1">
                    <Select
                      value={state.mask ? (MASK_TEMPLATES.find(t => t.dataUrl === state.mask)?.id || 'custom') : 'none'}
                      onValueChange={(value) => {
                        if (value === 'none') {
                          setState({ mask: undefined });
                          return;
                        }
                        // 根据当前尺寸生成相同比例的蒙版
                        const match = (state.size || '1024x1024').match(/^(\d+)x(\d+)$/);
                        const [w, h] = match ? [parseInt(match[1]), parseInt(match[2])] : [1024, 1024];
                        const dataUrl = generateMaskForSize(value, w, h);
                        setState({ mask: dataUrl });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择蒙版模板" />
                      </SelectTrigger>
                      <SelectContent>
                        {MASK_TEMPLATES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {state.mask && (
                    <div className="mt-1">
                      <img src={state.mask} alt="蒙版预览" className="w-full h-24 object-contain border rounded" />
                      <Button variant="outline" size="sm" className="mt-1 h-6 px-2 text-xs" onClick={() => setState({ mask: undefined })}>移除蒙版</Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">要求：尺寸会根据当前选择的尺寸自动生成；透明区域为可编辑区域。</p>
                </div>
                
                {/* 生成数量 n 与 质量 quality */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium">生成数量 n</label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={state.n ?? 1}
                      onChange={(e) => setState({ n: Math.max(1, Math.min(10, Number(e.target.value))) })}
                      className="h-8 text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">范围 1-10，默认 1</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium">质量（quality）</label>
                    <select
                      value={state.quality || 'medium'}
                      onChange={(e) => setState({ quality: e.target.value })}
                      className="w-full px-2 py-1 border rounded-md h-8 text-xs"
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
          </div>
        </details>

        {/* 生成尺寸选择 */}
        <div className="space-y-4">
          <SizeQuickSelect
            selectedSize={size as any}
            onSizeSelect={(selectedSize) => setState({ size: selectedSize })}
          />
        </div>

        {/* 图像格式选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">输出格式</label>
          <select
            value={state.imageFormat || 'png'}
            onChange={(e) => setState({ imageFormat: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>

        </div>

        {/* 图片命名格式 */}
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="naming-enabled"
                checked={state.imageNaming?.enabled || false}
                onChange={(e) => setState({
                  imageNaming: {
                    ...state.imageNaming,
                    enabled: e.target.checked,
                    selectedOptions: state.imageNaming?.selectedOptions || []
                  }
                })}
                className="rounded"
              />
              <label htmlFor="naming-enabled" className="text-sm text-gray-500">自定义图片保存名称</label>
            </div>
            
            {state.imageNaming?.enabled && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">选择用于命名的提示词类型（可多选）：</p>
                <div className="space-y-1">
                  {[
                    { value: 'basic', label: '基本提示词', required: true },
                    { value: 'prepend', label: '前置提示词', required: false },
                    { value: 'append', label: '后置提示词', required: false }
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`naming-${option.value}`}
                        checked={state.imageNaming?.selectedOptions?.includes(option.value as any) || false}
                        onChange={(e) => {
                          if (option.required) return; // 基本提示词不可取消
                          const currentOptions = state.imageNaming?.selectedOptions || [];
                          const newOptions = e.target.checked
                            ? [...currentOptions, option.value as any]
                            : currentOptions.filter(opt => opt !== option.value);
                          setState({
                            imageNaming: {
                              ...state.imageNaming,
                              enabled: state.imageNaming?.enabled || false,
                              selectedOptions: newOptions
                            }
                          });
                        }}
                        disabled={option.required}
                        className={`rounded ${option.required ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <label htmlFor={`naming-${option.value}`} className={`text-sm ${option.required ? 'text-muted-foreground' : ''}`}>
                        {option.label}{option.required ? ' (必选)' : ''}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  文件名将根据选择的选项组合生成，格式：选中的提示词内容_序号.格式
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 参考图片区域 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">参考图片</h3>
          <ImageUpload
            images={batchImages}
            onChange={(images) => setState({ batchImages: images })}
            maxImages={20}
            onDimensionsChange={(dims) => {
              if (!dims) return;
              if (state.model === 'gpt-image-1') {
                // 根据宽高自适应选择最接近的尺寸
                const { width, height } = dims;
                let target: '1024x1024' | '1536x1024' | '1024x1536' = '1024x1024';
                if (width > height) target = '1536x1024';
                else if (height > width) target = '1024x1536';
                setState({ size: target });
              }
            }}
          />
        </div>




        
        <div className="flex items-center gap-2">
          <Button onClick={handleParse} disabled={!inputText.trim()} className="flex-1">
            解析输入
          </Button>
        </div>

        {/* 生成模式选择 - 仅在解析完成且状态为idle时显示 */}
        {tasks.length > 0 && status === 'idle' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-lg font-medium">选择生成模式</h3>
              <div className="grid grid-cols-1 gap-3">
                <Button 
                  onClick={handleConservativeMode}
                  className="h-12 text-left justify-start"
                  variant="outline"
                >
                  <Play className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">保守模式：并发数1</div>
                    <div className="text-xs text-muted-foreground">稳定生成，适合高质量要求</div>
                  </div>
                </Button>
                <Button 
                  onClick={handleStandardMode}
                  className="h-12 text-left justify-start"
                  variant="outline"
                >
                  <Play className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">标准模式：并发数2</div>
                    <div className="text-xs text-muted-foreground">平衡速度与稳定性</div>
                  </div>
                </Button>
                <Button 
                  onClick={handleFullSpeedMode}
                  className="h-12 text-left justify-start"
                  variant="outline"
                >
                  <Play className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">全速模式：并发数5</div>
                    <div className="text-xs text-muted-foreground">最快速度，适合批量处理</div>
                  </div>
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setState({
                      tasks: [],
                      status: 'idle',
                      progress: { completed: 0, total: 0 },
                    });
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  重置
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* 执行控制 - 仅在运行、暂停、完成状态时显示 */}
        {tasks.length > 0 && status !== 'idle' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">执行控制</h3>
              <div className="flex gap-2">
                {status === 'running' && (
                  <>
                    <Button variant="outline" onClick={handlePause}>
                      <Pause className="h-4 w-4 mr-2" />
                      暂停
                    </Button>
                    <Button variant="destructive" onClick={handleStop}>
                      <Square className="h-4 w-4 mr-2" />
                      终止
                    </Button>
                  </>
                )}
                {status === 'paused' && (
                  <>
                    <Button onClick={handleResume}>
                      <Play className="h-4 w-4 mr-2" />
                      继续
                    </Button>
                    <Button variant="destructive" onClick={handleStop}>
                      <Square className="h-4 w-4 mr-2" />
                      终止
                    </Button>
                  </>
                )}
                {(status === 'completed' || status === 'stopped') && (
                  <>
                    <Button onClick={handleStart}>
                      <Play className="h-4 w-4 mr-2" />
                      重新开始
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setState({
                          tasks: [],
                          status: 'idle',
                          progress: { completed: 0, total: 0 },
                        });
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      重置
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 保存预设按钮 */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setState({ showSaveDialog: true })}
          >
            保存为工作流预设
          </Button>
        </div>
      </div>

      {/* 右侧：预览区域 */}
      <div className="space-y-4 overflow-y-auto pl-4 border-l">
        <h3 className="text-lg font-medium">图片预览</h3>
        
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center bg-muted/30 rounded-lg border-2 border-dashed">
            <div className="text-muted-foreground mb-2">暂无任务</div>
            <div className="text-sm text-muted-foreground">解析输入后开始批量生成任务</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 批量操作按钮 */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchDownload}
                disabled={!tasks.some(task => task.status === 'succeeded' && task.result?.outputUrls?.length > 0)}
              >
                <Download className="h-4 w-4 mr-2" />
                批量下载
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportErrors('txt')}
                disabled={!tasks.some(task => task.status === 'failed')}
              >
                <Download className="h-4 w-4 mr-2" />
                导出错误
              </Button>
            </div>

            {/* 任务预览网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border rounded-lg p-3 space-y-3 hover:shadow-md transition-shadow"
                >
                  {/* 图片预览区域 - 优先显示 */}
                  {task.result?.outputUrls && task.result.outputUrls.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        {task.result.outputUrls.map((url: string, index: number) => (
                          <div key={index} className="relative group">
                            <img
                              src={url}
                              alt={`Generated image ${index + 1}`}
                              className="w-full h-auto rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => openImage(url, {
                                prompt: task.parsed?.prompt,
                                usePromptAsFilename: state.usePromptAsFilename,
                                imageNaming: state.imageNaming,
                                prependPrompt,
                                appendPrompt,
                                imageFormat: state.imageFormat,
                                taskIndex: task.lineNumber,
                                imageList: task.result.outputUrls,
                                currentIndex: index
                              })}
                            />
                            {/* 悬浮时显示的操作按钮 */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 bg-white/90 hover:bg-white shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImage(url, {
                                    prompt: task.parsed?.prompt,
                                    usePromptAsFilename: state.usePromptAsFilename,
                                    imageNaming: state.imageNaming,
                                    prependPrompt,
                                    appendPrompt,
                                    imageFormat: state.imageFormat,
                                    taskIndex: task.lineNumber,
                                    imageList: task.result.outputUrls,
                                    currentIndex: index
                                  });
                                }}
                                title="查看原图"
                              >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </Button>
                              {/* 下载按钮已隐藏 */}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : task.status === 'running' ? (
                    <div className="flex items-center justify-center h-48 bg-muted/30 rounded-lg animate-pulse">
                      <div className="text-center text-muted-foreground">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <div className="text-sm">生成中...</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 bg-muted/30 rounded-lg">
                      <div className="text-center text-muted-foreground">
                        <div className="text-sm">等待生成</div>
                      </div>
                    </div>
                  )}

                  {/* 任务信息 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium flex-1">
                        {state.usePromptAsFilename && task.parsed?.prompt 
                          ? task.parsed.prompt.length > 30 
                            ? `${task.parsed.prompt.substring(0, 30)}...` 
                            : task.parsed.prompt
                          : `#${task.lineNumber}`
                        }
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          task.status === 'succeeded'
                            ? 'bg-green-500'
                            : task.status === 'failed'
                            ? 'bg-red-500'
                            : task.status === 'running'
                            ? 'bg-blue-500 animate-pulse'
                            : 'bg-gray-300'
                        }`}
                      />
                    </div>

                    {/* 提示词信息 - 折叠状态 */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                        查看提示词详情
                      </summary>
                      <div className="mt-1 space-y-1">
                        <p className="text-gray-500">
                          <span className="font-semibold">原始:</span> {task.content}
                        </p>
                        {task.parsed && (
                          <p className="text-green-600 bg-green-50 p-1 rounded">
                            <span className="font-semibold">最终:</span> {task.parsed.prompt}
                          </p>
                        )}
                      </div>
                    </details>

                    {task.error && (
                      <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
                        错误: {task.error}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* 保存预设对话框 */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">保存为工作流预设</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">预设名称</label>
                <Input
                  placeholder="输入预设名称"
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
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                此预设将包含：
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>当前所有提示词配置</li>
                  <li>上传的图片（{batchImages.length}张）</li>
                  <li>模型参数设置</li>
                  <li>前置和后置提示词</li>
                  <li>生成尺寸选择（{size || defaultForm.size}）</li>
                  <li>调度参数配置（并发数：{config?.concurrency || '-'}）</li>
                  <li>提示词格式脚本（{selectedScript || '未选择'}）</li>
                  <li>文件命名选项（{usePromptAsFilename ? '使用提示词命名' : '默认命名'}）</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setState({ showSaveDialog: false, presetTitle: '' });
                }}
              >
                取消
              </Button>
              <Button onClick={handleSaveAsPreset} disabled={!presetTitle.trim()}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
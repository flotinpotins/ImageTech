import React, { useState, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toaster';
import { Sidebar, SidebarRef } from '@/components/Sidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { SingleGeneration } from '@/components/SingleGeneration';
import { BatchGeneration } from '@/components/BatchGeneration';
import { WorkflowPresets } from '@/components/WorkflowPresets';

import type { 
  ModelType, 
  SingleGenerationForm, 
  HistoryItem, 
  Preset,
  OfficialPreset,
  ApiKeyConfig 
} from '@/types';

function App() {
  // Sidebar ref for token balance refresh
  const sidebarRef = useRef<SidebarRef>(null);
  
  // 主要状态
  const [activeTab, setActiveTab] = useState('single');
  const [selectedModel, setSelectedModel] = useState<ModelType>('jimeng-t2i');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [myPresets, setMyPresets] = useState<Preset[]>(() => {
    try {
      const saved = localStorage.getItem('myPresets');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('Failed to parse myPresets from localStorage:', e);
      return [];
    }
  });
  
  // API Key 状态管理
  const [apiKeyConfig, setApiKeyConfig] = useState<ApiKeyConfig>(() => {
    try {
      const saved = localStorage.getItem('apiKeyConfig');
      return saved ? JSON.parse(saved) : { globalApiKey: '', useGlobalApiKey: true };
    } catch (e) {
      console.warn('Failed to parse apiKeyConfig from localStorage:', e);
      return { globalApiKey: '', useGlobalApiKey: true };
    }
  });
  
  // 单次生成表单状态
  const [singleForm, setSingleForm] = useState<SingleGenerationForm>({
    model: 'jimeng-t2i',
    prompt: '',
    size: '1024x1024',
    images: [],
    guidanceScale: 7.5,
    imageFormat: 'png',
    usePromptAsFilename: true,
    mode: 'text-to-image',
  });

  // 单次生成组件内部状态
  const [singleState, setSingleState] = useState({
    isGenerating: false,
    progress: 0,
    result: null as any,
    showSaveDialog: false,
    presetTitle: '',
    previewImage: '',
    prependPrompt: '',
    appendPrompt: '',
    useCustomNaming: false,
    selectedPromptTypes: [] as string[],
  });

  // 批量生成组件内部状态
  const [batchState, setBatchState] = useState({
    inputText: '',
    tasks: [] as any[],
    config: {
      concurrency: 2,
      maxRetries: 1,
      throttleMs: 300,
    },
    status: 'idle' as any,
    progress: { completed: 0, total: 0 },
    prependPrompt: '',
    appendPrompt: '',
    batchImages: [] as string[],
    showSaveDialog: false,
    presetTitle: '',
    selectedScript: '',
    usePromptAsFilename: true,
    size: '',
    previewImage: '',
    mask: undefined as string | undefined,
    n: 1,
    quality: 'medium' as 'high' | 'medium' | 'low',
    selectedMasks: [] as string[],
    model: 'jimeng-t2i',
    imageNaming: {
      enabled: false,
      selectedOptions: ['basic'] as string[], // 默认选中基本提示词
    },
  });



  // 同步模型选择到表单
  React.useEffect(() => {
    setSingleForm(prev => ({
      ...prev,
      model: selectedModel,
      // 设置默认尺寸
      size: '1024x1024',
    }));
  }, [selectedModel]);

  // 同步模型选择到批量状态和批量表单
  React.useEffect(() => {
    setBatchState(prev => ({
      ...prev,
      model: selectedModel,
    }));
    setBatchForm(prev => ({
      ...prev,
      model: selectedModel,
    }));
  }, [selectedModel]);

  // 处理API Key变更
  const handleApiKeyChange = useCallback((apiKey: string) => {
    const newConfig = { ...apiKeyConfig, globalApiKey: apiKey };
    setApiKeyConfig(newConfig);
  }, [apiKeyConfig]);

  // 处理模型变更
  const handleModelChange = useCallback((model: ModelType) => {
    setSelectedModel(model);
    setBatchState(prev => ({
      ...prev,
      model
    }));
    setBatchForm(prev => ({
      ...prev,
      model
    }));
  }, []);

  // 刷新令牌余额
  const refreshTokenBalance = useCallback(async () => {
    try {
      await sidebarRef.current?.refreshTokenBalance();
    } catch (error) {
      console.error('Failed to refresh token balance:', error);
    }
  }, []);

  // 处理历史项选择
  const handleHistoryItemSelect = useCallback((item: HistoryItem) => {
    setSelectedHistoryItem(item);
  }, []);

  // 添加历史项
  const addHistoryItem = useCallback((item: HistoryItem) => {
    setHistory(prev => [item, ...prev]);
    setSelectedHistoryItem(item);
  }, []);

  // 更新历史项
  const updateHistoryItem = useCallback((id: string, updates: Partial<HistoryItem>) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
    
    // 如果更新的是当前选中的项，也更新选中状态
    setSelectedHistoryItem(prev => 
      prev?.id === id ? { ...prev, ...updates } : prev
    );
  }, []);

  // 更新整个历史记录数组（用于置顶功能）
  const updateHistory = useCallback((updatedHistory: HistoryItem[]) => {
    setHistory(updatedHistory);
  }, []);

  // 保存预设
  const handleSavePreset = useCallback((preset: Preset) => {
    setMyPresets(prev => [{...preset, createdAt: Date.now()}, ...prev]);
  }, []);



  // 批量专用表单状态（包含批量相关字段）
  const [batchForm, setBatchForm] = useState<SingleGenerationForm & {
    prependPrompt?: string;
    appendPrompt?: string;
  }>({
    model: 'jimeng-t2i',
    prompt: '',
    size: '1024x1024',
    images: [],
    guidanceScale: 7.5,
    imageFormat: 'png',
    mode: 'text-to-image',
    prependPrompt: '',
    appendPrompt: '',
    mask: undefined,
    n: 1,
    quality: 'medium' as 'high' | 'medium' | 'low',
  });

  // 应用预设并生成
  const handleApplyAndGenerate = useCallback((preset: Preset | OfficialPreset) => {
    // 检查是否为批量生成预设（包含批量相关字段）
    const isBatchPreset = 'prependPrompt' in preset || 'appendPrompt' in preset || 'batchConfig' in preset;
    
    if (isBatchPreset) {
      // 批量生成预设，跳转到批量生成
      setActiveTab('batch');
      setBatchForm({
        model: preset.model,
        prompt: preset.prompt,
        size: preset.size,
        images: (preset as any).images || [],
        guidanceScale: preset.guidanceScale || 7.5,
        imageFormat: (preset as any).imageFormat || 'png',
        mode: (preset as any).mode || 'text-to-image',
        prependPrompt: (preset as any).prependPrompt || '',
        appendPrompt: (preset as any).appendPrompt || '',
      });
      
      // 应用批量生成特有的参数
      setBatchState(prev => ({
        ...prev,
        inputText: preset.prompt,
        prependPrompt: (preset as any).prependPrompt || '',
        appendPrompt: (preset as any).appendPrompt || '',
        batchImages: (preset as any).images || [],
        config: (preset as any).batchConfig || prev.config,
        selectedScript: (preset as any).selectedScript || '',
        usePromptAsFilename: (preset as any).usePromptAsFilename || false,
        size: preset.size,
        previewImage: (preset as any).previewImage || '',
        imageNaming: (preset as any).imageNaming || prev.imageNaming,
      }));
      
      setSelectedModel(preset.model);
    } else {
      // 单次生成预设
      setActiveTab('single');
      setSingleForm({
        model: preset.model,
        prompt: preset.prompt,
        size: preset.size,
        images: (preset as any).images || [],
        guidanceScale: preset.guidanceScale || 7.5,
        imageFormat: (preset as any).imageFormat || 'png',
        mode: (preset as any).mode || 'text-to-image',
      });
      setSingleState(prev => ({
        ...prev,
        previewImage: (preset as any).previewImage || '',
      }));
      setSelectedModel(preset.model);
    }
  }, []);

  // 删除预设
  const handleDeletePreset = useCallback((presetId: string) => {
    setMyPresets(prev => prev.filter(preset => preset.id !== presetId));
  }, []);



  // 导入预设
  const handleImportPresets = useCallback((importedPresets: Preset[]) => {
    setMyPresets(prev => {
      // 合并导入的预设，避免ID冲突
      const existingIds = new Set(prev.map(p => p.id));
      const newPresets = importedPresets.filter(p => !existingIds.has(p.id));
      return [...prev, ...newPresets];
    });
  }, []);

  // 处理提示词传输
  const handleTransferPrompt = useCallback((prompt: string) => {
    if (activeTab === 'single') {
      // 单次生成：追加到现有提示词
      setSingleForm(prev => ({
        ...prev,
        prompt: prev.prompt ? `${prev.prompt}\n${prompt}` : prompt
      }));
    } else if (activeTab === 'batch') {
      // 批量生成：追加到输入文本
      setBatchState(prev => ({
        ...prev,
        inputText: prev.inputText ? `${prev.inputText}\n${prompt}` : prompt
      }));
    }
  }, [activeTab]);

  // 持久化我的预设到localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('myPresets', JSON.stringify(myPresets));
    } catch (e) {
      console.warn('Failed to save myPresets to localStorage:', e);
    }
  }, [myPresets]);

  // 持久化API Key配置到localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('apiKeyConfig', JSON.stringify(apiKeyConfig));
    } catch (e) {
      console.warn('Failed to save apiKeyConfig to localStorage:', e);
    }
  }, [apiKeyConfig]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 主要内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧边栏 */}
        <Sidebar
          ref={sidebarRef}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          recentPresets={myPresets.slice(0, 4)}
          onApplyPreset={handleApplyAndGenerate}
          apiKey={apiKeyConfig.globalApiKey}
          onApiKeyChange={handleApiKeyChange}
        />

        {/* 中间主要内容 */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            {/* Tab 导航 */}
            <div className="border-b px-6 py-4">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="single">单次生成</TabsTrigger>
                <TabsTrigger value="batch">批量生成</TabsTrigger>
                <TabsTrigger value="workflows">工作流预设</TabsTrigger>
              </TabsList>
            </div>

            {/* Tab 内容 */}
            <div className="flex-1 overflow-hidden">
              <TabsContent value="single" className="h-full p-6 overflow-y-auto">
                <SingleGeneration 
                  form={singleForm}
                  onFormChange={setSingleForm}
                  onAddHistory={addHistoryItem}
                  onUpdateHistory={updateHistoryItem}
                  onSavePreset={handleSavePreset}
                  apiKey={apiKeyConfig.useGlobalApiKey ? apiKeyConfig.globalApiKey : undefined}
                  state={singleState}
                  onStateChange={setSingleState}
                  onGenerationComplete={refreshTokenBalance}
                />
              </TabsContent>
              
              <TabsContent value="batch" className="h-full p-6 overflow-hidden">
                <BatchGeneration 
                  defaultForm={batchForm}
                  onSavePreset={handleSavePreset}
                  onAddHistory={addHistoryItem}
                  onUpdateHistory={updateHistoryItem}
                  apiKey={apiKeyConfig.useGlobalApiKey ? apiKeyConfig.globalApiKey : undefined}
                  state={batchState}
                  onStateChange={setBatchState}
                  onGenerationComplete={refreshTokenBalance}
                />
              </TabsContent>

              <TabsContent value="workflows" className="h-full p-6 overflow-y-auto">
                <WorkflowPresets
                  myPresets={myPresets}
                  onApplyAndGenerate={handleApplyAndGenerate}
                  onDeletePreset={handleDeletePreset}
                  onImportPresets={handleImportPresets}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* 右侧边栏 */}
        <RightSidebar
          history={history}
          selectedHistoryItem={selectedHistoryItem}
          onHistoryItemSelect={handleHistoryItemSelect}
          onUpdateHistory={updateHistory}
          onTransferPrompt={handleTransferPrompt}
        />
      </div>

      {/* Toast 通知 */}
      <Toaster />
    </div>
  );
}

export default App;
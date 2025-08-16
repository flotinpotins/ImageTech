import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronRight, Trash2, Download } from 'lucide-react';
import { PresetCard } from '@/components/PresetCard';
import { officialWorkflows } from '@/lib/presets';
import { exportPresets, importPresetsFromFile } from '@/lib/utils';
import type { Preset, OfficialPreset } from '@/types';

interface WorkflowPresetsProps {
  myPresets: Preset[];
  onApplyAndGenerate: (preset: Preset | OfficialPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onSwitchToSingle: () => void;
  onImportPresets: (presets: Preset[]) => void;
}

export function WorkflowPresets({
  myPresets,
  onApplyAndGenerate,
  onDeletePreset,
  onImportPresets
}: WorkflowPresetsProps) {
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleWorkflow = (workflowId: string) => {
    setExpandedWorkflows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(workflowId)) {
        newSet.delete(workflowId);
      } else {
        newSet.add(workflowId);
      }
      return newSet;
    });
  };

  const [deletedOfficialPresets, setDeletedOfficialPresets] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('deletedOfficialPresets');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const handleDeleteClick = (presetId: string) => {
    setPresetToDelete(presetId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (presetToDelete) {
      // 检查是否是官方预设
      const isOfficial = officialWorkflows.some(workflow => 
        workflow.presets.some(preset => preset.id === presetToDelete)
      );
      
      if (isOfficial) {
        // 对于官方预设，添加到已删除列表
        const newDeleted = new Set(deletedOfficialPresets);
        newDeleted.add(presetToDelete);
        setDeletedOfficialPresets(newDeleted);
        localStorage.setItem('deletedOfficialPresets', JSON.stringify(Array.from(newDeleted)));
      } else {
        // 对于用户预设，调用删除回调
        onDeletePreset(presetToDelete);
      }
      setPresetToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const handleApplyAndGenerate = (preset: Preset | OfficialPreset) => {
    onApplyAndGenerate(preset);
    // 不再强制跳转到单次生成，让调用方决定如何处理
  };

  const handleExportSinglePreset = (preset: Preset | OfficialPreset) => {
    exportPresets([preset], `${preset.title}-preset.json`);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importPresetsFromFile(file, file.name);
      
      if (result.isValid && result.presets) {
        onImportPresets(result.presets);
        setImportErrors([]);
        alert(`成功导入 ${result.presets.length} 个预设`);
      } else {
        setImportErrors(result.errors);
        setImportDialogOpen(true);
      }
    } catch (error) {
      setImportErrors(['导入失败，请检查文件格式']);
      setImportDialogOpen(true);
    }

    // 清空文件输入
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8">
      {/* 官方工作流 */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">内置工作流</h2>
        
        {officialWorkflows.map((workflow) => {
          const isExpanded = expandedWorkflows.has(workflow.id);
          const visiblePresets = workflow.presets.filter(
            preset => !deletedOfficialPresets.has(preset.id)
          );
          
          if (visiblePresets.length === 0) return null;
          
          return (
            <div key={workflow.id} className="space-y-4">
              <Button
                variant="ghost"
                className="h-auto p-3 w-full justify-start"
                onClick={() => toggleWorkflow(workflow.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 mr-2" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2" />
                )}
                <div className="text-left">
                  <div className="font-medium">{workflow.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {workflow.category} 工作流 ({visiblePresets.length}个预设)
                  </div>
                </div>
              </Button>
              
              {isExpanded && (
                <div className="ml-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visiblePresets.map((preset) => (
                    <PresetCard
                       key={preset.id}
                       preset={preset}
                       onApplyAndGenerate={() => handleApplyAndGenerate(preset)}
                       onDelete={() => handleDeleteClick(preset.id)}
                       onExport={() => handleExportSinglePreset(preset)}
                       isOfficial={true}
                     />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 我的预设 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">我的预设</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportClick}
            >
              <Download className="h-4 w-4 mr-2" />
              导入预设
            </Button>
          </div>
        </div>
        
        {myPresets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>还没有保存的预设</p>
            <p className="text-sm mt-2">
              在单次生成页面点击"保存为预设"来创建预设
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onApplyAndGenerate={() => handleApplyAndGenerate(preset)}
                onDelete={() => handleDeleteClick(preset.id)}
                onExport={() => handleExportSinglePreset(preset)}
                isOfficial={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这个预设吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入错误对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入失败</DialogTitle>
            <DialogDescription>
              导入预设时遇到以下问题：
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto">
            <ul className="list-disc list-inside space-y-1 text-sm">
              {importErrors.map((error, index) => (
                <li key={index} className="text-red-600">{error}</li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button onClick={() => setImportDialogOpen(false)}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
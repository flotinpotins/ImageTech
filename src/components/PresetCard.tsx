import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Play, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import type { Preset, OfficialPreset } from '@/types';

interface PresetCardProps {
  preset: Preset | OfficialPreset;
  onApplyAndGenerate?: (preset: Preset | OfficialPreset) => void;
  onDelete?: (preset: Preset) => void;
  onExport?: (preset: Preset | OfficialPreset) => void;
  isOfficial?: boolean;
}

const modelLabels = {
  'jimeng-t2i': '即梦·文生图',
  'jimeng-i2i': '即梦·图生图',
  'doubao-seededit-3-0-i2i-250628': '即梦3·图生图',
  'gpt-image-1': 'GPT·图像生成/编辑',
};

export function PresetCard({
  preset,
  onApplyAndGenerate,
  onDelete,
  onExport
}: PresetCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(preset as Preset);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="preset-card group">
      {/* 预览图 */}
      <div className="aspect-video bg-muted rounded-md mb-3 overflow-hidden">
        {preset.previewImage ? (
          <img
            src={preset.previewImage}
            alt={preset.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            无预览图
          </div>
        )}
      </div>
      
      {/* 标题和模型 */}
      <div className="space-y-2 mb-3">
        <h4 className="font-medium text-sm line-clamp-2" title={preset.title}>
          {preset.title}
        </h4>
        <p className="text-xs text-muted-foreground">
          {modelLabels[preset.model]}
        </p>
      </div>
      

      
      {/* 操作按钮 */}
      <div className="space-y-2">
        {onApplyAndGenerate && (
          <Button
            size="sm"
            onClick={() => onApplyAndGenerate(preset)}
            className="w-full text-xs"
          >
            <Play className="h-3 w-3 mr-1" />
            应用并前往生成
          </Button>
        )}
        
        {onExport && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExport(preset)}
            className="w-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Upload className="h-3 w-3 mr-1" />
             导出预设
          </Button>
        )}
        
        {onDelete && (
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                className="w-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                删除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认删除</DialogTitle>
                <DialogDescription>
                  确定要删除预设「{preset.title}」吗？此操作无法撤销。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                >
                  取消
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
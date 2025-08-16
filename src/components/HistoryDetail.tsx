import { Button } from '@/components/ui/button';
import { Copy, Download, ExternalLink, Pin } from 'lucide-react';
import { copyToClipboard, downloadFile, formatTimestamp, openImage } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { HistoryItem } from '@/types';

interface HistoryDetailProps {
  item: HistoryItem | null;
}

const modelLabels = {
  'jimeng-t2i': '即梦·文生图',
  'jimeng-i2i': '即梦·图生图',
  'gpt-image-1': 'GPT·图像生成/编辑',
  'doubao-seededit-3-0-i2i-250628': '豆包·图像编辑',
} as const;

const statusLabels = {
  queued: '排队中',
  running: '生成中',
  succeeded: '成功',
  failed: '失败',
};

export function HistoryDetail({ item }: HistoryDetailProps) {
  const { toast } = useToast();

  if (!item) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">选择历史记录查看详情</p>
      </div>
    );
  }

  const handleCopySeed = async () => {
    if (item.result?.seed) {
      await copyToClipboard(item.result.seed.toString());
      toast({
        title: '复制成功',
        description: 'Seed 已复制到剪贴板',
      });
    }
  };

  const handleCopyUrl = async (url: string) => {
    await copyToClipboard(url);
    toast({
      title: '复制成功',
      description: '链接已复制到剪贴板',
    });
  };

  const handleDownload = (url: string, index: number) => {
    // 使用与openImage相同的命名逻辑
    let filename = `generated_image_${item.id}_${index + 1}.png`;
    
    // 如果有提示词，使用提示词作为文件名
    if (item.prompt) {
      const baseFilename = item.prompt
        .replace(/[<>:"/\\|?*]/g, '_')
        .substring(0, 100); // 限制长度
      filename = `${baseFilename}.png`;
    }
    
    downloadFile(url, filename);
  };

  const firstUrl = item.result?.outputUrls?.[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">详情</h3>
        <div className="flex items-center gap-2">
          {firstUrl && (
            <>
              <Button size="sm" variant="outline" onClick={() => handleCopyUrl(firstUrl)} className="h-7 px-2 text-xs">
                <Copy className="h-3.5 w-3.5 mr-1" /> 复制链接
              </Button>
              <Button size="sm" variant="outline" onClick={() => openImage(firstUrl, {
                prompt: item.prompt,
                usePromptAsFilename: true,
                imageFormat: 'png',
                taskIndex: 1
              })} className="h-7 px-2 text-xs">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> 打开
              </Button>
            </>
          )}
          {/* Pin按钮仅展示，不在此处改变状态（需要从父级更新）*/}
          <div className={`inline-flex items-center h-7 px-2 rounded border text-xs ${item.pinned ? 'bg-amber-100 border-amber-300 text-amber-800' : ''}`} title={item.pinned ? '已置顶' : '未置顶'}>
            <Pin className="h-3.5 w-3.5 mr-1" /> {item.pinned ? '已置顶' : '置顶'}
          </div>
        </div>
      </div>
      
      {/* 基本信息 */}
      <div className="space-y-3 text-sm">
        <div>
          <span className="font-medium">状态：</span>
          <span className={`ml-1 ${
            item.status === 'succeeded' ? 'text-green-600' :
            item.status === 'failed' ? 'text-red-600' :
            item.status === 'running' ? 'text-blue-600' :
            'text-yellow-600'
          }`}>
            {statusLabels[item.status]}
          </span>
        </div>
        
        <div>
          <span className="font-medium">模型：</span>
          <span className="ml-1">{modelLabels[item.model]}</span>
        </div>
        
        <div>
          <span className="font-medium">尺寸：</span>
          <span className="ml-1">{item.size}</span>
        </div>
        
        <div>
          <span className="font-medium">时间：</span>
          <span className="ml-1">{formatTimestamp(item.timestamp)}</span>
        </div>
        
        {item.images && item.images.length > 0 && (
          <div>
            <span className="font-medium">输入图片：</span>
            <span className="ml-1">{item.images.length} 张</span>
          </div>
        )}
        
        {item.result?.seed && (
          <div className="flex items-center gap-2">
            <span className="font-medium">Seed：</span>
            <span className="ml-1 font-mono text-xs">{item.result.seed}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopySeed}
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      
      {/* 提示词 */}
      <div>
        <span className="font-medium text-sm">提示词：</span>
        <p className="mt-1 text-sm text-muted-foreground bg-muted p-2 rounded text-wrap break-words">
          {item.prompt}
        </p>
      </div>
      
      {/* 生成结果 */}
      {item.result?.outputUrls && item.result.outputUrls.length > 0 && (
        <div className="space-y-2">
          <span className="font-medium text-sm">生成结果：</span>
          <div className="space-y-2">
            {item.result.outputUrls.map((url: string, index: number) => (
              <div key={index} className="space-y-2">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyUrl(url)}
                    className="flex-1 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    复制链接
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(url, index)}
                    className="flex-1 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    下载
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openImage(url, {
                      prompt: item.prompt,
                      usePromptAsFilename: true,
                      imageFormat: 'png',
                      taskIndex: index + 1
                    })}
                    className="flex-1 text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    打开
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 错误信息 */}
      {item.status === 'failed' && item.result?.error && (
        <div>
          <span className="font-medium text-sm text-red-600">错误信息：</span>
          <p className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded">
            {item.result.error}
          </p>
        </div>
      )}
    </div>
  );
}
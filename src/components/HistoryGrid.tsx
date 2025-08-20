import React, { useState } from 'react';
import { openImage } from '@/lib/utils';
import type { HistoryItem } from '@/types';
import { ExternalLink, Pin, ArrowLeft } from 'lucide-react';

interface HistoryGridProps {
  items: HistoryItem[];
  onItemClick: (item: HistoryItem) => void;
  onTogglePin?: (item: HistoryItem) => void;
  onTransferPrompt?: (prompt: string) => void;
}

export function HistoryGrid({ items, onItemClick, onTogglePin, onTransferPrompt }: HistoryGridProps) {
  const [imageSize, setImageSize] = useState(100); // 图片大小百分比，默认100%
  
  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">暂无历史记录</p>
      </div>
    );
  }

  const handleOpen = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    const url = item.result?.outputUrls?.[0];
    if (url) {
      openImage(url, {
        prompt: item.prompt,
        usePromptAsFilename: true,
        imageFormat: 'png',
        taskIndex: 1,
        imageList: item.result?.outputUrls || [url],
        currentIndex: 0
      });
    }
  };
  
  const handleTransferPrompt = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    if (onTransferPrompt && item.prompt) {
      onTransferPrompt(item.prompt);
    }
  };
  
  // 分离置顶和普通历史
  const pinnedItems = items.filter(item => item.pinned);
  const regularItems = items.filter(item => !item.pinned);
  
  // 计算图片容器样式
  const getImageContainerStyle = () => {
    const size = Math.max(60, Math.min(200, imageSize)); // 限制在60px-200px之间
    return {
      width: `${size}px`,
      height: `${size}px`
    };
  };
  
  // 渲染图片网格
  const renderGrid = (gridItems: HistoryItem[], title?: string) => {
    if (gridItems.length === 0) return null;
    
    return (
      <div className="space-y-2">
        {title && (
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</h4>
            <span className="text-xs text-muted-foreground">{gridItems.length}个</span>
          </div>
        )}
        <div className="grid gap-2 p-2" style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(60, Math.min(200, imageSize))}px, 1fr))`
        }}>
          {gridItems.map((item) => (
            <div
              key={item.id}
              className="group cursor-pointer rounded-lg hover:shadow-md transition-all duration-200 hover:scale-105 active:scale-95 relative z-10 hover:z-50 p-1"
              onClick={() => onItemClick(item)}
            >
              {/* 悬停操作区域 */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                <button
                  className="p-1 rounded bg-blue-500 text-white hover:bg-blue-600"
                  title="传输提示词到输入框"
                  onClick={(e) => handleTransferPrompt(e, item)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1 rounded bg-black/60 text-white hover:bg-black/80"
                  title="新窗口打开"
                  onClick={(e) => handleOpen(e, item)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  className={`p-1 rounded ${item.pinned ? 'bg-amber-500 text-white' : 'bg-black/60 text-white'} hover:bg-black/80`}
                  title={item.pinned ? '取消置顶' : '置顶'}
                  onClick={(e) => { e.stopPropagation(); onTogglePin && onTogglePin(item); }}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 圆角图片预览 */}
              <div className="aspect-square bg-muted relative rounded-lg overflow-hidden" style={getImageContainerStyle()}>
                {item.result?.outputUrls?.[0] ? (
                  <img
                    src={item.result.outputUrls[0]}
                    alt="生成结果"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-xs text-muted-foreground text-center p-1">
                      {item.status === 'running' && '生成中...'}
                      {item.status === 'queued' && '排队中...'}
                      {item.status === 'failed' && '失败'}
                      {item.status === 'succeeded' && '无预览'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 图片大小控制滑块 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">预览大小</label>
          <span className="text-xs text-muted-foreground">{Math.round(imageSize)}%</span>
        </div>
        <input
          type="range"
          min="60"
          max="200"
          value={imageSize}
          onChange={(e) => setImageSize(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
      
      {/* 历史记录区域 */}
      <div className="space-y-4 max-h-96 overflow-y-auto scrollbar-hide">
        {/* 置顶区域 */}
        {pinnedItems.length > 0 && (
          <div className="border-b border-border pb-4">
            {renderGrid(pinnedItems, "置顶")}
          </div>
        )}
        
        {/* 普通历史区域 */}
        {regularItems.length > 0 && (
          renderGrid(regularItems, pinnedItems.length > 0 ? "历史记录" : undefined)
        )}
        
        {/* 空状态 */}
        {pinnedItems.length === 0 && regularItems.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">暂无历史记录</p>
          </div>
        )}
      </div>
    </div>
  );
}
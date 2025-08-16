import { HistoryGrid } from '@/components/HistoryGrid';
import { HistoryDetail } from '@/components/HistoryDetail';
import type { HistoryItem } from '@/types';

interface RightSidebarProps {
  history: HistoryItem[];
  selectedHistoryItem: HistoryItem | null;
  onHistoryItemSelect: (item: HistoryItem) => void;
  onUpdateHistory?: (updatedHistory: HistoryItem[]) => void;
  onTransferPrompt?: (prompt: string) => void;
}

export function RightSidebar({
  history,
  selectedHistoryItem,
  onHistoryItemSelect,
  onUpdateHistory,
  onTransferPrompt,
}: RightSidebarProps) {
  const sorted = [...history].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap; // pinned优先
    return b.timestamp - a.timestamp; // 其后按时间倒序
  });

  // 修复置顶状态持久化问题
  const handleTogglePin = (item: HistoryItem) => {
    const updatedHistory = history.map(historyItem => 
      historyItem.id === item.id 
        ? { ...historyItem, pinned: !historyItem.pinned }
        : historyItem
    );
    
    // 更新历史记录状态
    if (onUpdateHistory) {
      onUpdateHistory(updatedHistory);
    }
    
    // 如果当前选中的是被切换置顶状态的项目，也要更新选中项
    if (selectedHistoryItem?.id === item.id) {
      onHistoryItemSelect({ ...item, pinned: !item.pinned });
    }
  };

  return (
    <div className="w-80 border-l bg-muted/30 flex flex-col overflow-visible">
      {/* 详情区域 - 放在上方，内容完全展开 */}
      {selectedHistoryItem && (
        <div className="border-b">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide p-6 pb-4">
            详细信息
          </h3>
          <div className="px-6 pb-6">
            <HistoryDetail item={selectedHistoryItem} />
          </div>
        </div>
      )}

      {/* 历史网格 - 放在下方，自适应高度可滚动 */}
      <div className="flex-1 p-6 space-y-4 min-h-0 overflow-visible">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          生成历史
        </h3>
        <div className="overflow-y-auto overflow-x-visible">
          <HistoryGrid
            items={sorted}
            onItemClick={onHistoryItemSelect}
            onTogglePin={handleTogglePin}
            onTransferPrompt={onTransferPrompt}
          />
        </div>
      </div>
    </div>
  );
}
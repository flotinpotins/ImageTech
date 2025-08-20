import { useRef, forwardRef, useImperativeHandle } from 'react';
import { ModelSelector } from '@/components/ModelSelector';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { TokenBalance, TokenBalanceRef } from '@/components/TokenBalance';
import type { ModelType, Preset } from '@/types';

interface SidebarProps {
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  // Task 1: recent presets
  recentPresets?: Preset[];
  onApplyPreset?: (p: Preset) => void;
  // API Key 管理
  apiKey: string;
  onApiKeyChange: (apiKey: string) => void;
}

export interface SidebarRef {
  refreshTokenBalance: () => Promise<void>;
}

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({ 
  selectedModel,
  onModelChange,
  recentPresets = [],
  onApplyPreset,
  apiKey,
  onApiKeyChange,
}, ref) => {
  const tokenBalanceRef = useRef<TokenBalanceRef>(null);

  // 暴露刷新令牌余额的函数给父组件
  useImperativeHandle(ref, () => ({
    refreshTokenBalance: async () => {
      await tokenBalanceRef.current?.refreshBalance();
    }
  }));
  return (
    <div className="w-80 border-r bg-muted/30 p-6 space-y-6 overflow-y-auto">
      {/* 模型选择 */}
      <div className="space-y-3">
        <ModelSelector value={selectedModel} onChange={onModelChange} />
      </div>

      {/* API Key 管理 */}
      <div className="space-y-3">
        <ApiKeyManager value={apiKey} onChange={onApiKeyChange} />
      </div>

      {/* 令牌余额查询 */}
      <div className="space-y-3">
        <TokenBalance ref={tokenBalanceRef} apiKey={apiKey} />
      </div>

      {/* 最近预设 */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          最近预设
        </h3>
        {recentPresets.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无预设</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {recentPresets.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="rounded-md overflow-hidden border cursor-pointer group"
                onClick={() => onApplyPreset && onApplyPreset(p)}
                title={p.title}
              >
                <div className="aspect-square bg-muted">
                  <img
                    src={p.previewImage || '/placeholder-ai.svg'}
                    alt={p.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-ai.svg';
                    }}
                  />
                </div>
                <div className="p-2 text-xs truncate">{p.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
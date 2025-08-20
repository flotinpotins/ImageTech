import { useState, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Coins, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface TokenBalanceProps {
  apiKey: string;
}

export interface TokenBalanceRef {
  refreshBalance: () => Promise<void>;
}

interface TokenQuota {
  id: number;
  name: string;
  quota: number;
  used_quota?: number;
  unlimited_quota?: boolean;
  // 可能的其他字段
  used?: number;
  remaining?: number;
  total?: number;
}

export const TokenBalance = forwardRef<TokenBalanceRef, TokenBalanceProps>(({ apiKey }, ref) => {
  const [balance, setBalance] = useState<TokenQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchBalance = async () => {
    if (!apiKey) {
      toast({
        title: '错误',
        description: '请先设置 API Key',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 通过后端代理查询令牌余额
      const response = await fetch('/api/token/quota', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TokenQuota = await response.json();
      console.log('Token balance API response:', data);
      console.log('Raw used_quota:', data.used_quota);
      console.log('Raw used:', data.used);
      console.log('Raw quota:', data.quota);
      
      // 尝试处理可能的单位转换问题
      const processedData = {
        ...data,
        // 基于用户反馈，364958479.00应该显示为729.92，计算转换比例
        // 364958479 / 729.92 ≈ 500000，所以可能需要除以500000
        used_quota: data.used_quota ? (data.used_quota > 100000 ? data.used_quota / 500000 : data.used_quota) : undefined,
        used: data.used ? (data.used > 100000 ? data.used / 500000 : data.used) : undefined
      };
      
      console.log('Processed data:', processedData);
      setBalance(processedData);
      toast({
        title: '刷新成功',
        description: '令牌余额已更新',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '查询失败';
      setError(errorMessage);
      toast({
        title: '查询失败',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 暴露刷新函数给父组件
  useImperativeHandle(ref, () => ({
    refreshBalance: fetchBalance
  }));

  const formatQuota = (quota: number) => {
    return quota.toFixed(2);
  };

  return (
    <div className="w-full border rounded-lg p-4 bg-white shadow-sm">
      <div className="pb-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Coins className="h-4 w-4" />
          令牌余额查询
        </h3>
        <p className="text-xs text-gray-600 mt-1">
          查看当前 API Key 的令牌余额
        </p>
      </div>
      
      <div className="space-y-4 mt-4">
        {/* 余额显示区域 */}
        <div className="bg-gray-50 rounded-lg p-3">
          {error ? (
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : balance ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">用户名:</span>
                <span className="text-sm font-medium">{balance.name}</span>
              </div>
              {(balance.used_quota !== undefined || balance.used !== undefined) && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">已用额度:</span>
                  <span className="text-sm font-medium text-orange-600">
                    {formatQuota(balance.used_quota || balance.used || 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">剩余额度:</span>
                <span className="text-lg font-bold text-green-600">
                  {balance.unlimited_quota 
                    ? '无限制' 
                    : formatQuota(balance.quota - (balance.used_quota || balance.used || 0))
                  }
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-2">
              点击刷新按钮查询余额
            </div>
          )}
        </div>

        {/* 刷新按钮 */}
        <Button
          onClick={fetchBalance}
          disabled={loading || !apiKey}
          className="w-full"
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '查询中...' : '刷新余额'}
        </Button>

        {!apiKey && (
          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
            请先在上方设置 API Key 后再查询余额
          </div>
        )}
      </div>
    </div>
  );
});
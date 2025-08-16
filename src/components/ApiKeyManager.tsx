import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Key, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ApiKeyManagerProps {
  value: string;
  onChange: (apiKey: string) => void;
}

export function ApiKeyManager({ value, onChange }: ApiKeyManagerProps) {
  const [apiKey, setApiKey] = useState(value);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setApiKey(value);
  }, [value]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast({
        title: '错误',
        description: 'API Key 不能为空',
        variant: 'destructive',
      });
      return;
    }

    // 简单验证API Key格式（以sk-开头）
    if (!apiKey.startsWith('sk-')) {
      toast({
        title: '警告',
        description: 'API Key 格式可能不正确，通常以 sk- 开头',
        variant: 'destructive',
      });
      return;
    }

    onChange(apiKey);
    setIsEditing(false);
    toast({
      title: '保存成功',
      description: 'API Key 已保存到本地存储',
    });
  };

  const handleCancel = () => {
    setApiKey(value);
    setIsEditing(false);
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return key;
    return key.slice(0, 8) + '*'.repeat(Math.max(0, key.length - 12)) + key.slice(-4);
  };

  return (
    <div className="w-full border rounded-lg p-4 bg-white shadow-sm">
      <div className="pb-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Key className="h-4 w-4" />
          全局 API Key 管理
        </h3>
        <p className="text-xs text-gray-600 mt-1">
          设置统一的 API Key，用于所有模型的图片生成
        </p>
      </div>
      <div className="space-y-4 mt-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                placeholder="请输入您的 API Key (sk-...)"
                value={isEditing ? apiKey : (value ? maskApiKey(value) : '')}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!isEditing}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setShowApiKey(!showApiKey)}
                disabled={!isEditing && !value}
              >
                {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="flex-1"
              >
                {value ? '修改 API Key' : '设置 API Key'}
              </Button>
            ) : (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  className="flex-1"
                >
                  <Save className="h-3 w-3 mr-1" />
                  保存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="flex-1"
                >
                  取消
                </Button>
              </>
            )}
          </div>

          {value && (
            <div className="text-xs text-gray-500">
              当前状态: <span className="text-green-600 font-medium">已配置</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ModelType } from '@/types';

interface ModelSelectorProps {
  value: ModelType;
  onChange: (model: ModelType) => void;
}

const modelOptions = [
  { value: 'gpt-image-1', label: 'GPT Image 1', description: 'OpenAI 图像生成模型' },
  { value: 'jimeng-t2i', label: '即梦 T2I', description: '国产高质量图像生成模型' },
  { value: 'nano-banana', label: 'Nano-banana', description: '专业图生图模型，支持图片编辑和风格转换（基于 Gemini 2.5 Flash）' },
] as const;

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">模型选择</label>
      <Select value={value} onValueChange={(value) => onChange(value as ModelType)}>
        <SelectTrigger>
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {modelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
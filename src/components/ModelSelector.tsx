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
  { value: 'jimeng-t2i', label: '即梦·文生图' },
  { value: 'gpt-image-1', label: 'GPT·图像生成/编辑' },
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
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
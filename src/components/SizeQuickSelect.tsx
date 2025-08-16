import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SizeOption } from '@/types';

interface SizeQuickSelectProps {
  onSizeSelect: (size: SizeOption) => void;
  selectedSize?: SizeOption;
}

const sizeOptions: { value: SizeOption; label: string }[] = [
  { value: '1024x1024', label: '1024×1024' },
  { value: '1536x1024', label: '1536×1024' },
  { value: '1024x1536', label: '1024×1536' },
  { value: 'adaptive', label: '自适应' },
];

export function SizeQuickSelect({ onSizeSelect, selectedSize }: SizeQuickSelectProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">尺寸</label>
      <Select value={selectedSize} onValueChange={(value) => onSizeSelect(value as SizeOption)}>
        <SelectTrigger>
          <SelectValue placeholder="选择尺寸" />
        </SelectTrigger>
        <SelectContent>
          {sizeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
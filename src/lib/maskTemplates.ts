// 蒙版模板定义
export interface MaskTemplate {
  id: string;
  name: string;
  description: string;
  dataUrl: string;
}

// 使用 Canvas 生成 PNG 蒙版：不透明为保留区域，透明为可编辑区域
function generateMaskPNG(width: number, height: number, shape: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 先填充为不透明黑色（保留区域）
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(0, 0, width, height);

  // 使用 destination-out 将指定形状“挖空”为透明（可编辑区域）
  ctx.globalCompositeOperation = 'destination-out';

  switch (shape) {
    case 'circle': {
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'square': {
      const size = Math.min(width, height) / 2;
      const x = (width - size) / 2;
      const y = (height - size) / 2;
      ctx.fillRect(x, y, size, size);
      break;
    }
    case 'center-portrait': {
      const pWidth = width * 0.6;
      const pHeight = height * 0.8;
      const px = (width - pWidth) / 2;
      const py = (height - pHeight) / 2;
      ctx.fillRect(px, py, pWidth, pHeight);
      break;
    }
    case 'center-landscape': {
      const lWidth = width * 0.8;
      const lHeight = height * 0.6;
      const lx = (width - lWidth) / 2;
      const ly = (height - lHeight) / 2;
      ctx.fillRect(lx, ly, lWidth, lHeight);
      break;
    }
    case 'left-half': {
      ctx.fillRect(0, 0, width / 2, height);
      break;
    }
    case 'right-half': {
      ctx.fillRect(width / 2, 0, width / 2, height);
      break;
    }
    case 'top-half': {
      ctx.fillRect(0, 0, width, height / 2);
      break;
    }
    case 'bottom-half': {
      ctx.fillRect(0, height / 2, width, height / 2);
      break;
    }
    case 'corners': {
      const cornerSize = Math.min(width, height) / 4;
      ctx.fillRect(0, 0, cornerSize, cornerSize);
      ctx.fillRect(width - cornerSize, 0, cornerSize, cornerSize);
      ctx.fillRect(0, height - cornerSize, cornerSize, cornerSize);
      ctx.fillRect(width - cornerSize, height - cornerSize, cornerSize, cornerSize);
      break;
    }
    default: {
      // 挖空整个画布（基本不会使用）
      ctx.fillRect(0, 0, width, height);
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  return canvas.toDataURL('image/png');
}

// 预定义蒙版模板（预览小图）
export const MASK_TEMPLATES: MaskTemplate[] = [
  {
    id: 'none',
    name: '无蒙版',
    description: '不使用蒙版，全图编辑',
    dataUrl: '',
  },
  {
    id: 'circle',
    name: '圆形蒙版',
    description: '圆形区域编辑',
    dataUrl: generateMaskPNG(256, 256, 'circle'),
  },
  {
    id: 'square',
    name: '方形蒙版',
    description: '正方形区域编辑',
    dataUrl: generateMaskPNG(256, 256, 'square'),
  },
  {
    id: 'center-portrait',
    name: '中央竖直蒙版',
    description: '竖直矩形区域编辑（适合人物）',
    dataUrl: generateMaskPNG(256, 256, 'center-portrait'),
  },
  {
    id: 'center-landscape',
    name: '中央水平蒙版',
    description: '水平矩形区域编辑（适合风景）',
    dataUrl: generateMaskPNG(256, 256, 'center-landscape'),
  },
  {
    id: 'left-half',
    name: '左半部蒙版',
    description: '左半部分编辑',
    dataUrl: generateMaskPNG(256, 256, 'left-half'),
  },
  {
    id: 'right-half',
    name: '右半部蒙版',
    description: '右半部分编辑',
    dataUrl: generateMaskPNG(256, 256, 'right-half'),
  },
  {
    id: 'top-half',
    name: '上半部蒙版',
    description: '上半部分编辑',
    dataUrl: generateMaskPNG(256, 256, 'top-half'),
  },
  {
    id: 'bottom-half',
    name: '下半部蒙版',
    description: '下半部分编辑',
    dataUrl: generateMaskPNG(256, 256, 'bottom-half'),
  },
  {
    id: 'corners',
    name: '四角蒙版',
    description: '四个角落区域编辑',
    dataUrl: generateMaskPNG(256, 256, 'corners'),
  },
];

// 根据图片尺寸动态生成蒙版
export function generateMaskForSize(templateId: string, width: number, height: number): string {
  if (templateId === 'none') return '';
  const template = MASK_TEMPLATES.find(t => t.id === templateId);
  if (!template) return '';
  return generateMaskPNG(width, height, templateId);
}
import type { OfficialWorkflow } from '@/types';

// 官方工作流预设
export const officialWorkflows: OfficialWorkflow[] = [
  {
    id: 'educational',
    title: '益智',
    category: '益智',
    presets: [
      {
        id: 'math-illustration',
        title: '数学插图生成',
        model: 'jimeng-t2i',
        prompt: '数学几何图形，清晰的线条，教育插图风格，简洁明了，适合教学使用',
        size: '1024x1024',
        guidanceScale: 7.5,
        previewImage: '/placeholder-math.svg'
      },
      {
        id: 'science-diagram',
        title: '科学图解',
        model: 'jimeng-t2i',
        prompt: '科学实验图解，清晰的步骤说明，教育风格，色彩鲜明，适合儿童学习',
        size: '1536x1024',
        guidanceScale: 8.0,
        previewImage: '/placeholder-science.svg'
      },
      {
        id: 'history-scene',
        title: '历史场景',
        model: 'jimeng-t2i',
        prompt: '历史场景重现，古代建筑，人物服饰，写实风格，教育用途',
        size: '1024x1536',
        guidanceScale: 7.0,
        previewImage: '/placeholder-history.svg'
      }
    ]
  },
  {
    id: 'creative-writing',
    title: '小作家',
    category: '小作家',
    presets: [
      {
        id: 'story-illustration',
        title: '故事插图',
        model: 'jimeng-t2i',
        prompt: '童话故事插图，温馨可爱的画风，色彩丰富，适合儿童读物',
        size: '1024x1024',
        guidanceScale: 7.5,
        previewImage: '/placeholder-story.svg'
      },
      {
        id: 'character-design',
        title: '角色设计',
        model: 'jimeng-t2i',
        prompt: '卡通角色设计，可爱的动物或人物，简洁的线条，鲜明的特征',
        size: '1024x1024',
        guidanceScale: 8.0,
        previewImage: '/placeholder-character.svg'
      },
      {
        id: 'scene-background',
        title: '场景背景',
        model: 'jimeng-t2i',
        prompt: '故事场景背景，梦幻的风景，柔和的色调，适合作为插图背景',
        size: '1536x1024',
        guidanceScale: 7.0,
        previewImage: '/placeholder-scene.svg'
      }
    ]
  },
  {
    id: 'ai-plus',
    title: 'AI+',
    category: 'AI+',
    presets: [
      {
        id: 'data-visualization',
        title: '数据可视化',
        model: 'jimeng-t2i',
        prompt: '数据图表，信息图表，现代设计风格，清晰易读，商务风格',
        size: '1536x1024',
        guidanceScale: 7.5,
        previewImage: '/placeholder-data.svg'
      },
      {
        id: 'ai-artwork',
        title: 'AI艺术创作',
        model: 'jimeng-i2i',
        prompt: 'AI艺术风格，抽象艺术，创意设计，现代艺术风格',
        size: '1024x1024',
        previewImage: '/placeholder-ai.svg'
      }
    ]
  }
];
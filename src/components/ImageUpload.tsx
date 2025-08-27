import React, { useRef, useState } from 'react';

import { Upload, X } from 'lucide-react';
import { fileToDataURL, validateImageFile, simpleFileToDataURL } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  onDimensionsChange?: (dimensions: { width: number; height: number } | null) => void;
}

// 工具函数：从图片获取尺寸
const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

export function ImageUpload({ images, onChange, maxImages = 4, onDimensionsChange }: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach((file) => {
      if (validateImageFile(file)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      toast({
        title: '文件格式错误',
        description: `以下文件格式不支持或文件过大: ${invalidFiles.join(', ')}`,
        variant: 'destructive',
      });
    }

    if (validFiles.length === 0) return;

    const remainingSlots = maxImages - images.length;
    const filesToProcess = validFiles.slice(0, remainingSlots);

    if (validFiles.length > remainingSlots) {
      toast({
        title: '文件数量超限',
        description: `最多只能上传 ${maxImages} 张图片，已选择前 ${remainingSlots} 张`,
      });
    }

    try {
      const dataUrls = await Promise.all(
        filesToProcess.map(async (file) => {
          try {
            // 检测是否在Trae浏览器环境中
            const userAgent = navigator.userAgent;
            const isTrae = userAgent.includes('Trae') || window.location.href.includes('trae');
            
            if (isTrae) {
              console.log('Detected Trae browser, using simple file conversion');
              return await simpleFileToDataURL(file);
            } else {
              return await fileToDataURL(file);
            }
          } catch (error) {
            console.error('Primary conversion failed, trying fallback:', error);
            // 如果压缩失败，回退到简单转换
            return await simpleFileToDataURL(file);
          }
        })
      );
      const newImages = [...images, ...dataUrls];
      onChange(newImages);

      // 如果有回调函数且这是第一张图片，提取尺寸
      if (onDimensionsChange && newImages.length === dataUrls.length) {
        try {
          const dimensions = await getImageDimensions(dataUrls[0]);
          onDimensionsChange(dimensions);
        } catch (error) {
          console.warn('Failed to extract image dimensions:', error);
        }
      }
    } catch (error) {
      toast({
        title: '文件处理失败',
        description: '请重试或选择其他文件',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3">

      
      {/* 上传区域 */}
      <div
        className={`upload-area ${isDragOver ? 'dragover' : ''} ${images.length > 0 ? 'p-2' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={images.length < maxImages ? openFileDialog : undefined}
      >
        {images.length === 0 ? (
          <div className="text-center flex flex-col justify-center items-center h-full">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-1">
              点击选择或拖拽图片到此处
            </p>
            <p className="text-xs text-muted-foreground">
              支持 JPG、PNG、WebP、GIF 格式，最大 5MB（自动压缩优化）
            </p>
            <p className="text-xs text-muted-foreground">
              最多上传 {maxImages} 张图片
            </p>
          </div>
        ) : (
          <div className="w-full grid grid-cols-2 gap-2">
            {images.map((image, index) => (
              <div key={index} className="thumbnail-container">
                <img
                  src={image}
                  alt={`上传图片 ${index + 1}`}
                  className="thumbnail"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                  }}
                  className="thumbnail-remove"
                  aria-label="删除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          // 允许选择相同文件时也能触发 onChange
          if (e.currentTarget) e.currentTarget.value = '';
        }}
      />
    </div>
  );
}
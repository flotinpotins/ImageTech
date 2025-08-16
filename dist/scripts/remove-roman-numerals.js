// 去除罗马数字和阿拉伯数字编号
// 1. 去除行首的数字编号（如 "47. "、"48. "等）
// 2. 去除罗马数字字符：I V X L C D M（及其小写）
return text.replace(/^\d+\.\s*/gm, '').replace(/[IVXLCDMivxlcdm]+/g, '');
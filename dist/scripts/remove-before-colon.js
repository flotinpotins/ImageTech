// 去掉"："前面的内容（包含中文全角冒号和英文半角冒号）
// 对每一行进行处理：如果包含冒号，则替换为冒号后的内容；否则保持该行不变
/* global text */
const lines = text.split(/\r?\n/);
const processed = lines.map(line => {
  if (!line) return line;
  const idxCn = line.indexOf('：');
  const idxEn = line.indexOf(':');
  // 优先使用离左侧最近的冒号（最小非-1值）
  const idx = [idxCn, idxEn].filter(i => i !== -1).sort((a, b) => a - b)[0];
  if (idx === undefined) return line;
  return line.slice(idx + 1).trimStart();
});
return processed.join('\n');
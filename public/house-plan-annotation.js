/**
 * [INPUT]: 依赖Canvas二维上下文、归一化空间标注与画布显示比例
 * [OUTPUT]: 提供工作台、Beta与服务端送模SVG共用的空间框线、填色及文字标签绘制
 * [POS]: public 的户型空间标注视觉真源，主卧橙色、其他空间蓝色
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function drawHousePlanAnnotation(context, box, canvas, scale) {
  const x = box.x * canvas.width, y = box.y * canvas.height;
  const width = box.width * canvas.width, height = box.height * canvas.height;
  context.fillStyle = box.label === '主卧' ? '#ef7e2330' : '#3a769a25';
  context.fillRect(x, y, width, height);
  context.strokeStyle = box.label === '主卧' ? '#b94a00' : '#29607f';
  context.lineWidth = 2 * scale;
  context.strokeRect(x, y, width, height);
  context.font = `${12 * scale}px sans-serif`;
  context.fillStyle = context.strokeStyle;
  const textWidth = context.measureText(box.label).width + 8 * scale;
  context.fillRect(x, y, textWidth, 20 * scale);
  context.fillStyle = '#fff';
  context.fillText(box.label, x + 4 * scale, y + 14 * scale);
}

// --- 服务端复用同一绘制顺序和颜色；文字只作为SVG文本，不能注入标记。 ---
export function housePlanAnnotationSvg(annotations, width, height) {
  const escape = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
  const shapes = [], scale = Math.max(width, height) / 1000;
  const fill = value => `fill="${value.slice(0, 7)}" fill-opacity="${value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1}"`;
  const context = {
    fillRect(x, y, w, h) { shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${fill(this.fillStyle)}/>`); },
    strokeRect(x, y, w, h) { shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"/>`); },
    measureText(text) { return { width: Array.from(text).reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 1 : .65), 0) * 12 * scale }; },
    fillText(text, x, y) { shapes.push(`<text x="${x}" y="${y}" font-family="sans-serif" font-size="${12 * scale}" fill="${this.fillStyle}">${escape(text)}</text>`); },
  };
  for (const box of annotations) drawHousePlanAnnotation(context, box, { width, height }, scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join('')}</svg>`;
}

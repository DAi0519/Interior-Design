/**
 * [INPUT]: 依赖Canvas二维上下文、归一化空间标注与画布显示比例
 * [OUTPUT]: 提供工作台与Beta共用的空间框线、填色及文字标签绘制
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

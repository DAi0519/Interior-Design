/**
 * [INPUT]: 依赖包版本或 GitHub Tag 传入的规范版本字符串
 * [OUTPUT]: 提供 formatAppVersion 展示标签，统一浏览器与发布文案的 v1.0.00 显示
 * [POS]: public 的纯格式化函数，安装、比较和下载地址继续使用规范版本
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function formatAppVersion(version) {
  const value = version.replace(/^v/, "");
  return value === "1.0.0" ? "v1.0.00" : `v${value}`;
}

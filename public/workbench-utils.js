/**
 * [INPUT]: 依赖浏览器 fetch 与原生 select/option DOM
 * [OUTPUT]: 对外提供同源 JSON API、HTTPS 图片地址归一化与原生下拉填充工具
 * [POS]: public 的无状态浏览器基础设施，被生成与对话控制器复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export async function api(pathname, options = {}) {
  const response = await fetch(pathname, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `请求失败（${response.status}）`);
  }
  return body;
}

export function fillSelect(select, options, currentValue) {
  select.replaceChildren(
    ...options.map((option) => {
      const element = document.createElement("option");
      const value = typeof option === "string" ? option : option.value;
      element.value = value;
      element.textContent = typeof option === "string" ? option : option.label;
      element.selected = value === currentValue;
      return element;
    }),
  );
}

export function secureImageUrl(value) {
  return typeof value === "string"
    ? value.replace(/^http:\/\//i, "https://")
    : value;
}

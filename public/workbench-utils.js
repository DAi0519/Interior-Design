/**
 * [INPUT]: 依赖浏览器 fetch、FileReader 与原生 select/option DOM，接收统一生成/同步结果
 * [OUTPUT]: 对外提供同源 JSON API、图片地址/文件读取、字节与结果摘要格式化及原生下拉填充工具
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

export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error(`无法读取 ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

export function resultMetadata(result, sync = result.sync) {
  const syncLabel =
    sync?.status === "success"
      ? "已同步飞书"
      : sync?.status === "failed"
        ? "飞书同步失败"
        : sync?.status === "pending"
          ? "飞书同步中"
          : "未同步飞书";
  return [
    result.request.size.replace("x", " × "),
    result.request.outputFormat.toUpperCase(),
    result.style?.name,
    result.promptAgent ? `Prompt Agent v${result.promptAgent.version}` : null,
    result.promptAgent?.reused ? "提示词已复用" : null,
    result.request.referenceImageCount > 0
      ? `${result.request.referenceImageCount} 张参考图`
      : null,
    syncLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function secureImageUrl(value) {
  return typeof value === "string"
    ? value.replace(/^http:\/\//i, "https://")
    : value;
}

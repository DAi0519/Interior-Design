/**
 * [INPUT]: 依赖本机HTTP响应类别与已知静态页面路径
 * [OUTPUT]: 支持平面图机位渲染与户型平面布局同源嵌入； 提供编辑器同源嵌入/断网、统一安全响应头及AI渲染台/平面布局同源嵌入策略
 * [POS]: src 的HTTP安全策略真源，由server消费；API与其他页面继续禁止嵌入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self'; script-src 'self'; connect-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export function staticSecurityHeaders(pathname) {
  if (pathname === "/vendor/house-plan-designer/editor.html") return { ...SECURITY_HEADERS,
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  };
  if (!["/ai-render-studio.html", "/floor-plan-camera.html", "/floor-plan.html", "/house-plan.html"].includes(pathname)) return SECURITY_HEADERS;
  return { ...SECURITY_HEADERS,
    "Content-Security-Policy": SECURITY_HEADERS["Content-Security-Policy"].replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
    "X-Frame-Options": "SAMEORIGIN" };
}

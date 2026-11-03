/**
 * [INPUT]: 依赖本机HTTP响应类别与已知静态页面路径
 * [OUTPUT]: 对外提供统一安全响应头及仅AI渲染台页面允许同源宿主嵌入的静态策略
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
  if (pathname !== "/ai-render-studio.html") return SECURITY_HEADERS;
  return { ...SECURITY_HEADERS,
    "Content-Security-Policy": SECURITY_HEADERS["Content-Security-Policy"].replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
    "X-Frame-Options": "SAMEORIGIN" };
}

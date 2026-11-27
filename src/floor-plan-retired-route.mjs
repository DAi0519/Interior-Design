/**
 * [INPUT]: 接收主服务解析后的请求 URL 与 HTTP 响应，依赖共享 HTTP 响应与安全头
 * [OUTPUT]: 对实验室旧页面、资源及 API 返回 410，将旧工作台书签重定向到首页，报告请求是否已处理
 * [POS]: src 的设计实验室旧路由边界，由主服务在 API 与静态文件分流前调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { sendJson } from "./http-response.mjs";
import { SECURITY_HEADERS } from "./http-security.mjs";

export function handleRetiredFloorPlanRoute(url, response) {
  const pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (pathname === "/floor-plan.html" || pathname === "/floor-plan-report"
    || pathname.startsWith("/floor-plan-report/") || pathname.startsWith("/vendor/house-plan-designer/")
    || pathname === "/api/floor-plan" || pathname.startsWith("/api/floor-plan/")) {
    sendJson(response, 410, { error: "设计实验室 · Beta 已下架", code: "FEATURE_RETIRED" });
    return true;
  }
  if ((pathname === "/" || pathname === "/index.html") && url.searchParams.get("feature") === "floorPlan") {
    url.searchParams.delete("feature");
    response.writeHead(302, { ...SECURITY_HEADERS, "Cache-Control": "no-cache", Location: `${pathname}${url.search}` });
    response.end();
    return true;
  }
  return false;
}

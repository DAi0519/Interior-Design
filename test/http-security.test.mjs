/**
 * [INPUT]: 依赖HTTP安全头与静态路径策略
 * [OUTPUT]: 验证AI渲染台仅允许同源嵌入且其他静态页面/API保持原拒绝策略
 * [POS]: test 的嵌入边界合同，无浏览器或网络调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SECURITY_HEADERS, staticSecurityHeaders } from "../src/http-security.mjs";

test("渲染台只开放同源宿主嵌入，其他安全指令不变", () => {
  const studio = staticSecurityHeaders("/ai-render-studio.html");
  assert.equal(studio["X-Frame-Options"], "SAMEORIGIN");
  assert.match(studio["Content-Security-Policy"], /frame-ancestors 'self'/);
  assert.equal(studio["Content-Security-Policy"].replace("frame-ancestors 'self'", "frame-ancestors 'none'"), SECURITY_HEADERS["Content-Security-Policy"]);
  for (const path of ["/", "/index.html", "/beta.html", "/benchmark.html", "/api/ai-render-studio/jobs", "/other/ai-render-studio.html"]) {
    assert.strictEqual(staticSecurityHeaders(path), SECURITY_HEADERS);
  }
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
});

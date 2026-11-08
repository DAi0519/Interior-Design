/**
 * [INPUT]: 依赖 http-security 的统一安全头及 Node HTTP 响应对象
 * [OUTPUT]: 对外提供 sendJson、sendDownload、sendImage 三种响应写入函数
 * [POS]: src 的 HTTP 响应格式层，由根 server 组合入口复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { SECURITY_HEADERS } from "./http-security.mjs";

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    ...(statusCode === 413 ? { Connection: "close" } : {}),
  });
  response.end(JSON.stringify(payload));
}
export function sendDownload(response, download) {
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Disposition": download.contentDisposition,
    "Content-Length": download.bytes.length,
    "Content-Type": download.contentType,
  });
  response.end(download.bytes);
}
export function sendImage(response, { bytes, contentType }) {
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Length": bytes.length,
    "Content-Type": contentType,
  });
  response.end(bytes);
}

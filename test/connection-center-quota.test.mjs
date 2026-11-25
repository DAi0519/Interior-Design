/**
 * [INPUT]: 依赖连接中心控制器、内存 DOM 替身与可控制的额度响应
 * [OUTPUT]: 验证侧栏刷新、双处额度读数、刷新去重与断开连接后的状态清理
 * [POS]: test 的额度交互回归，不发送真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { bindConnectionCenter } from "../public/connection-center.js";

class TestElement extends EventTarget {
  textContent = "";
  disabled = false;
  hidden = false;
  attributes = new Map();
  classList = { add() {}, remove() {}, toggle() {} };

  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
}

test("连接弹层与侧栏共享额度，手动刷新保留焦点能力并隔离重复请求", async (t) => {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, new TestElement());
    return nodes.get(id);
  };
  const requests = [];
  const ready = {
    base: { readable: true }, cli: { installed: true, configured: true },
    user: { loggedIn: true, missingScopes: [] }, ready: true,
  };
  const document = Object.assign(new EventTarget(), { querySelector: node });
  const globals = { document, window: { location: { href: "http://localhost/" } } };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }

  const center = bindConnectionCenter({
    api(path, options) {
      if (path === "/api/setup/status") return Promise.resolve(ready);
      if (path === "/api/session") return Promise.resolve({ connected: options?.method !== "DELETE" });
      assert.equal(path, "/api/oneapi/quota");
      const request = Promise.withResolvers();
      requests.push(request);
      return request.promise;
    },
    onApiStateChange() {}, onApiDisconnected() {}, showToast() {},
  });
  const refresh = node("#apiQuotaRefresh");
  const assertQuota = (value) => {
    assert.equal(node("#apiQuotaValue").textContent, value);
    assert.equal(node("#connectionQuotaValue").textContent, value);
    assert.ok(node("#apiQuotaDetail").textContent.includes(value));
  };

  await center.load({ autoOpen: false });
  assert.equal(node("#connectionQuotaRow").hidden, false);
  assert.equal(refresh.hidden, false);
  assertQuota("读取额度…");
  assert.equal(refresh.getAttribute("aria-disabled"), "true");
  assert.equal(refresh.disabled, false);
  requests[0].resolve({ remaining: 27.5684, currency: "USD" });
  await setImmediate();
  assertQuota("27.5684 USD");
  assert.equal(refresh.getAttribute("aria-disabled"), null);

  refresh.dispatchEvent(new Event("click"));
  refresh.dispatchEvent(new Event("click"));
  assert.equal(requests.length, 2);
  assert.equal(refresh.getAttribute("aria-disabled"), "true");
  assert.equal(refresh.disabled, false);
  requests[1].reject(new Error("暂时不可用"));
  await setImmediate();
  assertQuota("额度查询失败");
  assert.equal(refresh.getAttribute("aria-disabled"), null);

  refresh.dispatchEvent(new Event("click"));
  assert.equal(requests.length, 3);
  node("#disconnectButton").dispatchEvent(new Event("click"));
  requests[2].resolve({ remaining: 99, currency: "USD" });
  await setImmediate();
  assert.equal(node("#connectionQuotaRow").hidden, true);
  assert.equal(refresh.hidden, true);
  assert.equal(node("#apiQuotaValue").textContent, "连接中心");
  assert.equal(node("#apiQuotaDetail").textContent, "");
});

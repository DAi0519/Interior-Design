/**
 * [INPUT]: 依赖 node:test/assert、config-refresh 的实际配置加载/刷新与内存DOM/API替身
 * [OUTPUT]: 对外提供质感固定Prompt版本/上架显示、共享刷新分派、旧服务缺配置和读取失败可见及恢复合同测试
 * [POS]: test 的质感增强飞书Prompt前端合同测试，不读取真实飞书或提交模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { bindConfigRefresh } from "../public/config-refresh.js";

function configFixture(t) {
  const previousDocument = globalThis.document;
  const nodes = new Map(), listeners = new Map(), calls = [], seen = [], toasts = [];
  const element = () => {
    const classes = new Set();
    return { classes, textContent: "", hidden: false, classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
    } };
  };
  const label = { textContent: "刷新" };
  const button = { ...element(), disabled: false, setAttribute() {}, removeAttribute() {},
    addEventListener(name, callback) { listeners.set(name, callback); }, querySelector: () => label };
  globalThis.document = { querySelectorAll: () => [button], querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  } };
  t.after(() => { globalThis.document = previousDocument; });
  let failure = null;
  let body = { textureEnhancementPrompt: { available: true, published: true, version: 1 },
    smartDefault: { available: true, version: 1 }, styles: [], promptAgent: { versions: [] }, refinedPrompt: { versions: [] } };
  const load = bindConfigRefresh({ api: async (path) => { calls.push(path); if (failure) throw failure; return body; },
    onTextureEnhancementPrompt(config) { seen.push(config); },
    onEmptyRoom() {}, onStyles() {}, onSmartDefault() {}, onPromptAgentVersions() {}, onRefinedPromptVersions() {},
    showToast(message) { toasts.push(message); },
  });
  return { load, seen, calls, toasts, button, nodes, get body() { return body; },
    setBody(value) { body = value; }, fail(value) { failure = value; }, refresh: () => listeners.get("click")() };
}

test("质感固定Prompt只显示上架版本，刷新后分派新版本而不提供正文编辑或版本选择", async (t) => {
  const fixture = configFixture(t);
  await fixture.load();
  assert.equal(fixture.seen.at(-1).version, 1);
  const availability = fixture.nodes.get("#texturePromptAvailability");
  const note = fixture.nodes.get("#texturePromptNote");
  assert.equal(availability.textContent, "Prompt v1 · 已上架");
  assert.equal(availability.classes.has("ready"), true);
  assert.equal(note.hidden, true);
  assert.equal(note.classes.has("error"), false);
  const markup = fixture.nodes.get("#textureEnhancementSection").innerHTML;
  assert.match(markup, /data-config-refresh/);
  assert.doesNotMatch(markup, /<textarea|<select|Prompt 正文/);
  fixture.setBody({ ...fixture.body, textureEnhancementPrompt: { available: true, version: 2 } });
  await fixture.refresh();
  assert.equal(fixture.seen.at(-1).version, 2);
  assert.equal(availability.textContent, "Prompt v2 · 已上架");
  assert.deepEqual(fixture.calls, ["/api/styles", "/api/config/refresh"]);
  assert.match(fixture.toasts.at(-1), /质感增强 Prompt v2/);
  assert.equal(fixture.button.disabled, false);
});

test("旧服务缺质感配置和读取失败显式不可用，恢复后清除错误", async (t) => {
  const fixture = configFixture(t);
  const { textureEnhancementPrompt: _removed, ...oldBody } = fixture.body;
  fixture.setBody(oldBody);
  await fixture.load();
  assert.equal(fixture.seen.at(-1).available, false);
  assert.match(fixture.seen.at(-1).reason, /当前服务尚未提供质感增强 Prompt 配置/);
  const note = fixture.nodes.get("#texturePromptNote");
  assert.equal(note.hidden, false);
  assert.equal(note.classes.has("error"), true);
  fixture.fail(new Error("质感Prompt读取失败"));
  await fixture.load();
  assert.equal(fixture.seen.at(-1).available, false);
  assert.equal(fixture.seen.at(-1).reason, "质感Prompt读取失败");
  assert.match(note.textContent, /质感Prompt读取失败/);
  fixture.fail(null);
  fixture.setBody({ ...oldBody, textureEnhancementPrompt: { available: true, version: 3 } });
  await fixture.load();
  assert.equal(fixture.seen.at(-1).available, true);
  assert.equal(note.textContent, "");
  assert.equal(note.hidden, true);
  assert.equal(note.classes.has("error"), false);
});

/**
 * [INPUT]: 依赖 node:test/assert、精模 Prompt 版本控制器与内存 DOM/sessionStorage 替身
 * [OUTPUT]: 对外提供已上架目录过滤、失效版本回退、刷新下架清理和有效选择记忆的回归保障
 * [POS]: test 的精模 Prompt 下拉状态测试，不启动浏览器或发送外部请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { bindRefinedPromptVersionSelect } from "../public/refined-prompt-version-select.js";

const STORAGE_KEY = "canvas-lab.refined-prompt-version";
const version = (number, published = true) => ({
  name: "精模忠实渲染",
  published,
  version: number,
});

function createFixture(t, rememberedVersion = null) {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.sessionStorage;
  const storage = new Map(rememberedVersion == null
    ? [] : [[STORAGE_KEY, String(rememberedVersion)]]);
  const classes = new Set();
  const listeners = new Map();
  const availability = {
    textContent: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const note = { textContent: "" };
  const select = {
    children: [],
    disabled: false,
    addEventListener(name, listener) { listeners.set(name, listener); },
    replaceChildren(...children) { this.children = children; },
  };
  globalThis.document = { createElement: () => ({}) };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, value),
  };
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.sessionStorage = originalStorage;
  });
  return {
    availability,
    classes,
    controller: bindRefinedPromptVersionSelect({ availability, note, select }),
    note,
    select,
    storage,
    change: (value) => listeners.get("change")({ target: { value } }),
  };
}

test("记忆中的下架版本回退到有效默认版本，目录只显示明确已上架项", (t) => {
  const fixture = createFixture(t, 1);
  fixture.controller.render({
    defaultVersion: 2,
    versions: [version(1, false), version(3), version(2), version(4, "true")],
  });
  assert.deepEqual(fixture.select.children.map((entry) => entry.value), ["3", "2"]);
  assert.deepEqual(fixture.select.children.map((entry) => entry.selected), [false, true]);
  assert.equal(fixture.controller.value(), 2);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  assert.equal(fixture.availability.textContent, "已上架");
  assert.equal(fixture.classes.has("ready"), true);
  assert.equal(fixture.select.disabled, false);
  assert.doesNotMatch(fixture.note.textContent, /测试中|内部测试|尚未上架/);
});

test("刷新剔除当前下架版本并把选择和存储回退到最高已上架版本", (t) => {
  const fixture = createFixture(t, 3);
  fixture.controller.render({ defaultVersion: 3, versions: [version(3), version(2)] });
  fixture.controller.render({ defaultVersion: 3, versions: [version(3, false), version(2)] });
  assert.deepEqual(fixture.select.children.map((entry) => entry.value), ["2"]);
  assert.equal(fixture.select.children[0].selected, true);
  assert.equal(fixture.controller.value(), 2);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  assert.match(fixture.note.textContent, /当前使用 v2/);
});

test("全部下架时清空旧选择和存储并禁用下拉", (t) => {
  const fixture = createFixture(t, 2);
  fixture.controller.render({ defaultVersion: 2, versions: [version(2)] });
  fixture.controller.render({ defaultVersion: 2, versions: [version(2, false)] });
  assert.deepEqual(fixture.select.children, []);
  assert.equal(fixture.controller.value(), null);
  assert.equal(fixture.storage.has(STORAGE_KEY), false);
  assert.equal(fixture.select.disabled, true);
  assert.equal(fixture.availability.textContent, "未配置");
  assert.equal(fixture.classes.has("ready"), false);
  assert.match(fixture.note.textContent, /暂无可用/);
});

for (const defaultVersion of [99, 4, null]) {
  test(`默认版本 ${defaultVersion} 不可用时回退到最高已上架版本`, (t) => {
    const fixture = createFixture(t);
    fixture.controller.render({ defaultVersion, versions: [version(2), version(4, false), version(3)] });
    assert.equal(fixture.controller.value(), 3);
    assert.equal(fixture.storage.get(STORAGE_KEY), "3");
  });
}

test("当前选择仍已上架时，刷新和默认版本变化保留用户选择", (t) => {
  const fixture = createFixture(t, 2);
  fixture.controller.render({ defaultVersion: 3, versions: [version(3), version(2)] });
  fixture.controller.render({ defaultVersion: 4, versions: [version(4), version(2)] });
  assert.equal(fixture.controller.value(), 2);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  assert.deepEqual(fixture.select.children.map((entry) => entry.selected), [false, true]);
});

test("用户切换已上架版本后即时记忆且后续渲染保持选择", (t) => {
  const fixture = createFixture(t);
  fixture.controller.render({ defaultVersion: 3, versions: [version(3), version(2)] });
  fixture.change("2");
  assert.equal(fixture.controller.value(), 2);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  assert.deepEqual(fixture.select.children.map((entry) => entry.selected), [false, true]);
  assert.deepEqual(fixture.select.children.map((entry) => entry.textContent), [
    "精模忠实渲染 · v3", "精模忠实渲染 · v2",
  ]);
});

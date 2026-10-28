/**
 * [INPUT]: 依赖 node:test/assert、精模 Prompt 版本控制器与内存 DOM/sessionStorage 替身
 * [OUTPUT]: 对外提供基础版本独立记忆/目录回退、上传光影迁移只读版本及不污染基础记忆、普通说明清空与真实错误显隐回归
 * [POS]: test 的精模 Prompt 下拉状态测试，不启动浏览器或发送外部请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { bindRefinedPromptVersionSelect } from "../public/refined-prompt-version-select.js";

const STORAGE_KEY = "canvas-lab.refined-lighting-base-version";
const version = (number, published = true) => ({
  name: "精模忠实渲染",
  published,
  version: number,
});

function createFixture(t, rememberedVersion = null, legacyVersion = null) {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.sessionStorage;
  const storage = new Map(rememberedVersion == null
    ? [] : [[STORAGE_KEY, String(rememberedVersion)]]);
  if (legacyVersion != null) storage.set("canvas-lab.refined-prompt-version", String(legacyVersion));
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
  const noteClasses = new Set();
  const note = { textContent: "", classList: { toggle(name, enabled) {
    if (enabled) noteClasses.add(name); else noteClasses.delete(name);
  } } };
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
    noteClasses,
    select,
    storage,
    change: (value) => listeners.get("change")({ target: { value } }),
  };
}

test("新基础版本不读取旧精模版本记忆", (t) => {
  const fixture = createFixture(t, null, 10);
  fixture.controller.render({ defaultVersion: 1, versions: [version(10), version(1)] });
  assert.equal(fixture.controller.value(), 1);
  assert.equal(fixture.storage.get(STORAGE_KEY), "1");
  assert.equal(fixture.storage.get("canvas-lab.refined-prompt-version"), "10");
});

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
  assert.equal(fixture.note.textContent, "");
  assert.equal(fixture.note.hidden, true);
  assert.equal(fixture.noteClasses.has("error"), false);
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
  assert.equal(fixture.note.hidden, false);
  assert.equal(fixture.noteClasses.has("error"), true);
  fixture.controller.render({ defaultVersion: 2, versions: [version(2)] });
  assert.equal(fixture.note.hidden, true);
  assert.equal(fixture.note.textContent, "");
  assert.equal(fixture.noteClasses.has("error"), false);
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

test("上传使用专用光影迁移版本，基础配置刷新不覆盖或污染基础版本记忆", t => {
  const fixture = createFixture(t, 2);
  const reference = { referenceAvailable: true, referenceRuleVersion: 1, referenceRuleSha256: "a".repeat(64) };
  fixture.controller.render({ defaultVersion: 3, versions: [version(3), version(2)] });
  fixture.controller.setReferenceConfig(reference);
  assert.equal(fixture.controller.value(), 1);
  assert.equal(fixture.select.disabled, true);
  assert.deepEqual(fixture.select.children.map(entry => entry.textContent), ["参考图光影迁移 · v1"]);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  fixture.change("3");
  assert.equal(fixture.controller.value(), 1, "禁用版本事件不能切回基础Prompt");
  fixture.controller.render({ available: false, versions: [] });
  assert.equal(fixture.controller.value(), 1, "基础Prompt不可用不影响上传专用Prompt");
  assert.equal(fixture.note.hidden, true);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  fixture.controller.render({ defaultVersion: 3, versions: [version(3), version(2)] });
  fixture.controller.setReferenceConfig(null);
  assert.equal(fixture.controller.value(), 2);
  assert.equal(fixture.select.disabled, false);
});

test("上传专用Prompt缺失时明确报错，不回退基础Prompt，恢复后仍为只读", t => {
  const fixture = createFixture(t, 2);
  fixture.controller.render({ defaultVersion: 2, versions: [version(2)] });
  fixture.controller.setReferenceConfig({ referenceAvailable: false, referenceReason: "迁移Prompt已下架" });
  assert.equal(fixture.controller.value(), null);
  assert.equal(fixture.select.disabled, true);
  assert.deepEqual(fixture.select.children, []);
  assert.match(fixture.note.textContent, /迁移Prompt已下架/);
  assert.equal(fixture.noteClasses.has("error"), true);
  assert.equal(fixture.storage.get(STORAGE_KEY), "2");
  fixture.controller.setReferenceConfig({ referenceAvailable: true, referenceRuleVersion: 1, referenceRuleSha256: "a".repeat(64) });
  assert.equal(fixture.controller.value(), 1);
  assert.equal(fixture.note.hidden, true);
  assert.equal(fixture.select.disabled, true);
});

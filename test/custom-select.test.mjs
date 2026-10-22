/**
 * [INPUT]: 依赖 node:test/assert、node:fs/promises、custom-select.js 原生适配器、choice-select 指针稳定器及共享视觉入口
 * [OUTPUT]: 验证主指针焦点、辅助按键、共享视觉真源和无独立菜单实现，以及搜索单选的原生值/change/动态选项/禁用和空占位合同
 * [POS]: test 的跨浏览器自定义下拉竞态与搜索单选原生适配回归测试，不启动浏览器或真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { enhanceSearchableSelect, stabilizePointerFocus } from "../public/custom-select.js";

function searchableSelectFixture() {
  const listeners = new Map();
  const classes = new Set();
  let observerCallback;
  let observed;
  let binding;
  const renders = [];
  const disabled = [];
  const root = { hidden: false };
  const picker = {
    render(catalog, keys) { renders.push({ catalog, keys }); },
    setDisabled(value) { disabled.push(value); },
  };
  const select = {
    classList: { contains: (name) => classes.has(name) },
    dataset: { placeholder: "请选择平台风格", searchPlaceholder: "搜索风格名称" },
    disabled: false,
    hidden: false,
    options: [
      { value: "", textContent: "请选择平台风格" },
      { value: "modern", textContent: "现代简约" },
      { value: "minimal", textContent: "极简主义", disabled: true },
    ],
    value: "",
    ownerDocument: {
      createElement: () => root,
      defaultView: {
        MutationObserver: class {
          constructor(callback) { observerCallback = callback; }
          observe(target, options) { observed = { target, options }; }
        },
      },
    },
    getAttribute: (name) => name === "aria-label" ? "平台风格" : null,
    insertAdjacentElement(position, element) { assert.equal(position, "afterend"); assert.equal(element, root); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatchEvent(event) { this.changeEvents.push(event); listeners.get(event.type)?.(event); },
    changeEvents: [],
  };
  const controller = enhanceSearchableSelect(select, (options) => { binding = options; return picker; });
  return { binding, classes, controller, disabled, observed, renders, root, select,
    mutate: () => observerCallback() };
}

test("搜索风格仅单选，空值显示占位且选择同步原生 change", () => {
  const ui = searchableSelectFixture();
  assert.equal(ui.binding.multiple, false);
  assert.equal(ui.binding.label, "平台风格");
  assert.equal(ui.binding.placeholder, "请选择平台风格");
  assert.equal(ui.binding.searchPlaceholder, "搜索风格名称");
  assert.deepEqual(ui.renders.at(-1).keys, []);
  assert.deepEqual(ui.renders.at(-1).catalog.map((option) => option.key), ["modern", "minimal"]);
  assert.equal(ui.binding.presentOption(ui.renders.at(-1).catalog[1]).selectable, false);

  ui.binding.onChange(["modern"]);
  assert.equal(ui.select.value, "modern");
  assert.deepEqual(ui.renders.at(-1).keys, ["modern"]);
  assert.equal(ui.select.changeEvents.length, 1);
  assert.equal(ui.select.changeEvents[0].bubbles, true);
  ui.binding.onChange(["minimal"]);
  ui.binding.onChange([""]);
  ui.binding.onChange(["missing"]);
  assert.equal(ui.select.value, "modern");
  assert.equal(ui.select.changeEvents.length, 1);
});

test("原生选项动态替换、禁用与隐藏同步，外部恢复仍由 change 驱动", () => {
  const ui = searchableSelectFixture();
  assert.equal(ui.observed.target, ui.select);
  assert.deepEqual(ui.observed.options, { attributes: true, childList: true, subtree: true });
  ui.select.options = [
    { value: "", textContent: "请选择平台风格" },
    { value: "warm", textContent: "温暖自然" },
    { value: "hidden", textContent: "已下架", hidden: true },
    { value: "grouped", textContent: "禁用分组", parentElement: { disabled: true } },
  ];
  ui.select.value = "warm";
  ui.mutate();
  assert.deepEqual(ui.renders.at(-1).catalog.map((option) => option.key), ["warm", "grouped"]);
  assert.deepEqual(ui.renders.at(-1).keys, ["warm"]);
  ui.binding.onChange(["grouped"]);
  assert.equal(ui.select.changeEvents.length, 0);

  ui.select.disabled = true;
  ui.mutate();
  assert.equal(ui.disabled.at(-1), true);
  ui.binding.onChange(["warm"]);
  assert.equal(ui.select.changeEvents.length, 0);
  ui.select.disabled = false;
  ui.select.value = "";
  ui.select.dispatchEvent(new Event("change"));
  assert.equal(ui.disabled.at(-1), false);
  assert.deepEqual(ui.renders.at(-1).keys, []);
  ui.classes.add("hidden");
  ui.mutate();
  assert.equal(ui.root.hidden, true);
  assert.equal(ui.disabled.at(-1), true);
  ui.classes.delete("hidden");
  ui.select.hidden = true;
  ui.mutate();
  assert.equal(ui.root.hidden, true);
});

test("主指针按下时在 click 前固定目标选项焦点", () => {
  let prevented = 0;
  let focusOptions = null;
  const stabilized = stabilizePointerFocus(
    {
      button: 0,
      isPrimary: true,
      preventDefault() {
        prevented += 1;
      },
    },
    {
      focus(options) {
        focusOptions = options;
      },
    },
  );

  assert.equal(stabilized, true);
  assert.equal(prevented, 1);
  assert.deepEqual(focusOptions, { preventScroll: true });
});

test("辅助按键不会抢占下拉选项焦点", () => {
  let touched = false;
  const stabilized = stabilizePointerFocus(
    {
      button: 2,
      isPrimary: true,
      preventDefault() {
        touched = true;
      },
    },
    {
      focus() {
        touched = true;
      },
    },
  );

  assert.equal(stabilized, false);
  assert.equal(touched, false);
});

test("下拉统一加载组件视觉真源并保持完整标签与单行省略", async () => {
  const [entry, css] = await Promise.all([
    readFile(new URL("../public/custom-select.css", import.meta.url), "utf8"),
    readFile(new URL("../public/choice-select.css", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /@import url\(".\/choice-select.css/);
  assert.doesNotMatch(css, /max-width:\s*55%/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /\.model-picker-option.selected\s*\{[^}]*background: var\(--select-selected-bg\)[^}]*color: var\(--select-selected-ink\)/s);
  assert.match(css, /--select-menu-bg: #fcfcfd/);
});

test("普通单选也委托共享组件，不再持有独立菜单渲染", async () => {
  const script = await readFile(new URL("../public/custom-select.js", import.meta.url), "utf8");
  assert.match(script, /placement: select.dataset.dropdownPlacement/);
  assert.match(script, /searchable: select.dataset.searchable === "true"/);
  assert.doesNotMatch(script, /createElement\("button"\)|function open\(/);
});

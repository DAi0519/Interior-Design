/**
 * [INPUT]: 依赖 node:test/assert、node:fs/promises、custom-select.js 指针焦点稳定器与 custom-select.css 文字布局契约
 * [OUTPUT]: 验证主指针在 click 前固定选项焦点、辅助按键不篡改焦点、选项文字不受内容宽度百分比二次裁切
 * [POS]: test 的跨浏览器自定义下拉竞态回归测试，不启动浏览器或修改原生 select
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { stabilizePointerFocus } from "../public/custom-select.js";

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

test("下拉文案使用真实剩余宽度而不是内容宽度的固定百分比", async () => {
  const stylesheet = await readFile(
    new URL("../public/custom-select.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(stylesheet, /max-width:\s*55%/);
  assert.match(stylesheet, /\.custom-select-value\s*\{[^}]*flex:\s*1 1 auto/s);
  assert.match(stylesheet, /\.custom-select-option\s*>\s*span\s*\{[^}]*flex:\s*1 1 auto/s);
});

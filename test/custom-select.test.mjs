/**
 * [INPUT]: 依赖 node:test/assert 与 custom-select.js 导出的指针焦点稳定器
 * [OUTPUT]: 验证主指针在 click 前固定选项焦点，辅助按键不篡改焦点
 * [POS]: test 的跨浏览器自定义下拉竞态回归测试，不启动浏览器或修改原生 select
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
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

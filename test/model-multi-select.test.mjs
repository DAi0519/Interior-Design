/**
 * [INPUT]: 依赖 node:test/assert 与出图模型多选纯规则
 * [OUTPUT]: 对外提供至少一项、最多四项、去重和取消选择回归保障
 * [POS]: test 的模型选择单元测试，不创建 DOM
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { toggleModelSelection } from "../public/model-multi-select.js";

test("同一模型入口允许一到四项并阻止第五项", () => {
  assert.deepEqual(toggleModelSelection(["a"], "b").values, ["a", "b"]);
  assert.equal(toggleModelSelection(["a"], "a").changed, false);
  const limited = toggleModelSelection(["a", "b", "c", "d"], "e");
  assert.equal(limited.changed, false);
  assert.match(limited.message, /最多选择 4 个/);
});

test("再次点击已选模型会取消且保持原有顺序", () => {
  assert.deepEqual(
    toggleModelSelection(["a", "b", "c"], "b"),
    { changed: true, message: null, values: ["a", "c"] },
  );
});

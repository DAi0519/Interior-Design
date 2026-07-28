/**
 * [INPUT]: 依赖 node:test/assert 与 public/image-ratio.js 的纯比例工具
 * [OUTPUT]: 对外提供原图比例展示、模型默认值与最近合法比例选择回归保障
 * [POS]: test 的浏览器画幅纯函数测试，不启动 DOM 或读取本地图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  nearestSupportedRatio,
  sourceAspectLabel,
} from "../public/image-ratio.js";

const model = {
  defaultRatio: "4:3",
  sizes: {
    "1:1": {},
    "4:3": {},
    "9:16": {},
    "16:9": {},
  },
};

test("浏览器按原图选择最近合法比例", () => {
  assert.equal(
    nearestSupportedRatio(model, { height: 923, width: 491 }),
    "9:16",
  );
  assert.equal(
    nearestSupportedRatio(model, { height: 900, width: 1600 }),
    "16:9",
  );
  assert.equal(nearestSupportedRatio(model, null), "4:3");
});

test("常见比例使用整数标签，非标准比例使用紧凑小数", () => {
  assert.equal(sourceAspectLabel({ height: 900, width: 1600 }), "16:9");
  assert.equal(sourceAspectLabel({ height: 923, width: 491 }), "0.53:1");
});

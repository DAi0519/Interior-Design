/**
 * [INPUT]: 依赖 node:test/assert 与 Beta跑图 Run ID 日期时间格式化纯函数
 * [OUTPUT]: 对外提供飞书分组时间、本地测试时间主体、批内唯一序号、模型定位和非法输入拒绝的回归保障
 * [POS]: test 的 Beta跑图追溯标识合同测试，不访问浏览器、模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createBetaRunId,
  formatBetaRunTimestamp,
  formatBetaTestTime,
} from "../public/beta-run-id.js";

test("Run ID 以本地测试日期时间为主体并保留批内定位", () => {
  const startedAt = new Date(2026, 8, 1, 18, 9, 45, 123);
  assert.equal(formatBetaRunTimestamp(startedAt), "20260901-180945-123");
  assert.equal(formatBetaTestTime(startedAt), "2026-09-01 18:09:45");
  assert.equal(createBetaRunId({
    modelKey: "flux2klein",
    sequence: 3,
    startedAt,
  }), "RUN-20260901-180945-123-003-flux2klein");
});

test("同一测试时间用批内序号区分 Run 并清理模型键", () => {
  const startedAt = new Date(2026, 8, 1, 18, 9, 45, 123);
  const first = createBetaRunId({ modelKey: "flux2_klein", sequence: 1, startedAt });
  const second = createBetaRunId({ modelKey: "flux2_klein", sequence: 2, startedAt });
  assert.equal(first, "RUN-20260901-180945-123-001-flux2klein");
  assert.equal(second, "RUN-20260901-180945-123-002-flux2klein");
  assert.notEqual(first, second);
});

test("Run ID 拒绝无效测试时间、序号和模型键", () => {
  assert.throws(() => formatBetaRunTimestamp("invalid"), /测试时间无效/);
  assert.throws(() => formatBetaTestTime("invalid"), /测试时间无效/);
  assert.throws(() => createBetaRunId({ modelKey: "flux", sequence: 0 }), /正整数/);
  assert.throws(() => createBetaRunId({ modelKey: "___", sequence: 1 }), /模型键不能为空/);
});

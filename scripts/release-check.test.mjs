/**
 * [INPUT]: 依赖 node:test/assert 与 release-check 的 macOS 启动权限及可注入有限重试边界
 * [OUTPUT]: 对外提供启动权限、瞬时失败恢复、连续失败阻断与重试间隔回归保障
 * [POS]: scripts 的发布准入重试单元测试，不执行真实 Git、npm、网络或等待
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMacLauncherMode,
  runCommandWithRetries,
} from "./release-check.mjs";

test("macOS 双击入口必须保留 Git 可执行权限", () => {
  assert.doesNotThrow(() => assertMacLauncherMode("100755"));
  assert.throws(() => assertMacLauncherMode("100644"), /可执行权限/);
});

test("有限重试会恢复两次瞬时失败", async () => {
  const labels = [];
  const pauses = [];
  const result = await runCommandWithRetries("依赖审计", "npm", ["audit"], {
    attempts: 3,
    pause: async (milliseconds) => pauses.push(milliseconds),
    run(label) {
      labels.push(label);
      if (labels.length < 3) throw new Error("network timeout");
      return "ok";
    },
  });

  assert.equal(result, "ok");
  assert.deepEqual(pauses, [1_000, 2_000]);
  assert.deepEqual(labels, [
    "依赖审计",
    "依赖审计（重试 2/3）",
    "依赖审计（重试 3/3）",
  ]);
});

test("连续失败达到上限后仍阻断发布", async () => {
  let calls = 0;
  await assert.rejects(
    runCommandWithRetries("干净安装", "npm", ["ci"], {
      attempts: 2,
      pause: async () => {},
      run() {
        calls += 1;
        throw new Error("still offline");
      },
    }),
    /still offline/,
  );
  assert.equal(calls, 2);
});

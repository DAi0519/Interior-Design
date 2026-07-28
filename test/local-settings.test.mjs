/**
 * [INPUT]: 依赖 node:test/assert/fs/os/path 与 local-settings.mjs 的本机配置纯函数和文件操作
 * [OUTPUT]: 验证未知环境项保留、Key 原子写入/删除、格式校验与持久化状态
 * [POS]: test 的本机设置回归测试，在系统临时目录运行且不读取真实 .env.local
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  envValue,
  hasPersistedOneApiKey,
  persistOneApiKey,
  removePersistedOneApiKey,
  updateEnvValue,
} from "../src/local-settings.mjs";

test("环境项更新保留注释与未知配置", () => {
  const source = "# local\nPORT=4173\nOTHER=value\n";
  const updated = updateEnvValue(source, "ONEAPI_API_KEY", "sk-valid_key-123");
  assert.equal(envValue(updated, "PORT"), "4173");
  assert.equal(envValue(updated, "OTHER"), "value");
  assert.equal(envValue(updated, "ONEAPI_API_KEY"), "sk-valid_key-123");
  assert.match(updated, /^# local/m);
});

test("OneAPI Key 写入、覆盖与删除只影响目标环境项", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-lab-settings-test-"));
  const filePath = join(directory, ".env.local");
  try {
    await writeFile(filePath, "PORT=4173\nOTHER=keep\n", "utf8");
    assert.equal(await hasPersistedOneApiKey(filePath), false);

    await persistOneApiKey("sk-first_key-123", filePath);
    assert.equal(await hasPersistedOneApiKey(filePath), true);
    assert.equal(
      envValue(await readFile(filePath, "utf8"), "ONEAPI_API_KEY"),
      "sk-first_key-123",
    );

    await persistOneApiKey("sk-second_key-456", filePath);
    await removePersistedOneApiKey(filePath);
    const finalSource = await readFile(filePath, "utf8");
    assert.equal(envValue(finalSource, "ONEAPI_API_KEY"), "");
    assert.equal(envValue(finalSource, "PORT"), "4173");
    assert.equal(envValue(finalSource, "OTHER"), "keep");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("本机设置拒绝保存格式错误的 Key", async () => {
  await assert.rejects(
    persistOneApiKey("not-a-key", join(tmpdir(), "unused-canvas-lab-env")),
    /格式不正确/,
  );
});

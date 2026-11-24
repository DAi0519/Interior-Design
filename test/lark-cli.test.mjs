/**
 * [INPUT]: 依赖 node:test/assert 与 lark-cli.mjs 的路径选择和版本校验纯函数
 * [OUTPUT]: 验证项目本地 CLI 优先、Windows 原生可执行文件和显式路径覆盖，以及过旧版本明确阻断
 * [POS]: test 的飞书 CLI 运行时契约测试，不执行真实 CLI 或访问飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLarkCliVersion,
  resolveLarkCliPath,
} from "../src/lark-cli.mjs";

test("飞书操作优先使用项目固定安装的 CLI", () => {
  assert.equal(resolveLarkCliPath("/custom/lark-cli"), "/custom/lark-cli");
  assert.equal(resolveLarkCliPath("lark-cli", {
    fileExists: () => true,
    platform: "darwin",
    projectCliPath: "/project/node_modules/.bin/lark-cli",
  }), "/project/node_modules/.bin/lark-cli");
  assert.equal(resolveLarkCliPath("lark-cli", {
    fileExists: () => false,
    platform: "darwin",
    projectCliPath: "/project/node_modules/.bin/lark-cli",
  }), "lark-cli");
});

test("Windows 飞书操作选择固定版本原生 exe 并保留显式覆盖", () => {
  const available = resolveLarkCliPath("lark-cli", { platform: "win32", fileExists: () => true });
  assert.match(available, /node_modules[/\\]@larksuite[/\\]cli[/\\]bin[/\\]lark-cli\.exe$/);
  assert.equal(resolveLarkCliPath("lark-cli", { platform: "win32", fileExists: () => false }), "lark-cli.exe");
  const customPath = "C:\\Company Tools\\lark-cli.exe";
  assert.equal(resolveLarkCliPath(customPath, { platform: "win32" }), customPath);
});

test("过旧 lark-cli 在访问飞书前给出明确恢复动作", () => {
  assert.equal(assertLarkCliVersion("lark-cli version 1.0.77"), "1.0.77");
  assert.equal(assertLarkCliVersion("lark-cli version 1.1.0"), "1.1.0");
  assert.throws(
    () => assertLarkCliVersion("lark-cli version 1.0.71"),
    /低于项目要求 1\.0\.77.*npm install/,
  );
});

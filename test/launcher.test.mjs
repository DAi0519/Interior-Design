/**
 * [INPUT]: 依赖 node:test/assert 与 launcher.mjs 的 Node、端口、依赖摘要及服务就绪纯规则
 * [OUTPUT]: 对外提供一键启动版本门槛、配置优先级、重复安装避免和有限轮询回归保障
 * [POS]: test 的跨平台启动器测试，不安装依赖、不启动服务、不打开浏览器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSupportedNode,
  hasLarkAppConfiguration,
  packageLockDigest,
  resolvePort,
  shouldInstallDependencies,
  waitForCanvasLab,
} from "../launcher.mjs";

test("启动器只接受 Node.js 24 及以上版本", () => {
  assert.equal(assertSupportedNode("24.3.0"), 24);
  assert.equal(assertSupportedNode("26.0.0"), 26);
  assert.throws(() => assertSupportedNode("22.9.0"), /Node\.js 24/);
});

test("环境变量覆盖本机配置端口并拒绝非法值", () => {
  assert.equal(resolvePort({ envFileText: "PORT=4317\n" }), 4317);
  assert.equal(resolvePort({
    envFileText: "PORT=4317\n",
    environmentPort: "5000",
  }), 5000);
  assert.equal(resolvePort({ envFileText: "PORT='4173'\n" }), 4173);
  assert.throws(() => resolvePort({ environmentPort: "0" }), /1-65535/);
});

test("package-lock 摘要未变化时跳过重复 npm ci", () => {
  const digest = packageLockDigest(Buffer.from("lock"));
  assert.equal(shouldInstallDependencies({
    currentDigest: digest,
    markerDigest: `${digest}\n`,
  }), false);
  assert.equal(shouldInstallDependencies({
    currentDigest: digest,
    markerDigest: "old",
  }), true);
});

test("飞书 CLI 只接受包含真实 appId 的应用配置", () => {
  assert.equal(hasLarkAppConfiguration('{"appId":"cli_123","appSecret":"****"}'), true);
  assert.equal(hasLarkAppConfiguration('{"appId":""}'), false);
  assert.equal(hasLarkAppConfiguration("Config file not found"), false);
});

test("服务就绪轮询只接受 Canvas Lab 模型目录", async () => {
  let attempts = 0;
  const ready = await waitForCanvasLab("http://127.0.0.1:4173", {
    attempts: 3,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("not ready");
      return {
        json: async () => attempts === 2 ? {} : { models: [] },
        ok: true,
      };
    },
    pauseImpl: async () => {},
  });
  assert.equal(ready, true);
  assert.equal(attempts, 3);
});

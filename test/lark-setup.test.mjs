/**
 * [INPUT]: 依赖 node:test/assert、lark-setup.mjs 的状态解析/Setup 服务/注入式 CLI 执行器与浏览器授权中文解释器
 * [OUTPUT]: 验证 CLI/用户/字段读取 Scope/Base 状态、中文授权能力、非阻塞授权、二维码和过期登录尝试
 * [POS]: test 的飞书首次运行回归测试，不发起真实授权或访问真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_LARK_SCOPES,
  createLarkSetupService,
  parseJsonObject,
  publicAuthStatus,
} from "../src/lark-setup.mjs";
import { larkCliEnvironment } from "../src/lark-cli.mjs";
import { describeMissingLarkScopes } from "../public/lark-permission-labels.js";

function readyAuthEnvelope() {
  return {
    identities: {
      user: {
        available: true,
        scope: REQUIRED_LARK_SCOPES.join(" "),
        status: "ready",
        tokenStatus: "valid",
        userName: "运营用户",
        verified: true,
      },
    },
  };
}

test("CLI 配置输出尾部包含路径时仍能提取 JSON", () => {
  assert.deepEqual(
    parseJsonObject('{"appId":"cli_demo","appSecret":"****"}\nConfig path: /tmp/config'),
    { appId: "cli_demo", appSecret: "****" },
  );
});

test("飞书 CLI 子进程不会继承 OneAPI Key", () => {
  assert.deepEqual(
    larkCliEnvironment({
      ONEAPI_API_KEY: "sk-private",
      PATH: "/usr/bin",
    }),
    {
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
      PATH: "/usr/bin",
    },
  );
});

test("飞书身份公开状态只返回显示名与缺失 Scope", () => {
  const body = readyAuthEnvelope();
  body.identities.user.scope = "base:record:read";
  assert.deepEqual(publicAuthStatus(body), {
    loggedIn: true,
    missingScopes: REQUIRED_LARK_SCOPES.filter(
      (scope) => scope !== "base:record:read",
    ),
    tokenValid: true,
    userName: "运营用户",
  });
});

test("飞书同步授权契约包含字段读取最小权限", () => {
  assert.deepEqual(REQUIRED_LARK_SCOPES, [
    "base:field:read",
    "base:record:read",
    "base:record:create",
    "base:record:update",
    "docs:document.media:upload",
  ]);

  const body = readyAuthEnvelope();
  body.identities.user.scope = REQUIRED_LARK_SCOPES
    .filter((scope) => scope !== "base:field:read")
    .join(" ");
  assert.deepEqual(publicAuthStatus(body).missingScopes, ["base:field:read"]);
  assert.deepEqual(describeMissingLarkScopes(["base:field:read"]), [
    "读取多维表格字段",
  ]);
});

test("Setup 状态分层验证 CLI、用户 Scope 与共享 Base", async () => {
  const run = async (_cliPath, args) => {
    if (args[0] === "--version") return { stdout: "lark-cli version 1.0.77" };
    if (args[0] === "config") return { stdout: '{"appId":"cli_demo"}' };
    if (args[0] === "auth" && args[1] === "status") {
      return { stdout: JSON.stringify(readyAuthEnvelope()) };
    }
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };
  const service = createLarkSetupService({ run });
  let verified = 0;
  const status = await service.status({
    verifyBase: async () => {
      verified += 1;
    },
  });
  assert.equal(status.cli.installed, true);
  assert.equal(status.cli.configured, true);
  assert.equal(status.user.loggedIn, true);
  assert.equal(status.base.readable, true);
  assert.equal(status.ready, true);
  assert.equal(verified, 1);
});

test("Device Flow 不返回 device code，并在用户确认后完成登录", async () => {
  const calls = [];
  const run = async (_cliPath, args) => {
    calls.push(args);
    if (args[0] === "--version") return { stdout: "lark-cli version 1.0.77" };
    if (args[0] === "config") return { stdout: '{"appId":"cli_demo"}' };
    if (args[0] === "auth" && args[1] === "status") {
      return { stdout: JSON.stringify(readyAuthEnvelope()) };
    }
    if (args.includes("--no-wait")) {
      return {
        stdout: JSON.stringify({
          device_code: "secret-device-code",
          expires_in: 600,
          verification_url: "https://example.test/device?opaque=1",
        }),
      };
    }
    if (args.includes("--device-code")) return { stdout: "authorized" };
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };
  const service = createLarkSetupService({
    qrCode: async () => "data:image/png;base64,AAAA",
    run,
  });
  const started = await service.startLogin();
  assert.equal(started.verificationUrl, "https://example.test/device?opaque=1");
  assert.equal(started.qrCodeDataUrl, "data:image/png;base64,AAAA");
  assert.equal("deviceCode" in started, false);
  const loginCall = calls.find(
    (args) => args[0] === "auth" && args[1] === "login",
  );
  assert.equal(
    loginCall[loginCall.indexOf("--scope") + 1],
    REQUIRED_LARK_SCOPES.join(" "),
  );

  const completed = await service.completeLogin(started.loginId, {
    verifyBase: async () => {},
  });
  assert.equal(completed.ready, true);
  assert.ok(calls.some((args) => args.includes("secret-device-code")));
});

test("过期的 Device Flow 不能继续使用", async () => {
  let currentTime = 1_000;
  const run = async (_cliPath, args) => {
    if (args[0] === "--version") return { stdout: "lark-cli version 1.0.77" };
    if (args[0] === "config") return { stdout: '{"appId":"cli_demo"}' };
    if (args.includes("--no-wait")) {
      return {
        stdout: JSON.stringify({
          device_code: "short-lived",
          expires_in: 60,
          verification_url: "https://example.test/short",
        }),
      };
    }
    throw new Error("unexpected");
  };
  const service = createLarkSetupService({
    now: () => currentTime,
    qrCode: async () => "data:image/png;base64,AAAA",
    run,
  });
  const started = await service.startLogin();
  currentTime += 61_000;
  await assert.rejects(
    service.completeLogin(started.loginId),
    /授权已过期/,
  );
});

test("新的 Device Flow 会让旧授权尝试失效", async () => {
  let sequence = 0;
  const run = async (_cliPath, args) => {
    if (args[0] === "--version") return { stdout: "lark-cli version 1.0.77" };
    if (args[0] === "config") return { stdout: '{"appId":"cli_demo"}' };
    if (args.includes("--no-wait")) {
      sequence += 1;
      return {
        stdout: JSON.stringify({
          device_code: `device-${sequence}`,
          expires_in: 600,
          verification_url: `https://example.test/${sequence}`,
        }),
      };
    }
    throw new Error("unexpected");
  };
  const service = createLarkSetupService({
    qrCode: async () => "data:image/png;base64,AAAA",
    run,
  });
  const first = await service.startLogin();
  await service.startLogin();
  await assert.rejects(
    service.completeLogin(first.loginId),
    /授权已过期/,
  );
});

test("CLI 二进制不可执行时状态降级为未安装", async () => {
  const service = createLarkSetupService({
    run: async () => {
      throw new Error("binary unavailable");
    },
  });
  const status = await service.status();
  assert.equal(status.cli.installed, false);
  assert.equal(status.ready, false);
});

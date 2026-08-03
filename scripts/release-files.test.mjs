/**
 * [INPUT]: 依赖 node:test/assert 与 release-files 的白名单、SemVer 和产物命名纯函数
 * [OUTPUT]: 对外提供运行文件准入、开发文件排除、必需文件与稳定命名回归保障
 * [POS]: scripts 的发布规则单元测试，不执行 Git、网络、安装或文件写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSemver,
  isReleaseFile,
  releaseArtifactNames,
  selectReleaseFiles,
} from "./release-files.mjs";

const required = [
  ".env.example",
  ".gitignore",
  "launcher.mjs",
  "README.md",
  "package-lock.json",
  "package.json",
  "public/index.html",
  "server.mjs",
  "start-macos.command",
  "start-windows.cmd",
];

test("发布白名单只接纳运行源码与必要根文件", () => {
  for (const file of [...required, "public/app.js", "src/model-config.mjs"]) {
    assert.equal(isReleaseFile(file), true, file);
  }
});

test("发布白名单排除开发文档、测试、密钥和日志", () => {
  for (const file of [
    ".codex/environments/environment.toml",
    ".env.local",
    "CLAUDE.md",
    "DESIGN.md",
    "public/CLAUDE.md",
    "src/private.pem",
    "test/model-config.test.mjs",
    "tmp/server.log",
  ]) {
    assert.equal(isReleaseFile(file), false, file);
  }
});

test("白名单结果去重排序并保留未来新增运行模块", () => {
  assert.deepEqual(
    selectReleaseFiles([
      "src/zeta.mjs",
      ...required,
      "public/app.js",
      "src/zeta.mjs",
      "public/CLAUDE.md",
    ]),
    [...required, "public/app.js", "src/zeta.mjs"].sort(),
  );
});

test("缺少任何必需运行文件都会阻断发布", () => {
  assert.throws(
    () => selectReleaseFiles(required.filter((file) => file !== "server.mjs")),
    /server\.mjs/,
  );
});

test("SemVer 与产物名称保持稳定", () => {
  assert.equal(assertSemver("0.2.0-beta.1"), "0.2.0-beta.1");
  assert.throws(() => assertSemver("v0.2"), /SemVer/);
  assert.deepEqual(releaseArtifactNames("canvas-lab", "0.2.0-beta.1"), {
    archive: "canvas-lab-v0.2.0-beta.1.zip",
    baseName: "canvas-lab-v0.2.0-beta.1",
    checksum: "canvas-lab-v0.2.0-beta.1.sha256",
    manifest: "canvas-lab-v0.2.0-beta.1.manifest.json",
    prefix: "canvas-lab-v0.2.0-beta.1/",
  });
});

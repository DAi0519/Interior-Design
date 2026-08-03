/**
 * [INPUT]: 依赖 node:test/assert 与 release-publish 的版本占用、远端附件校验纯函数
 * [OUTPUT]: 对外提供重复版本阻断及 Release 提交、状态、大小、摘要一致性回归保障
 * [POS]: scripts 的 GitHub 发布规则测试，不调用 GitHub、Git，不上传或删除真实制品
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertVersionAvailable,
  verifyRemoteRelease,
} from "./release-publish.mjs";

const artifact = {
  name: "canvas-lab-v0.2.0.zip",
  sha256: "abc123",
  size: 42,
};
const release = {
  assets: [{
    digest: "sha256:abc123",
    name: artifact.name,
    size: artifact.size,
    state: "uploaded",
  }],
  isDraft: true,
  isPrerelease: false,
  tagName: "v0.2.0",
  targetCommitish: "commit-123",
  url: "https://github.test/releases/v0.2.0",
};

test("未占用的版本允许进入 GitHub 发布流程", () => {
  assert.doesNotThrow(() => assertVersionAvailable({
    releases: [{ tagName: "v0.1.0" }],
    remoteTagExists: false,
    tag: "v0.2.0",
  }));
});

test("已有 Release 或远端 Tag 会阻断重复发布", () => {
  assert.throws(
    () => assertVersionAvailable({
      releases: [{ tagName: "v0.2.0" }],
      remoteTagExists: false,
      tag: "v0.2.0",
    }),
    /已存在 GitHub Release/,
  );
  assert.throws(
    () => assertVersionAvailable({
      releases: [],
      remoteTagExists: true,
      tag: "v0.2.0",
    }),
    /已存在远端 Tag/,
  );
});

test("远端 Release 必须匹配提交、状态、大小与摘要", () => {
  assert.equal(verifyRemoteRelease({
    artifacts: [artifact],
    commit: "commit-123",
    expectedDraft: true,
    release,
    tag: "v0.2.0",
  }), release.url);

  assert.throws(
    () => verifyRemoteRelease({
      artifacts: [artifact],
      commit: "commit-123",
      expectedDraft: true,
      release: {
        ...release,
        assets: [{ ...release.assets[0], digest: "sha256:wrong" }],
      },
      tag: "v0.2.0",
    }),
    /摘要不匹配/,
  );
});

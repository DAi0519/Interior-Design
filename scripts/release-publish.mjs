/**
 * [INPUT]: 依赖 release-pack、release-files、Git/GitHub CLI、package.json 与 dist 发布物
 * [OUTPUT]: 对外提供版本占用检查、带版本亮点的 Release 文案、制品校验及打包/上传/转正式/本地清理编排
 * [POS]: scripts 的对外发布边界，在本地发布准入之上增加显式且可验证的 GitHub 写操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "./release-check.mjs";
import { releaseArtifactNames } from "./release-files.mjs";

function execute(command, args, { allowFailure = false, inherit = false } = {}) {
  return new Promise((resolveExecute, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      const result = { code: code ?? 1, stderr, stdout };
      if (result.code === 0 || allowFailure) {
        resolveExecute(result);
        return;
      }
      const details = stderr.trim() || stdout.trim() || `退出码 ${result.code}`;
      reject(new Error(`${command} ${args.join(" ")} 失败：${details}`));
    });
  });
}

function parseJson(label, value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} 返回了无效 JSON：${error.message}`);
  }
}

export function assertVersionAvailable({ releases, remoteTagExists, tag }) {
  if (releases.some((release) => release.tagName === tag)) {
    throw new Error(`${tag} 已存在 GitHub Release；请先提升 package.json 版本`);
  }
  if (remoteTagExists) {
    throw new Error(`${tag} 已存在远端 Tag；请先提升 package.json 版本`);
  }
}

export function buildReleaseNotes({ highlights, names, tag }) {
  const changes = Array.isArray(highlights) && highlights.length > 0
    ? ["", "本次更新：", ...highlights.map((item) => `- ${item}`)]
    : [];
  return [
    `Canvas Lab ${tag} 运行包。`,
    ...changes,
    "",
    `使用者只需下载 ${names.archive}；${names.checksum} 和 ${names.manifest} 用于完整性与版本校验。`,
    "请勿使用 GitHub 自动生成的 Source code 压缩包。",
    "解压后在 macOS 双击 start-macos.command，或在 Windows 双击 start-windows.cmd。",
  ].join("\n");
}

export function verifyRemoteRelease({
  artifacts,
  commit,
  expectedDraft,
  release,
  tag,
}) {
  if (release.tagName !== tag) {
    throw new Error(`GitHub Release Tag 不匹配：${release.tagName || "<empty>"}`);
  }
  if (release.targetCommitish !== commit) {
    throw new Error(
      `GitHub Release 提交不匹配：${release.targetCommitish || "<empty>"}`,
    );
  }
  if (release.isDraft !== expectedDraft || release.isPrerelease !== false) {
    throw new Error("GitHub Release 状态不符合正式发布协议");
  }

  const remoteAssets = new Map(
    (release.assets || []).map((asset) => [asset.name, asset]),
  );
  if (remoteAssets.size !== artifacts.length) {
    throw new Error(
      `GitHub Release 附件数量不匹配：期望 ${artifacts.length}，实际 ${remoteAssets.size}`,
    );
  }
  for (const artifact of artifacts) {
    const remote = remoteAssets.get(artifact.name);
    if (!remote) throw new Error(`GitHub Release 缺少附件：${artifact.name}`);
    if (remote.state !== "uploaded") {
      throw new Error(`GitHub Release 附件未完成上传：${artifact.name}`);
    }
    if (remote.size !== artifact.size) {
      throw new Error(`GitHub Release 附件大小不匹配：${artifact.name}`);
    }
    if (remote.digest !== `sha256:${artifact.sha256}`) {
      throw new Error(`GitHub Release 附件摘要不匹配：${artifact.name}`);
    }
  }
  return release.url;
}

async function describeArtifact(path) {
  const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
  return {
    name: basename(path),
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: info.size,
  };
}

async function readRelease(tag) {
  const result = await execute("gh", [
    "release",
    "view",
    tag,
    "--json",
    "tagName,targetCommitish,isDraft,isPrerelease,url,assets",
  ]);
  return parseJson("gh release view", result.stdout);
}

async function assertPublishPrerequisites(tag) {
  await execute("gh", ["--version"]);
  await execute("gh", ["auth", "status"]);
  const releaseList = await execute("gh", [
    "release",
    "list",
    "--limit",
    "1000",
    "--json",
    "tagName,isDraft,isPrerelease",
  ]);
  const remoteTag = await execute("git", [
    "ls-remote",
    "--exit-code",
    "--tags",
    "origin",
    `refs/tags/${tag}`,
  ], { allowFailure: true });
  if (![0, 2].includes(remoteTag.code)) {
    throw new Error(`无法检查远端 Tag：${remoteTag.stderr.trim() || remoteTag.stdout.trim()}`);
  }
  assertVersionAvailable({
    releases: parseJson("gh release list", releaseList.stdout),
    remoteTagExists: remoteTag.code === 0,
    tag,
  });
}

async function publishRelease() {
  const packageInfo = parseJson(
    "package.json",
    await readFile(join(projectRoot, "package.json"), "utf8"),
  );
  const names = releaseArtifactNames(packageInfo.name, packageInfo.version);
  const tag = `v${packageInfo.version}`;
  await assertPublishPrerequisites(tag);

  process.stdout.write(`\n→ 打包并验证 ${tag}\n`);
  await execute(process.execPath, ["scripts/release-pack.mjs"], { inherit: true });

  const commit = (await execute("git", ["rev-parse", "HEAD"])).stdout.trim();
  const dist = join(projectRoot, "dist");
  const artifacts = await Promise.all([
    describeArtifact(join(dist, names.archive)),
    describeArtifact(join(dist, names.checksum)),
    describeArtifact(join(dist, names.manifest)),
  ]);

  process.stdout.write(`\n→ 上传 ${tag} 草稿 Release\n`);
  await execute("gh", [
    "release",
    "create",
    tag,
    ...artifacts.map((artifact) => artifact.path),
    "--draft",
    "--target",
    commit,
    "--title",
    `Canvas Lab ${tag}`,
    "--notes",
    buildReleaseNotes({ highlights: packageInfo.releaseNotes, names, tag }),
  ], { inherit: true });

  const draft = await readRelease(tag);
  verifyRemoteRelease({ artifacts, commit, expectedDraft: true, release: draft, tag });
  process.stdout.write("✓ 草稿附件名称、大小与 SHA-256 均通过远端校验\n");

  await execute("gh", ["release", "edit", tag, "--draft=false"]);
  const published = await readRelease(tag);
  const releaseUrl = verifyRemoteRelease({
    artifacts,
    commit,
    expectedDraft: false,
    release: published,
    tag,
  });

  for (const artifact of artifacts) await rm(artifact.path);
  process.stdout.write([
    "✓ GitHub Release 已正式发布并删除本地制品",
    `  ${releaseUrl}`,
    "",
  ].join("\n"));
}

const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  publishRelease().catch((error) => {
    process.stderr.write(`\n发布上传失败：${error.message}\n`);
    process.exitCode = 1;
  });
}

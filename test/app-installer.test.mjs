/**
 * [INPUT]: 依赖 node:test/assert、临时文件系统、真实 ZIP 字节/系统解压和 app-installer 的 fetch 注入接口
 * [OUTPUT]: 对外提供受信下载/官方摘要、Git 工作区保护、Release 原地版本更新/配置数据保留/失败回滚和 ZIP 路径合同的回归保障
 * [POS]: test 的应用安装集成测试，网络完全由 Response 替身提供；只创建并清理测试临时目录，不启动服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppInstaller, validateAppInstallRequest } from "../src/app-installer.mjs";

const version = "0.1.11";
const archiveName = `canvas-lab-v${version}.zip`;
const downloadUrl = `https://github.com/DAi0519/Interior-Design/releases/download/v${version}/${archiveName}`;
const checksumUrl = downloadUrl.replace(/\.zip$/, ".sha256");
const sourcePolicy = { installMode: "new-directory", restartRequired: false, recoveryRequired: false, recoveryMessage: "" };
const releasePolicy = { ...sourcePolicy, installMode: "in-place" };

/* -------------------------------------------------------------------------- */
/* 无网络的真实标准 ZIP fixture                                               */
/* -------------------------------------------------------------------------- */

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, content = "", mode = 0o100644 } of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(0x0314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE((mode << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, filename);
    offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function runtimeEntries({ packageVersion = version } = {}) {
  const prefix = `canvas-lab-v${version}/`;
  return Object.entries({
    "package.json": JSON.stringify({ name: "canvas-lab", version: packageVersion }),
    "package-lock.json": "{}",
    ".env.example": "OPTIONAL_CONFIG=\n",
    ".gitignore": ".env.local\nnode_modules/\n",
    "README.md": "Canvas Lab updated runtime\n",
    "server.mjs": "export {};\n",
    "launcher.mjs": "export {};\n",
    "start-macos.command": "#!/bin/sh\n",
    "start-windows.cmd": "@echo off\n",
    "public/index.html": "Canvas Lab",
    "src/updated.mjs": "export const updated = true;\n",
  }).map(([name, content]) => ({ name: prefix + name, content, mode: name === "start-macos.command" ? 0o100755 : 0o100644 }));
}

function mockDownload(zip, { checksum = null, onRequest } = {}) {
  const sha256 = createHash("sha256").update(zip).digest("hex");
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    await onRequest?.(url, options);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Authorization, undefined);
    assert.ok([downloadUrl, checksumUrl].includes(url), url);
    const body = url === downloadUrl ? zip : Buffer.from(checksum ?? `${sha256}  ${archiveName}\n`);
    return new Response(body, { headers: { "content-length": String(body.length) } });
  };
  return { fetchImpl, sha256, calls };
}

async function temporaryProject(t, { source = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "canvas-lab-installer-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const currentRootDir = join(root, "existing project");
  await mkdir(currentRootDir);
  if (source) await mkdir(join(currentRootDir, ".git"));
  await writeFile(join(currentRootDir, ".env.local"), "PRESERVED=yes\n");
  return { root, currentRootDir };
}

const code = (expected) => (error) => error.name === "InstallationError" && error.code === expected;

test("安装请求必须匹配固定仓库、正式版本和标准 ZIP", () => {
  assert.deepEqual(validateAppInstallRequest({ downloadUrl, version }), { version, downloadUrl, checksumUrl, archiveName });
  for (const value of ["", "0.1.11-beta.1", "00.1.11", "../../old", 11]) {
    assert.throws(() => validateAppInstallRequest({ downloadUrl, version: value }), code("INVALID_VERSION"));
  }
  for (const url of [
    "https://evil.test/update.zip", downloadUrl.replace("https:", "http:"), downloadUrl + "?token=secret",
    downloadUrl.replace("DAi0519", "another-user"), downloadUrl.replace(archiveName, "canvas-lab-v0.1.10.zip"),
    downloadUrl.replace("/v0.1.11/", "/v0.1.12/"), "invalid URL",
  ]) assert.throws(() => validateAppInstallRequest({ downloadUrl: url, version }), code("UNTRUSTED_DOWNLOAD"));
});

test("真实 ZIP 安装到默认持久同级目录，清理 staging 后仍完整保留且不迁移旧配置", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  const download = mockDownload(storedZip(runtimeEntries()));
  const installer = createAppInstaller({ currentRootDir, fetchImpl: download.fetchImpl });
  const stages = [];
  const result = await installer.install({ downloadUrl, version, onProgress: ({ stage }) => stages.push(stage) });
  assert.equal(result.path, join(root, `canvas-lab-v${version}`));
  assert.equal(result.sha256, download.sha256);
  assert.equal(result.installMode, "new-directory");
  assert.equal(result.restartRequired, false);
  assert.equal(installer.isRestartRequired(), false);
  assert.equal(JSON.parse(await readFile(join(result.path, "package.json"), "utf8")).version, version);
  assert.equal(await readFile(join(currentRootDir, ".env.local"), "utf8"), "PRESERVED=yes\n");
  await assert.rejects(lstat(join(result.path, ".env.local")), { code: "ENOENT" });
  assert.ok((await lstat(join(result.path, "start-macos.command"))).isFile());
  if (process.platform !== "win32") assert.ok((await lstat(join(result.path, "start-macos.command"))).mode & 0o111);
  assert.deepEqual([...new Set(stages)], ["downloading", "verifying", "extracting", "validating", "installing"]);
  assert.deepEqual(download.calls, [downloadUrl, checksumUrl]);
  assert.deepEqual((await readdir(root)).sort(), [`canvas-lab-v${version}`, "existing project"].sort());
  assert.equal(installer.isInstalling(), false);
});

test("自定义带空格和 shell 字符的父目录安装成功，缺失父目录自动创建", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  const base = join(root, "new folder ' $(no-shell)", "updates");
  const { fetchImpl } = mockDownload(storedZip(runtimeEntries()));
  const result = await createAppInstaller({ currentRootDir, installBaseDir: base, fetchImpl }).install({ downloadUrl, version });
  assert.equal(result.path, join(base, `canvas-lab-v${version}`));
  assert.equal(await readFile(join(result.path, "public/index.html"), "utf8"), "Canvas Lab");
  assert.deepEqual(await readdir(base), [`canvas-lab-v${version}`]);
});

test("已有目标目录或安装期间出现的目标目录不被覆盖", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  const target = join(root, `canvas-lab-v${version}`);
  await mkdir(target);
  await writeFile(join(target, ".env.local"), "DO_NOT_DELETE=yes");
  const blocked = mockDownload(storedZip(runtimeEntries()));
  await assert.rejects(createAppInstaller({ currentRootDir, fetchImpl: blocked.fetchImpl }).install({ downloadUrl, version }), code("TARGET_EXISTS"));
  assert.equal(blocked.calls.length, 0);
  assert.equal(await readFile(join(target, ".env.local"), "utf8"), "DO_NOT_DELETE=yes");
  await rm(target, { recursive: true });
  const racing = mockDownload(storedZip(runtimeEntries()), { onRequest: async (url) => {
    if (url === checksumUrl) {
      await mkdir(target);
      await writeFile(join(target, ".env.local"), "APPEARED_DURING_INSTALL=yes");
    }
  } });
  await assert.rejects(createAppInstaller({ currentRootDir, fetchImpl: racing.fetchImpl }).install({ downloadUrl, version }), code("TARGET_EXISTS"));
  assert.equal(await readFile(join(target, ".env.local"), "utf8"), "APPEARED_DURING_INSTALL=yes");
  assert.ok((await readdir(root)).every((entry) => !entry.startsWith(".canvas-lab-install-")));
});

test("官方摘要错误、校验文件名错误和包版本错误均失败并清理私有目录", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  for (const scenario of [
    { checksum: `${"0".repeat(64)}  ${archiveName}`, expected: "CHECKSUM_MISMATCH" },
    { checksum: `${"0".repeat(64)}  another.zip`, expected: "INVALID_CHECKSUM" },
    { packageVersion: "0.1.10", expected: "VERSION_MISMATCH" },
  ]) {
    const { fetchImpl } = mockDownload(storedZip(runtimeEntries(scenario)), scenario);
    const installer = createAppInstaller({ currentRootDir, fetchImpl });
    await assert.rejects(installer.install({ downloadUrl, version }), code(scenario.expected));
    assert.equal(installer.isInstalling(), false);
    assert.deepEqual(await readdir(root), ["existing project"]);
  }
});

test("SHA-256 正确的 ZIP 仍拒绝路径穿越、符号链接和局部头路径漂移", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  const cases = [
    storedZip([...runtimeEntries(), { name: `canvas-lab-v${version}/../../escaped`, content: "unsafe" }]),
    storedZip([...runtimeEntries(), { name: `canvas-lab-v${version}/link`, content: "../../outside", mode: 0o120777 }]),
  ];
  const mismatchedHeader = storedZip(runtimeEntries());
  mismatchedHeader[30] = "/".charCodeAt(0);
  cases.push(mismatchedHeader);
  for (const zip of cases) {
    const { fetchImpl } = mockDownload(zip);
    await assert.rejects(createAppInstaller({ currentRootDir, fetchImpl }).install({ downloadUrl, version }), code("INVALID_ARCHIVE"));
    assert.deepEqual(await readdir(root), ["existing project"]);
  }
});

test("下载拒绝不受信重定向与截断内容，允许 GitHub 官方资产重定向", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  const badRedirect = createAppInstaller({ currentRootDir, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.test/zip" } }) });
  await assert.rejects(badRedirect.install({ downloadUrl, version }), code("UNTRUSTED_REDIRECT"));
  const truncated = createAppInstaller({ currentRootDir, fetchImpl: async () => new Response("abc", { headers: { "content-length": "9" } }) });
  await assert.rejects(truncated.install({ downloadUrl, version }), code("INCOMPLETE_DOWNLOAD"));
  const zip = storedZip(runtimeEntries());
  const mock = mockDownload(zip);
  const redirectUrl = "https://release-assets.githubusercontent.com/github-production-release-asset/file?signature=test";
  const trusted = createAppInstaller({ currentRootDir, fetchImpl: async (url, options) => {
    if (url === downloadUrl) return new Response(null, { status: 302, headers: { location: redirectUrl } });
    if (url === redirectUrl) return new Response(zip);
    return mock.fetchImpl(url, options);
  } });
  assert.equal((await trusted.install({ downloadUrl, version })).success, true);
  assert.ok((await readdir(root)).every((entry) => !entry.startsWith(".canvas-lab-install-")));
});

test("在途安装互斥且失败后恢复，非法 URL 不锁死安装器", async (t) => {
  const { currentRootDir } = await temporaryProject(t);
  let begin;
  let resume;
  const started = new Promise((resolve) => { begin = resolve; });
  const gate = new Promise((resolve) => { resume = resolve; });
  const mock = mockDownload(storedZip(runtimeEntries()), { onRequest: async (url) => {
    if (url === downloadUrl) { begin(); await gate; }
  } });
  const installer = createAppInstaller({ currentRootDir, fetchImpl: mock.fetchImpl });
  await assert.rejects(installer.install({ downloadUrl: "bad URL", version }), code("UNTRUSTED_DOWNLOAD"));
  assert.equal(installer.isInstalling(), false);
  const first = installer.install({ downloadUrl, version });
  await started;
  assert.equal(installer.isInstalling(), true);
  await assert.rejects(installer.install({ downloadUrl, version }), code("INSTALL_IN_PROGRESS"));
  resume();
  await first;
  assert.equal(installer.isInstalling(), false);
});

test("目标写入后失败只清理本次新目录，旧配置始终保留", async (t) => {
  const { root, currentRootDir } = await temporaryProject(t);
  const mock = mockDownload(storedZip(runtimeEntries()));
  const installer = createAppInstaller({ currentRootDir, fetchImpl: mock.fetchImpl });
  await assert.rejects(installer.install({ downloadUrl, version, onProgress: ({ stage, percent }) => {
    if (stage === "installing" && percent === 100) throw new Error("injected failure");
  } }), code("INSTALL_FAILED"));
  assert.deepEqual(await readdir(root), ["existing project"]);
  assert.equal(await readFile(join(currentRootDir, ".env.local"), "utf8"), "PRESERVED=yes\n");
  assert.equal((await installer.install({ downloadUrl, version })).success, true);
});

/* -------------------------------------------------------------------------- */
/* 实习生 Release 同路径更新与回滚                                            */
/* -------------------------------------------------------------------------- */

async function prepareRelease(t) {
  const project = await temporaryProject(t, { source: false });
  for (const entry of runtimeEntries({ packageVersion: "0.1.10" })) {
    const target = join(project.currentRootDir, entry.name.slice(`canvas-lab-v${version}/`.length));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, entry.content);
  }
  for (const [name, content] of Object.entries({
    "public/index.html": "OLD Canvas Lab",
    "public/obsolete.html": "OLD public file",
    "src/obsolete.mjs": "OLD module",
    "server.mjs": "OLD server",
    "outputs/result.png": "saved image bytes",
    "node_modules/installed-dependency.txt": "existing dependencies",
    ".benchmark-workbench/state.json": "{\"saved\":true}",
    ".local-cache/sample.bin": "saved cache bytes",
  })) {
    const target = join(project.currentRootDir, name);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  return project;
}

async function directorySnapshot(root, prefix = "") {
  const snapshot = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      snapshot[name + "/"] = "directory";
      Object.assign(snapshot, await directorySnapshot(root, name));
    } else snapshot[name] = (await readFile(join(root, name))).toString("base64");
  }
  return snapshot;
}

test("安装政策识别 .git 目录或 worktree 文件为源码保护模式", async (t) => {
  const { currentRootDir } = await temporaryProject(t);
  const installer = createAppInstaller({ currentRootDir });
  assert.deepEqual(await installer.getPolicy(), sourcePolicy);
  await rm(join(currentRootDir, ".git"), { recursive: true });
  assert.deepEqual(await installer.getPolicy(), releasePolicy);
  await writeFile(join(currentRootDir, ".git"), "gitdir: /test/worktree\n");
  assert.deepEqual(await installer.getPolicy(), sourcePolicy);
});

test("Release 在原目录更新版本与运行文件、删除旧模块并保留配置和本机数据", async (t) => {
  const { root, currentRootDir } = await prepareRelease(t);
  const before = await directorySnapshot(currentRootDir);
  const originalRoot = await lstat(currentRootDir);
  const download = mockDownload(storedZip(runtimeEntries()));
  const configuredSourceBase = join(root, "source-only-install-base");
  const installer = createAppInstaller({ currentRootDir, installBaseDir: configuredSourceBase, fetchImpl: download.fetchImpl });
  assert.deepEqual(await installer.getPolicy(), releasePolicy);
  let beforeApplyCalls = 0;
  const result = await installer.install({ downloadUrl, version, beforeApply: async () => { beforeApplyCalls += 1; } });
  assert.equal(beforeApplyCalls, 1);
  assert.equal(result.path, currentRootDir);
  assert.equal(result.installMode, "in-place");
  assert.equal(result.restartRequired, true);
  assert.equal(installer.isRestartRequired(), true);
  assert.deepEqual(await installer.getPolicy(), { ...releasePolicy, restartRequired: true });
  assert.equal((await lstat(currentRootDir)).ino, originalRoot.ino);
  assert.equal(JSON.parse(await readFile(join(currentRootDir, "package.json"), "utf8")).version, version);
  assert.equal(await readFile(join(currentRootDir, "public/index.html"), "utf8"), "Canvas Lab");
  assert.equal(await readFile(join(currentRootDir, "src/updated.mjs"), "utf8"), "export const updated = true;\n");
  await assert.rejects(lstat(join(currentRootDir, "src/obsolete.mjs")), { code: "ENOENT" });
  await assert.rejects(lstat(join(currentRootDir, "public/obsolete.html")), { code: "ENOENT" });
  const after = await directorySnapshot(currentRootDir);
  for (const name of [".env.local", "outputs/result.png", "node_modules/installed-dependency.txt", ".benchmark-workbench/state.json", ".local-cache/sample.bin"]) {
    assert.equal(after[name], before[name], name);
  }
  await assert.rejects(lstat(configuredSourceBase), { code: "ENOENT" });
  assert.deepEqual(await readdir(root), ["existing project"]);
  assert.ok((await readdir(currentRootDir)).every((name) => !name.startsWith(".canvas-lab-install-")));
  await assert.rejects(installer.install({ downloadUrl, version }), code("RESTART_REQUIRED"));
});

test("原地应用中单次移动失败会恢复完整旧运行目录及全部配置数据", async (t) => {
  const { currentRootDir } = await prepareRelease(t);
  const before = await directorySnapshot(currentRootDir);
  const download = mockDownload(storedZip(runtimeEntries()));
  let injected = false;
  const installer = createAppInstaller({ currentRootDir, fetchImpl: download.fetchImpl, renameImpl: async (from, to) => {
    if (!injected && from.includes("extracted") && from.endsWith("src")) {
      injected = true;
      throw Object.assign(new Error("injected Windows file lock"), { code: "EPERM" });
    }
    return rename(from, to);
  } });
  await assert.rejects(installer.install({ downloadUrl, version }), code("INSTALL_FAILED"));
  assert.equal(injected, true);
  assert.deepEqual(await directorySnapshot(currentRootDir), before);
  assert.equal(installer.isInstalling(), false);
  assert.equal(installer.isRestartRequired(), false);
  assert.equal((await installer.install({ downloadUrl, version })).success, true);
});

test("原地安装尾部回调失败也回滚，验证后新出现 .git 则在修改源码前阻断", async (t) => {
  const { currentRootDir } = await prepareRelease(t);
  const before = await directorySnapshot(currentRootDir);
  const download = mockDownload(storedZip(runtimeEntries()));
  const installer = createAppInstaller({ currentRootDir, fetchImpl: download.fetchImpl });
  await assert.rejects(installer.install({ downloadUrl, version, onProgress: ({ stage, percent }) => {
    if (stage === "installing" && percent === 100) throw new Error("injected final callback error");
  } }), code("INSTALL_FAILED"));
  assert.deepEqual(await directorySnapshot(currentRootDir), before);
  assert.equal(installer.isRestartRequired(), false);
  await assert.rejects(installer.install({ downloadUrl, version, beforeApply: async () => {
    await mkdir(join(currentRootDir, ".git"));
  } }), code("INSTALL_MODE_CHANGED"));
  await rm(join(currentRootDir, ".git"), { recursive: true });
  assert.deepEqual(await directorySnapshot(currentRootDir), before);
});

test("下载完成后业务忙碌复查保留 APP_BUSY 且不改变运行文件", async (t) => {
  const { currentRootDir } = await prepareRelease(t);
  const before = await directorySnapshot(currentRootDir);
  const download = mockDownload(storedZip(runtimeEntries()));
  const installer = createAppInstaller({ currentRootDir, fetchImpl: download.fetchImpl });
  await assert.rejects(installer.install({ downloadUrl, version, beforeApply: async () => {
    throw Object.assign(new Error("请等待任务完成。"), { code: "APP_BUSY" });
  } }), code("APP_BUSY"));
  assert.deepEqual(download.calls, [downloadUrl, checksumUrl]);
  assert.deepEqual(await directorySnapshot(currentRootDir), before);
  assert.equal(installer.isRestartRequired(), false);
});

test("无法完成回滚时保留旧运行备份并明确错误，不删除配置数据", async (t) => {
  const { currentRootDir } = await prepareRelease(t);
  const download = mockDownload(storedZip(runtimeEntries()));
  const installer = createAppInstaller({ currentRootDir, fetchImpl: download.fetchImpl, renameImpl: async (from, to) => {
    if (from.endsWith("src") && (from.includes("extracted") || from.includes("backup"))) {
      throw Object.assign(new Error("injected persistent file lock"), { code: "EPERM" });
    }
    return rename(from, to);
  } });
  await assert.rejects(installer.install({ downloadUrl, version }), code("ROLLBACK_FAILED"));
  const stagingName = (await readdir(currentRootDir)).find((name) => name.startsWith(".canvas-lab-install-"));
  assert.ok(stagingName);
  assert.equal(await readFile(join(currentRootDir, stagingName, "backup/src/obsolete.mjs"), "utf8"), "OLD module");
  assert.equal(await readFile(join(currentRootDir, ".env.local"), "utf8"), "PRESERVED=yes\n");
  assert.equal(await readFile(join(currentRootDir, "outputs/result.png"), "utf8"), "saved image bytes");
  assert.equal(JSON.parse(await readFile(join(currentRootDir, "package.json"), "utf8")).version, "0.1.10");
  assert.equal(installer.isRecoveryRequired(), true);
  assert.equal(installer.isRestartRequired(), false);
  const policy = await installer.getPolicy();
  assert.equal(policy.recoveryRequired, true);
  assert.ok(policy.recoveryMessage.includes(join(currentRootDir, stagingName, "backup")));
  assert.match(policy.recoveryMessage, /先.*恢复旧运行文件.*再重启/);
  await assert.rejects(installer.install({ downloadUrl, version }), code("RECOVERY_REQUIRED"));
});

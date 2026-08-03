/**
 * [INPUT]: 依赖 release-check 的干净提交准入、Git archive、系统 tar、npm 与本机临时目录
 * [OUTPUT]: 对外生成确定性源码 ZIP、SHA-256、版本清单，并在临时目录完成真实安装和启动冒烟
 * [POS]: scripts 的发布编排器，一条命令把已提交源码收口为可追溯、可重复验证的发布物
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  npmCommand,
  projectRoot,
  runCommand,
  runCommandWithRetries,
  runReleaseChecks,
} from "./release-check.mjs";
import { releaseArtifactNames } from "./release-files.mjs";

function archiveFromHead({ files, format, output, prefix }) {
  runCommand(`生成 ${format.toUpperCase()} 源码快照`, "git", [
    "archive",
    `--format=${format}`,
    `--prefix=${prefix}`,
    `--output=${output}`,
    "HEAD",
    "--",
    ...files,
  ]);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose, reject) =>
    server.close((error) => error ? reject(error) : resolveClose()));
  if (!port) throw new Error("无法分配发布冒烟端口");
  return port;
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function smokeServer(stageRoot) {
  const port = await availablePort();
  const output = [];
  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env.local", "server.mjs"],
    {
      cwd: stageRoot,
      env: {
        ...process.env,
        ONEAPI_API_KEY: "",
        PATH: `${join(stageRoot, "node_modules", ".bin")}${delimiter}${process.env.PATH || ""}`,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const capture = (chunk) => {
    output.push(String(chunk));
    if (output.join("").length > 20_000) output.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        const html = await response.text();
        if (response.ok && html.includes("Canvas Lab")) {
          const catalogResponse = await fetch(`http://127.0.0.1:${port}/api/catalog`);
          const catalog = await catalogResponse.json();
          if (catalogResponse.ok && Array.isArray(catalog.models)) {
            ready = true;
            break;
          }
        }
      } catch {
        // 服务尚未监听，继续短轮询。
      }
      await wait(100);
    }
    if (!ready) {
      throw new Error(`发布包服务未通过冒烟：\n${output.join("").trim()}`);
    }
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      wait(2_000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function verifyCleanArchive({ files, prefix }) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "canvas-lab-release-"));
  const tarPath = join(temporaryRoot, "source.tar");
  const stageRoot = join(temporaryRoot, prefix.slice(0, -1));
  try {
    archiveFromHead({ files, format: "tar", output: tarPath, prefix });
    runCommand("解开临时发布快照", "tar", ["-xf", tarPath, "-C", temporaryRoot]);
    await runCommandWithRetries("在发布快照中执行 npm ci", npmCommand, [
      "ci",
      "--no-audit",
      "--no-fund",
    ], { attempts: 2, cwd: stageRoot });
    process.stdout.write("\n→ 启动发布快照并检查页面与模型目录\n");
    await smokeServer(stageRoot);
    process.stdout.write("✓ 干净安装与启动冒烟通过\n");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function atomicWrite(target, content) {
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rm(target, { force: true });
  await rename(temporary, target);
}

async function packRelease() {
  const { commit, files, packageInfo } = await runReleaseChecks();
  const names = releaseArtifactNames(packageInfo.name, packageInfo.version);
  await verifyCleanArchive({ files, prefix: names.prefix });

  const dist = resolve(projectRoot, "dist");
  await mkdir(dist, { recursive: true });
  const archivePath = join(dist, names.archive);
  const temporaryArchive = `${archivePath}.tmp-${process.pid}`;
  await rm(temporaryArchive, { force: true });
  archiveFromHead({
    files,
    format: "zip",
    output: temporaryArchive,
    prefix: names.prefix,
  });
  await rm(archivePath, { force: true });
  await rename(temporaryArchive, archivePath);

  const archiveBytes = await readFile(archivePath);
  const sha256 = createHash("sha256").update(archiveBytes).digest("hex");
  const manifest = {
    schemaVersion: 1,
    name: packageInfo.name,
    version: packageInfo.version,
    commit,
    node: packageInfo.engines?.node || null,
    archive: names.archive,
    sha256,
    fileCount: files.length,
    files,
  };
  await atomicWrite(join(dist, names.checksum), `${sha256}  ${names.archive}\n`);
  await atomicWrite(
    join(dist, names.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stdout.write([
    "",
    "✓ 可重复发布包已生成",
    `  ZIP: dist/${names.archive}`,
    `  SHA-256: dist/${names.checksum}`,
    `  清单: dist/${names.manifest}`,
    `  提交: ${commit}`,
    "",
  ].join("\n"));
}

const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  packRelease().catch((error) => {
    process.stderr.write(`\n发布打包失败：${error.message}\n`);
    process.exitCode = 1;
  });
}

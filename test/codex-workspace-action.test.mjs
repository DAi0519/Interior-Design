/**
 * [INPUT]: 依赖 node:test/assert、临时文件与进程替身，以及 Codex 动作配置、启动脚本和 launcher.mjs
 * [OUTPUT]: 对外提供短动作传输、已有服务复用、冷启动及有限超时退出的回归保障
 * [POS]: test 的桌面工作台启动合同测试，不调用真实 launchctl、服务或浏览器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(projectRoot, ".codex/environments/run-workspace.sh");
const environmentPath = join(projectRoot, ".codex/environments/environment.toml");

const commandStub = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ACTION_TEST_CALLS, JSON.stringify({command,args,cwd:process.cwd()}) + "\\n");
if (command === "curl") {
  const ready = process.env.ACTION_TEST_MODE === "existing" || fs.existsSync(process.env.ACTION_TEST_READY);
  process.exit(ready ? 0 : 7);
}
if (command === "launchctl" && args[0] === "submit" && process.env.ACTION_TEST_MODE === "cold") {
  fs.writeFileSync(process.env.ACTION_TEST_READY, "ready");
}
if (command === "tail") process.stdout.write("启动日志替身\\n");
`;

async function runAction(t, { mode, environmentPort } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "canvas workspace-action-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  const script = join(root, ".codex/environments/run-workspace.sh");
  const callsPath = join(root, "calls.jsonl");
  await mkdir(dirname(script), { recursive: true });
  await mkdir(bin);
  await Promise.all([
    copyFile(scriptPath, script),
    copyFile(join(projectRoot, "launcher.mjs"), join(root, "launcher.mjs")),
    writeFile(join(root, ".env.local"), "PORT='4317'\n"),
    symlink(process.execPath, join(bin, "node")),
    ...["curl", "npm", "launchctl", "open", "sleep", "tail", "lark-cli"].map((command) =>
      writeFile(join(bin, command), commandStub, { mode: 0o755 })),
  ]);
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    ACTION_TEST_MODE: mode,
    ACTION_TEST_CALLS: callsPath,
    ACTION_TEST_READY: join(root, "ready"),
  };
  delete env.PORT;
  if (environmentPort) env.PORT = environmentPort;
  const result = spawnSync("/bin/bash", [script], {
    cwd: tmpdir(),
    env,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  const calls = (await readFile(callsPath, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  const probes = calls.filter(({ command }) => command === "curl");
  assert.ok(probes.length > 0);
  for (const { args, cwd } of probes) {
    assert.equal(args[args.indexOf("--max-time") + 1], "1", "每次 HTTP 探测最多等待一秒");
    assert.equal(cwd, root, "从项目外启动也应先定位工作目录");
  }
  return { ...result, calls, root, bin, probes };
}

test("Codex 运行动作以短命令引用完整 Bash 脚本", async () => {
  const source = await readFile(environmentPath, "utf8");
  const action = source.split("[[actions]]").find((section) => section.includes('name = "运行工作台"'));
  assert.ok(action);
  const command = JSON.parse(action.match(/^command\s*=\s*(".*")$/m)[1]);
  assert.ok(Buffer.byteLength(command) < 200, "运行动作避免通过终端传入长脚本");
  assert.match(command, /bash\s+\.codex\/environments\/run-workspace\.sh/);
  assert.equal(spawnSync("/bin/bash", ["-n", "-c", command]).status, 0);
  assert.equal(spawnSync("/bin/bash", ["-n", scriptPath]).status, 0);
});

test("已有服务复用本机 PORT 并打开原入口，不触发启动或停止", async (t) => {
  const result = await runAction(t, { mode: "existing" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter(({ command }) => command === "launchctl" || command === "npm").length, 0);
  assert.deepEqual(result.calls.filter(({ command }) => command === "open").map(({ args }) => args), [
    ["http://127.0.0.1:4317"],
  ]);
  assert.ok(result.probes.every(({ args }) => args.includes("http://127.0.0.1:4317/")));
});

test("冷启动通过 launchctl 调用项目 npm 并尊重环境端口覆盖", async (t) => {
  const result = await runAction(t, { mode: "cold", environmentPort: "5001" });
  assert.equal(result.status, 0, result.stderr);
  const launches = result.calls.filter(({ command, args }) => command === "launchctl" && args[0] === "submit");
  assert.equal(launches.length, 1);
  assert.ok(launches[0].args.includes("com.canvas-lab.workspace"));
  assert.ok(launches[0].args.includes("PORT=5001"), "覆盖端口必须传给 launchd 服务进程");
  assert.ok(launches[0].args.includes(`LARK_CLI_PATH=${join(result.bin, "lark-cli")}`));
  assert.ok(launches[0].args.includes(join(result.bin, "npm")));
  assert.deepEqual(launches[0].args.slice(-3), ["--prefix", result.root, "start"]);
  assert.deepEqual(result.calls.filter(({ command }) => command === "open").map(({ args }) => args), [
    ["http://127.0.0.1:5001"],
  ]);
});

test("服务始终未就绪时有限退出并提示日志路径，不打开浏览器", async (t) => {
  const result = await runAction(t, { mode: "never" });
  assert.notEqual(result.status, 0);
  assert.ok(result.probes.length <= 51, `探测次数应有上限，实际为 ${result.probes.length}`);
  assert.equal(result.calls.filter(({ command }) => command === "open").length, 0);
  assert.equal(result.calls.filter(({ command }) => command === "tail").length, 0);
  assert.match(result.stdout + result.stderr, /\/tmp\/canvas-lab\.log/);
});

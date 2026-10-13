/**
 * [INPUT]: 依赖 node:test/assert、app-update.js 的视图/链接/检查与安装控制器，以及 DOM/JSON/进度流请求替身
 * [OUTPUT]: 对外提供新版提示、检查降级/去重/重试、两种安装模式确认/指导、安全回退、待重启/恢复失败状态、成功回执/错误 code/断流失败与安装互斥的行为回归保障
 * [POS]: test 的共享版本更新交互测试，仅在内存消费安装进度，不访问 GitHub、下载或安装文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  createAppUpdateChecker,
  createAppUpdateController,
  getAppUpdateView,
  getTrustedUpdateUrl,
} from "../public/app-update.js";
import { isReleaseFile } from "../scripts/release-files.mjs";

const releasesUrl = "https://github.com/DAi0519/Interior-Design/releases";
const available = {
  checkedAt: "2026-10-08T03:00:00.000Z",
  currentVersion: "0.1.10",
  downloadUrl: `${releasesUrl}/download/v0.1.11/canvas-lab-v0.1.11.zip`,
  latestVersion: "0.1.11",
  message: "发现新版本",
  releaseNotes: "增加更新检查。",
  releaseUrl: `${releasesUrl}/tag/v0.1.11`,
  status: "available",
};

test("新版映射保留当前版本、提示和标准运行包下载", () => {
  const view = getAppUpdateView(available);
  assert.equal(view.buttonLabel, "v0.1.10 · 有新版");
  assert.equal(view.statusLabel, "发现新版本");
  assert.equal(view.downloadUrl, available.downloadUrl);
  assert.equal(view.releaseNotes, available.releaseNotes);
  assert.equal(getAppUpdateView(available, { isChecking: true }).statusLabel, "正在检查更新…");
});

test("未完成检查和检查失败均不能显示已是最新", () => {
  for (const state of [{}, { status: "current" }, {
    status: "unavailable", currentVersion: "0.1.10", message: "更新服务暂时不可用",
  }]) {
    const view = getAppUpdateView(state);
    assert.equal(view.status, "unavailable");
    assert.equal(view.statusLabel, "暂时无法检查");
    assert.equal(view.downloadUrl, null);
    assert.equal(view.releaseUrl, releasesUrl);
  }
});

test("明确待重启回执优先于检查和新版状态，隐藏重复安装下载并提示重启", () => {
  for (const status of ["available", "current", "unavailable"]) {
    const view = getAppUpdateView({ ...available, status, restartRequired: true, installMode: "in-place" }, { isChecking: true });
    assert.equal(view.restartRequired, true);
    assert.equal(view.status, "restart-required");
    assert.equal(view.buttonLabel, "v0.1.10 · 待重启");
    assert.equal(view.statusLabel, "更新已安装，请重启");
    assert.equal(view.downloadUrl, null);
    assert.match(view.instructions, /\.env\.local 和本地数据已保留/);
    assert.match(view.instructions, /关闭当前服务并双击原启动脚本/);
  }
  for (const restartRequired of [undefined, false, "true", 1]) {
    assert.equal(getAppUpdateView({ ...available, restartRequired }).restartRequired, false);
  }
});

test("恢复失败回执优先于待重启，显示备份恢复指引并阻止再次安装", () => {
  const recoveryMessage = "请从 /tmp/canvas-lab-backup 手动恢复程序后再重新启动。";
  const view = getAppUpdateView({
    ...available, installMode: "in-place", restartRequired: true, recoveryRequired: true, recoveryMessage,
  }, { isChecking: true });
  assert.equal(view.recoveryRequired, true);
  assert.equal(view.status, "recovery-required");
  assert.equal(view.statusLabel, "更新恢复失败");
  assert.equal(view.buttonLabel, "v0.1.10 · 需恢复");
  assert.equal(view.message, recoveryMessage);
  assert.equal(view.instructions, "");
  assert.equal(view.downloadUrl, null);
  assert.doesNotMatch(view.buttonTitle, /请重启/);
  assert.equal(getAppUpdateView({ ...available, recoveryRequired: "true" }).recoveryRequired, false);
});

test("只接受固定仓库的正式版本链接和版本一致的 ZIP", () => {
  assert.equal(getTrustedUpdateUrl(`${releasesUrl}/latest`), `${releasesUrl}/latest`);
  assert.equal(getTrustedUpdateUrl(available.downloadUrl, "download"), available.downloadUrl);
  const buildUrl = `${releasesUrl}/download/v0.1.11%2Bbuild.1/canvas-lab-v0.1.11%2Bbuild.1.zip`;
  assert.equal(getTrustedUpdateUrl(buildUrl, "download"), buildUrl);
  for (const url of [
    "javascript:alert(1)",
    `http://github.com/DAi0519/Interior-Design/releases/latest`,
    "https://github.com.evil.test/DAi0519/Interior-Design/releases/latest",
    "https://github.com/another/repository/releases/latest",
    "https://user:secret@github.com/DAi0519/Interior-Design/releases/latest",
    `${releasesUrl}/latest?token=secret`,
    `${releasesUrl}/latest#unexpected`,
  ]) assert.equal(getTrustedUpdateUrl(url), null, url);
  for (const url of [
    `${releasesUrl}/download/v0.1.11/canvas-lab-v0.1.10.zip`,
    `${releasesUrl}/download/v0.1.11/install.exe`,
    `${releasesUrl}/download/v0.1.11/canvas-lab-v0.1.11.zip?token=secret`,
    `${releasesUrl}/download/v0.1.11/Source-code.zip`,
  ]) assert.equal(getTrustedUpdateUrl(url, "download"), null, url);
  const unsafe = getAppUpdateView({ ...available, downloadUrl: "https://evil.test/update.zip" });
  assert.equal(unsafe.downloadUrl, null);
});

test("自动检查与手动检查共享在途请求，手动重试带 force", async () => {
  const paths = [];
  const changes = [];
  let complete;
  const checker = createAppUpdateChecker({
    request: (pathname) => {
      paths.push(pathname);
      return new Promise((resolve) => { complete = resolve; });
    },
    onStateChange: (state, { isChecking }) => changes.push({ state, isChecking }),
  });
  const first = checker.check();
  const shared = checker.check(true);
  assert.equal(first, shared);
  await Promise.resolve();
  assert.deepEqual(paths, ["/api/app-update"]);
  complete(available);
  await first;
  assert.equal(checker.getState().status, "available");
  assert.equal(changes.at(-1).isChecking, false);
  const retry = checker.check(true);
  await Promise.resolve();
  assert.equal(paths.at(-1), "/api/app-update?force=1");
  complete({ ...available, status: "current" });
  await retry;
  assert.equal(checker.getState().status, "current");
});

test("网络失败清除旧下载状态，不暴露原始错误，随后可重试", async () => {
  let attempt = 0;
  const checker = createAppUpdateChecker({
    request: async () => {
      attempt += 1;
      if (attempt === 2) throw new Error("Authorization: secret-token");
      return available;
    },
  });
  await checker.check();
  const failed = await checker.check(true);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.currentVersion, available.currentVersion);
  assert.equal(failed.downloadUrl, null);
  assert.equal(failed.latestVersion, null);
  assert.doesNotMatch(JSON.stringify(failed), /secret-token/);
  assert.equal((await checker.check(true)).status, "available");
});

test("同步异常与未知 API 状态不会锁死后续手动检查", async () => {
  let attempt = 0;
  const checker = createAppUpdateChecker({ request: () => {
    attempt += 1;
    if (attempt === 1) throw new Error("connection failed");
    if (attempt === 2) return { status: "unexpected" };
    return available;
  } });
  assert.equal((await checker.check()).status, "unavailable");
  assert.equal((await checker.check(true)).status, "unavailable");
  assert.equal((await checker.check(true)).status, "available");
  assert.equal(attempt, 3);
});

test("三个工作台接入同一更新模块，运行包包含其全部运行依赖", async () => {
  for (const page of ["index", "beta", "benchmark"]) {
    const html = await readFile(new URL(`../public/${page}.html`, import.meta.url), "utf8");
    assert.match(html, /data-app-update/);
    assert.match(html, /app-update\.js\?v=1/);
    assert.match(html, /app-update\.css\?v=1/);
  }
  for (const file of ["src/app-update.mjs", "public/app-update.js", "public/app-update.css"]) {
    assert.equal(isReleaseFile(file), true);
  }
});

/* -------------------------------------------------------------------------- */
/* 无网络安装交互                                                             */
/* -------------------------------------------------------------------------- */

class Element {
  constructor() {
    this.children = [];
    this.handlers = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.isConnected = true;
    this.classList = { toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) {
    const handlers = this.handlers.get(name) || [];
    handlers.push(handler);
    this.handlers.set(name, handlers);
  }
  removeEventListener(name, handler) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((item) => item !== handler));
  }
  async dispatch(name, event = {}) {
    await Promise.all((this.handlers.get(name) || []).map((handler) => handler({ target: this, ...event })));
  }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; void this.dispatch("close"); }
  remove() { this.isConnected = false; }
  getBoundingClientRect() { return { left: 10, right: 100, top: 10, bottom: 100 }; }
}

async function updateHarness({ installFetch, request = async () => available } = {}) {
  const document = new Element();
  document.body = new Element();
  document.visibilityState = "visible";
  document.createElement = () => new Element();
  const trigger = new Element();
  const alerts = [];
  const confirmations = [];
  const window = {
    confirm: (message) => { confirmations.push(message); return true; },
    alert: (message) => alerts.push(message),
    setInterval: (callback) => { window.tick = callback; return 1; },
    clearInterval() {},
  };
  const controller = createAppUpdateController({ trigger, document, window, request, installFetch, intervalMs: 1 });
  await controller.check();
  controller.open();
  const dialog = document.body.children[0];
  const elements = dialog.children.concat(...dialog.children.map((element) => element.children));
  const find = (className) => elements.find((element) => element.className.split(" ").includes(className));
  return { controller, dialog, document, window, alerts, confirmations, find };
}

function progressResponse(chunks) {
  const reader = {
    released: false,
    async read() {
      if (!chunks.length) return { done: true };
      const chunk = chunks.shift();
      return { value: typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk, done: false };
    },
    releaseLock() { reader.released = true; },
  };
  return { ok: true, body: { getReader: () => reader }, reader };
}

test("安装只在完整完成回执后成功，支持分块中文与末尾无换行", async () => {
  const encoded = new TextEncoder().encode(
    '{"stage":"downloading","percent":50}\n{"stage":"complete","path":"/tmp/新版本 Canvas Lab"}'
  );
  const split = encoded.indexOf(0xe6) + 1;
  const response = progressResponse([encoded.slice(0, split), encoded.slice(split)]);
  const requests = [];
  const ui = await updateHarness({ installFetch: async (pathname, options) => {
    requests.push({ pathname, options });
    return response;
  } });
  await ui.find("app-update-install").dispatch("click");
  assert.equal(ui.find("app-update-status").textContent, "安装成功");
  assert.equal(ui.find("app-update-status").dataset.status, "success");
  assert.match(ui.find("app-update-progress-text").textContent, /\/tmp\/新版本 Canvas Lab/);
  assert.equal(response.reader.released, true);
  assert.equal(ui.find("app-update-install").disabled, true);
  assert.equal(ui.dialog.attributes.get("aria-busy"), "false");
  assert.equal(ui.alerts.length, 1);
  assert.equal(requests[0].pathname, "/api/app-install");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    downloadUrl: available.downloadUrl, version: available.latestVersion,
  });
  await ui.controller.check();
  assert.equal(ui.find("app-update-status").textContent, "安装成功");
  await ui.controller.check(true);
  assert.equal(ui.find("app-update-status").textContent, "发现新版本");
  assert.equal(ui.find("app-update-progress-text").hidden, true);
  assert.equal(ui.find("app-update-install").disabled, false);
  ui.controller.destroy();
});

test("安装 HTTP 与进度错误均保留错误 code，恢复重试和手动下载", async () => {
  for (const response of [
    { ok: false, json: async () => ({ error: "请等待生成任务完成", code: "JOBS_RUNNING" }) },
    progressResponse(['{"stage":"error","error":"校验失败","code":"CHECKSUM_MISMATCH"}\n']),
  ]) {
    const ui = await updateHarness({ installFetch: async () => response });
    await ui.find("app-update-install").dispatch("click");
    assert.equal(ui.find("app-update-status").textContent, "安装失败");
    assert.match(ui.find("app-update-message").textContent, /\[(JOBS_RUNNING|CHECKSUM_MISMATCH)\]/);
    assert.equal(ui.find("app-update-message").hidden, false);
    assert.equal(ui.find("app-update-install").disabled, false);
    assert.equal(ui.find("app-update-download").hidden, false);
    assert.equal(ui.find("app-update-action").disabled, false);
    assert.match(ui.alerts[0], /^安装失败：/);
    ui.controller.destroy();
  }
});

test("源码与未知安装模式使用新目录确认及手动迁移指导", async () => {
  for (const installMode of ["new-directory", "unknown", undefined]) {
    const update = { ...available, installMode };
    assert.equal(getAppUpdateView(update).installMode, "new-directory");
    const ui = await updateHarness({
      request: async () => update,
      installFetch: async () => progressResponse(['{"stage":"complete","path":"/tmp/new","installMode":"new-directory"}\n']),
    });
    assert.match(ui.find("app-update-instructions").textContent, /新目录/);
    await ui.find("app-update-install").dispatch("click");
    assert.match(ui.confirmations[0], /当前源码工作区保持不变/);
    assert.match(ui.confirmations[0], /手动迁移 \.env\.local/);
    assert.match(ui.alerts[0], /手动复制原目录的 \.env\.local 到新目录/);
    assert.match(ui.find("app-update-instructions").textContent, /切换到新版本并运行启动脚本/);
    ui.controller.destroy();
  }
});

test("运行包原目录更新确认保留配置和数据，成功指导重启且无需迁移", async () => {
  const update = { ...available, installMode: "in-place" };
  assert.equal(getAppUpdateView(update).installMode, "in-place");
  const ui = await updateHarness({
    request: async () => update,
    installFetch: async () => progressResponse([
      '{"stage":"complete","path":"/tmp/current","installMode":"in-place","restartRequired":true}\n',
    ]),
  });
  assert.match(ui.find("app-update-instructions").textContent, /当前目录替换程序/);
  await ui.find("app-update-install").dispatch("click");
  assert.match(ui.confirmations[0], /保留 \.env\.local 和本地数据/);
  assert.match(ui.confirmations[0], /重启启动脚本以生效/);
  assert.doesNotMatch(ui.confirmations[0], /新目录|手动迁移/);
  assert.match(ui.find("app-update-progress-text").textContent, /当前目录已更新/);
  assert.match(ui.alerts[0], /无需迁移配置/);
  assert.match(ui.find("app-update-instructions").textContent, /关闭当前服务并双击原启动脚本/);
  assert.doesNotMatch(ui.alerts[0], /手动复制|切换到新版本/);
  assert.equal(ui.find("app-update-status").textContent, "更新已安装，请重启");
  assert.equal(ui.find("app-update-install").hidden, true);
  assert.equal(ui.find("app-update-download").hidden, true);
  await ui.controller.check(true);
  assert.equal(ui.find("app-update-status").textContent, "更新已安装，请重启");
  assert.equal(ui.find("app-update-install").hidden, true);
  assert.equal(ui.find("app-update-download").hidden, true);
  ui.controller.destroy();
});

test("提前断流、坏进度、无路径完成和缺少进度流均失败，不能假完成", async () => {
  for (const [response, expected] of [
    [progressResponse(['{"stage":"downloading","percent":100}\n']), /提前结束/],
    [progressResponse(['{"stage":"complete"}\n']), /缺少新版本路径/],
    [progressResponse(["{invalid}\n"]), /无法识别/],
    [{ ok: true, body: null }, /缺少可读取的进度流/],
    [{ ok: false, json: async () => { throw new Error("not JSON"); } }, /安装请求失败/],
  ]) {
    const ui = await updateHarness({ installFetch: async () => response });
    await ui.find("app-update-install").dispatch("click");
    assert.equal(ui.find("app-update-status").dataset.status, "error");
    assert.match(ui.find("app-update-message").textContent, expected);
    assert.equal(ui.find("app-update-install").disabled, false);
    assert.equal(ui.dialog.attributes.get("aria-busy"), "false");
    assert.equal(ui.alerts.length, 1);
    assert.doesNotMatch(ui.alerts[0], /安装成功/);
    ui.controller.destroy();
  }
});

test("安装期间拒绝新检查和所有关闭，旧检查回调不能覆盖进度及按钮", async () => {
  let requests = 0;
  let finishCheck;
  let finishProgress;
  const reader = {
    read: () => new Promise((resolve) => { finishProgress = resolve; }),
    releaseLock() {},
  };
  const ui = await updateHarness({
    request: () => {
      requests += 1;
      return requests === 1 ? available : new Promise((resolve) => { finishCheck = resolve; });
    },
    installFetch: async () => ({ ok: true, body: { getReader: () => reader } }),
  });
  const pendingCheck = ui.controller.check(true);
  await Promise.resolve();
  const installation = ui.find("app-update-install").dispatch("click");
  await Promise.resolve();
  ui.window.tick();
  await ui.controller.check(true);
  assert.equal(requests, 2);
  finishCheck({ ...available, status: "current" });
  await pendingCheck;
  assert.equal(ui.find("app-update-status").textContent, "正在安装更新…");
  assert.equal(ui.find("app-update-install").disabled, true);
  assert.equal(ui.find("app-update-download").hidden, true);
  assert.equal(ui.find("app-update-action").disabled, true);
  assert.equal(ui.find("app-update-actions").children[1].disabled, true);
  ui.controller.close();
  assert.equal(ui.dialog.open, true);
  let cancelled = false;
  await ui.dialog.dispatch("cancel", { preventDefault: () => { cancelled = true; } });
  assert.equal(cancelled, true);
  await ui.dialog.dispatch("pointerdown", { isPrimary: true, button: 0, clientX: 0, clientY: 0 });
  await ui.dialog.dispatch("click", { clientX: 0, clientY: 0 });
  assert.equal(ui.dialog.open, true);
  finishProgress({ done: false, value: new TextEncoder().encode('{"stage":"complete","path":"/tmp/new"}\n') });
  await installation;
  assert.equal(ui.find("app-update-status").textContent, "安装成功");
  assert.equal(ui.find("app-update-actions").children[1].textContent, "重新检查");
  ui.controller.close();
  assert.equal(ui.dialog.open, false);
  ui.controller.destroy();
});

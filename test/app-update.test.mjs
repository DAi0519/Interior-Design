/**
 * [INPUT]: 依赖 node:test/assert 与 src/app-update.mjs，可注入匿名 GitHub 请求、时钟和计时器替身
 * [OUTPUT]: 对外提供正式版本比较、附件准入、匿名 API 与网页兜底、错误脱敏、超时和缓存并发回归保障
 * [POS]: test 的应用更新边界测试，不访问网络、下载文件或读取真实 GitHub 配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createAppUpdateService } from "../src/app-update.mjs";

const REPOSITORY_URL = "https://github.com/DAi0519/Interior-Design";
const API_URL = "https://api.github.com/repos/DAi0519/Interior-Design/releases/latest";
const EPOCH = Date.UTC(2026, 9, 8);

function release(version = "0.1.10") {
  const tag = `v${version}`;
  const assetName = `canvas-lab-v${version}.zip`;
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    html_url: `${REPOSITORY_URL}/releases/tag/${tag}`,
    body: "新增更新检查与下载提示。",
    assets: [{
      name: assetName,
      state: "uploaded",
      size: 1_024,
      browser_download_url: `${REPOSITORY_URL}/releases/download/${tag}/${assetName}`,
    }],
  };
}

function serviceFor(data, options = {}) {
  return createAppUpdateService({
    currentVersion: "0.1.9",
    fetchImpl: async () => ({ ok: true, json: async () => data }),
    now: () => EPOCH,
    ...options,
  });
}

function headResponse(status, headers = {}) {
  return { status, headers: new Headers(headers) };
}

function publicFallbackFetch({ status = 403, tag = "v0.1.10", assetResponse, requests = [] } = {}) {
  return async (url, options) => {
    requests.push({ url, options });
    if (url === API_URL) {
      if (status === "network") throw new Error("temporary network error");
      return { ok: false, status };
    }
    if (url === `${REPOSITORY_URL}/releases/latest`) {
      return headResponse(302, { location: `${REPOSITORY_URL}/releases/tag/${tag}` });
    }
    assert.equal(url, `${REPOSITORY_URL}/releases/download/${tag}/canvas-lab-${tag}.zip`);
    return assetResponse || headResponse(302, { location: "https://release-assets.githubusercontent.com/test.zip?signature=private" });
  };
}

test("0.1.9 正确识别 0.1.10，回执只提供固定仓库的正式 ZIP", async () => {
  const receipt = await serviceFor(release()).check();
  assert.deepEqual(receipt, {
    status: "available",
    currentVersion: "0.1.9",
    latestVersion: "0.1.10",
    releaseUrl: `${REPOSITORY_URL}/releases/tag/v0.1.10`,
    downloadUrl: `${REPOSITORY_URL}/releases/download/v0.1.10/canvas-lab-v0.1.10.zip`,
    releaseNotes: "新增更新检查与下载提示。",
    checkedAt: "2026-10-08T00:00:00.000Z",
    message: "发现新版本 0.1.10，可前往下载。",
  });
});

test("相等、本机版本更高及 build 标记均不会误报更新", async () => {
  for (const currentVersion of ["0.1.10", "0.1.11", "0.2.0-beta.1", "0.1.10+local.2"]) {
    const receipt = await serviceFor(release(), { currentVersion }).check();
    assert.equal(receipt.status, "current", currentVersion);
    assert.equal(receipt.latestVersion, "0.1.10");
  }
  const receipt = await serviceFor(release("0.1.10+build.3"), { currentVersion: "0.1.10+build.1" }).check();
  assert.equal(receipt.status, "current");
  assert.match(receipt.downloadUrl, /v0\.1\.10%2Bbuild\.3/);
});

test("当前预发布版可升级同版本正式版，数值比较不受大整数精度影响", async () => {
  for (const currentVersion of ["0.1.10-beta.1", "0.1.10-rc.10", "0.1.10-1.0"]) {
    assert.equal((await serviceFor(release(), { currentVersion }).check()).status, "available");
  }
  const receipt = await serviceFor(release("9007199254740993.0.0"), {
    currentVersion: "9007199254740992.0.0",
  }).check();
  assert.equal(receipt.status, "available");
});

test("草稿、预发布及非法标签都不能成为可下载更新", async () => {
  for (const patch of [
    { draft: true }, { prerelease: true }, { tag_name: "v0.1.10-beta.1" },
    { tag_name: "v01.1.10" }, { tag_name: "v0.1.10-01" },
    { tag_name: "v0.1.10/../../evil" }, { tag_name: null },
  ]) {
    const receipt = await serviceFor({ ...release(), ...patch }).check();
    assert.equal(receipt.status, "unavailable", JSON.stringify(patch));
    assert.equal(receipt.latestVersion, null);
    assert.equal(receipt.downloadUrl, null);
  }
});

test("缺失、未上传、空包和非标准名称的 ZIP 均保持可重试", async () => {
  for (const assets of [
    [], null,
    [{ ...release().assets[0], state: "new" }],
    [{ ...release().assets[0], size: 0 }],
    [{ ...release().assets[0], name: "source.zip" }],
  ]) {
    const receipt = await serviceFor({ ...release(), assets }).check();
    assert.equal(receipt.status, "unavailable");
    assert.match(receipt.message, /标准下载包/);
    assert.equal(receipt.downloadUrl, null);
  }
});

test("外部、其它仓库、认证、查询参数及错误标签的地址全部被拒绝", async () => {
  const asset = release().assets[0];
  for (const url of [
    asset.browser_download_url.replace("github.com", "evil.example"),
    asset.browser_download_url.replace("Interior-Design", "Other"),
    asset.browser_download_url.replace("https://", "https://user:secret@"),
    `${asset.browser_download_url}?redirect=evil`,
    `${asset.browser_download_url}#download`,
    asset.browser_download_url.replace("/v0.1.10/", "/v0.1.11/"),
    asset.browser_download_url.replace("https://", "http://"),
    asset.browser_download_url.replace("canvas-lab-v0.1.10.zip", "source.zip"),
  ]) {
    const receipt = await serviceFor({ ...release(), assets: [{ ...asset, browser_download_url: url }] }).check();
    assert.equal(receipt.status, "unavailable", url);
    assert.equal(receipt.downloadUrl, null);
  }
  const receipt = await serviceFor({ ...release(), html_url: "https://evil.example/release" }).check();
  assert.equal(receipt.status, "unavailable");
  assert.equal(receipt.releaseUrl, `${REPOSITORY_URL}/releases/latest`);
});

test("公开仓库只通过固定 GitHub API 匿名查询，不传递认证信息", async () => {
  let requests = 0;
  const receipt = await serviceFor(release(), {
    fetchImpl: async (url, options) => {
      requests += 1;
      assert.equal(url, API_URL);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => release() };
    },
  }).check();
  assert.equal(receipt.status, "available");
  assert.equal(requests, 1);
});

test("无权限、限流、服务错误和网络异常都不会被报告为最新或泄漏原始错误", async () => {
  const secret = "do-not-leak-credential";
  for (const status of [401, 403, 404, 429, 500]) {
    const receipt = await serviceFor(null, {
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ message: secret }) }),
    }).check();
    assert.equal(receipt.status, "unavailable", status);
    assert.doesNotMatch(JSON.stringify(receipt), new RegExp(secret));
  }
  const receipt = await serviceFor(null, {
    fetchImpl: async () => { throw new Error(secret); },
  }).check();
  assert.equal(receipt.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(secret));
});

test("匿名限流提示稍后重试，404 表示暂无可用正式 Release", async () => {
  for (const status of [403, 429]) {
    const receipt = await serviceFor(null, {
      fetchImpl: async () => ({ ok: false, status }),
    }).check();
    assert.equal(receipt.status, "unavailable");
    assert.match(receipt.message, /访问限制.*稍后重试/);
  }
  const receipt = await serviceFor(null, { fetchImpl: async () => ({ ok: false, status: 404 }) }).check();
  assert.equal(receipt.status, "unavailable");
  assert.match(receipt.message, /没有可用的正式 Release/);
});

test("API 限流、服务错误或暂时网络异常时，通过两次 HEAD 验证公开正式版本", async () => {
  for (const status of [403, 429, 500, 503, "network"]) {
    const requests = [];
    const receipt = await serviceFor(null, { fetchImpl: publicFallbackFetch({ status, requests }) }).check();
    assert.equal(receipt.status, "available", status);
    assert.equal(receipt.latestVersion, "0.1.10");
    assert.equal(receipt.downloadUrl, `${REPOSITORY_URL}/releases/download/v0.1.10/canvas-lab-v0.1.10.zip`);
    assert.equal(receipt.releaseNotes, "更新说明请在版本页面查看。");
    assert.equal(requests.length, 3);
    const [api, latest, asset] = requests;
    assert.equal(api.options.signal, latest.options.signal);
    assert.equal(latest.options.signal, asset.options.signal);
    for (const request of [latest, asset]) {
      assert.equal(request.options.method, "HEAD");
      assert.equal(request.options.redirect, "manual");
      assert.equal(request.options.headers?.Authorization, undefined);
    }
    assert.doesNotMatch(JSON.stringify(receipt), /signature|private/);
  }
});

test("网页兜底的同版本仍显示已更新，直接 ZIP 必须类型正确且长度非空", async () => {
  for (const contentType of ["application/zip", "application/octet-stream; charset=binary"]) {
    const receipt = await serviceFor(null, {
      currentVersion: "0.1.10",
      fetchImpl: publicFallbackFetch({ assetResponse: headResponse(200, { "content-type": contentType, "content-length": "1024" }) }),
    }).check();
    assert.equal(receipt.status, "current");
  }
  for (const assetResponse of [
    headResponse(404),
    headResponse(200, { "content-type": "text/html", "content-length": "1024" }),
    headResponse(200, { "content-type": "application/zip", "content-length": "0" }),
    headResponse(200, { "content-type": "application/zip" }),
    headResponse(301, { location: "https://release-assets.githubusercontent.com/test.zip" }),
  ]) {
    const receipt = await serviceFor(null, { fetchImpl: publicFallbackFetch({ assetResponse }) }).check();
    assert.equal(receipt.status, "unavailable");
    assert.equal(receipt.downloadUrl, null);
  }
});

test("网页兜底拒绝预发布、非法标签及其它仓库的版本指针", async () => {
  for (const location of [
    `${REPOSITORY_URL}/releases/tag/v0.1.10-beta.1`,
    `${REPOSITORY_URL}/releases/tag/v01.1.10`,
    `${REPOSITORY_URL}/releases/tag/v0.1.10/extra`,
    `${REPOSITORY_URL}/releases/tag/v0.1.10?redirect=evil`,
    "https://github.com/DAi0519/Other/releases/tag/v0.1.10",
    "https://evil.example/DAi0519/Interior-Design/releases/tag/v0.1.10",
  ]) {
    let calls = 0;
    const receipt = await serviceFor(null, {
      fetchImpl: async (url) => {
        calls += 1;
        return url === API_URL ? { ok: false, status: 403 } : headResponse(302, { location });
      },
    }).check();
    assert.equal(receipt.status, "unavailable", location);
    assert.equal(calls, 2);
  }
});

test("标准 ZIP 的重定向只允许 GitHub 资产域，不跟随恶意链接", async () => {
  for (const location of [
    "https://evil.example/test.zip", "http://release-assets.githubusercontent.com/test.zip",
    "https://release-assets.githubusercontent.com.evil.example/test.zip",
    "https://user:secret@release-assets.githubusercontent.com/test.zip",
    "https://release-assets.githubusercontent.com/test.zip#fragment", "/test.zip",
  ]) {
    const requests = [];
    const receipt = await serviceFor(null, {
      fetchImpl: publicFallbackFetch({ requests, assetResponse: headResponse(302, { location }) }),
    }).check();
    assert.equal(receipt.status, "unavailable", location);
    assert.equal(receipt.downloadUrl, null);
    assert.equal(requests.length, 3);
  }
});

test("404、未授权及不合格 Release 元数据均不触发网页兜底", async () => {
  for (const response of [
    { ok: false, status: 404 }, { ok: false, status: 401 },
    { ok: true, json: async () => ({ ...release(), assets: [] }) },
    { ok: true, json: async () => ({ ...release(), prerelease: true }) },
    { ok: true, json: async () => { throw new Error("invalid JSON"); } },
  ]) {
    let calls = 0;
    const receipt = await serviceFor(null, {
      fetchImpl: async () => { calls += 1; return response; },
    }).check();
    assert.equal(receipt.status, "unavailable");
    assert.equal(calls, 1);
  }
});

test("无效 JSON 及非法当前版本安全降级", async () => {
  const invalidJson = await serviceFor(null, {
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("secret JSON"); } }),
  }).check();
  assert.equal(invalidJson.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(invalidJson), /secret/);
  for (const currentVersion of ["bad", "01.2.3", "1.2.3-beta.01"]) {
    const receipt = await serviceFor(null, {
      currentVersion,
      fetchImpl: async () => assert.fail("非法当前版本不发送请求"),
    }).check();
    assert.equal(receipt.status, "unavailable");
  }
});

test("成功缓存 30 分钟，force 刷新但与进行中的请求去重", async () => {
  let currentTime = EPOCH;
  let calls = 0;
  let resolveRequest;
  const service = serviceFor(null, {
    now: () => currentTime,
    fetchImpl: () => {
      calls += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
  });
  const first = service.check();
  const concurrent = service.check({ force: true });
  assert.strictEqual(first, concurrent);
  await Promise.resolve();
  resolveRequest({ ok: true, json: async () => release() });
  const initial = await first;
  assert.equal(calls, 1);
  currentTime += 30 * 60_000 - 1;
  assert.strictEqual(await service.check(), initial);
  assert.equal(calls, 1);
  const forced = service.check({ force: true });
  assert.strictEqual(service.check(), forced);
  await Promise.resolve();
  resolveRequest({ ok: true, json: async () => release("0.1.11") });
  assert.equal((await forced).latestVersion, "0.1.11");
  assert.equal(calls, 2);
  currentTime += 30 * 60_000;
  const expired = service.check();
  await Promise.resolve();
  resolveRequest({ ok: true, json: async () => release("0.1.12") });
  assert.equal((await expired).latestVersion, "0.1.12");
  assert.equal(calls, 3);
});

test("失败只缓存 1 分钟，后续可恢复并重新计时", async () => {
  let currentTime = EPOCH;
  let calls = 0;
  const service = serviceFor(null, {
    now: () => currentTime,
    fetchImpl: async (url) => {
      if (url !== API_URL) return headResponse(503);
      calls += 1;
      return calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => release() };
    },
  });
  const failed = await service.check();
  currentTime += 59_999;
  assert.strictEqual(await service.check(), failed);
  assert.equal(calls, 1);
  currentTime += 1;
  const recovered = await service.check();
  assert.equal(recovered.status, "available");
  assert.equal(recovered.checkedAt, new Date(currentTime).toISOString());
  assert.equal(calls, 2);
});

test("网络即使不响应取消也在 8 秒内结束", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let networkSignal;
  const network = serviceFor(null, {
    fetchImpl: async (url, options) => {
      networkSignal = options.signal;
      return new Promise(() => {});
    },
  }).check();
  await Promise.resolve();
  t.mock.timers.tick(8_000);
  const receipt = await network;
  assert.equal(receipt.status, "unavailable");
  assert.match(receipt.message, /超时/);
  assert.equal(networkSignal.aborted, true);
});

test("API 与网页兜底共用总计 8 秒截止时间", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let releaseApi;
  let signal;
  let headStarted;
  const started = new Promise((resolve) => { headStarted = resolve; });
  const pending = serviceFor(null, {
    fetchImpl: (url, options) => {
      signal = options.signal;
      if (url === API_URL) return new Promise((resolve) => { releaseApi = resolve; });
      headStarted();
      return new Promise(() => {});
    },
  }).check();
  await Promise.resolve();
  t.mock.timers.tick(6_000);
  releaseApi({ ok: false, status: 403 });
  await started;
  t.mock.timers.tick(2_000);
  assert.equal((await pending).status, "unavailable");
  assert.equal(signal.aborted, true);
});

/**
 * [INPUT]: 依赖 GitHub 公开仓库正式 Release、正式版本网页指针与可注入的匿名请求和时钟
 * [OUTPUT]: 对外提供 createAppUpdateService，返回脱敏、限时、缓存并去重的更新检查回执
 * [POS]: src 的应用更新边界，只检测固定仓库的正式下载包，不下载、安装或修改本机配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const REPOSITORY = "DAi0519/Interior-Design";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const LATEST_RELEASE_URL = `${REPOSITORY_URL}/releases/latest`;
const RELEASE_ENDPOINT = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const REQUEST_TIMEOUT_MS = 8_000;
const SUCCESS_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 60_000;

class UpdateCheckFailure extends Error {
  constructor(message) {
    super(message);
    this.name = "UpdateCheckFailure";
  }
}

function parseVersion(value) {
  if (typeof value !== "string" || value.length > 256) return null;
  const match = value.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) return null;
  const prerelease = match[4]?.split(".") || [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;
  return { version: value.replace(/^v/, ""), core: match.slice(1, 4), prerelease };
}

function compareNumeric(left, right) {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  return left === right ? 0 : left > right ? 1 : -1;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const comparison = compareNumeric(left.core[index], right.core[index]);
    if (comparison) return comparison;
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return Number(!left.prerelease.length) - Number(!right.prerelease.length);
  }
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return compareNumeric(a, b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

async function withDeadline(operation, controller) {
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new UpdateCheckFailure("更新检查超时，请稍后重试。"));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function safeReleaseUrl(value, path) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.host !== "github.com" || url.username || url.password
      || url.search || url.hash || decodeURIComponent(url.pathname) !== `/${REPOSITORY}/releases/${path}`) return null;
    return `${REPOSITORY_URL}/releases/${path.split("/").map(encodeURIComponent).join("/")}`;
  } catch {
    return null;
  }
}

function releaseTagFromLocation(value) {
  try {
    const match = new URL(value).pathname.match(/^\/DAi0519\/Interior-Design\/releases\/tag\/([^/]+)$/);
    const tag = match && decodeURIComponent(match[1]);
    const version = parseVersion(tag);
    return version && !version.prerelease.length && safeReleaseUrl(value, `tag/${tag}`) ? tag : null;
  } catch {
    return null;
  }
}

function safeAssetRedirect(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.host === "release-assets.githubusercontent.com"
      && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function inspectRelease(release) {
  const latest = parseVersion(release?.tag_name);
  if (!latest || latest.prerelease.length || release.draft !== false || release.prerelease !== false) {
    throw new UpdateCheckFailure("暂未取得可下载的正式版本，请稍后重试。");
  }
  const releaseUrl = safeReleaseUrl(release.html_url, `tag/${release.tag_name}`);
  if (!releaseUrl) throw new UpdateCheckFailure("更新页面地址校验失败，请稍后重试。");
  const assetName = `canvas-lab-v${latest.version}.zip`;
  const asset = Array.isArray(release.assets) && release.assets.find((item) =>
    item?.name === assetName && item.state === "uploaded" && Number.isSafeInteger(item.size) && item.size > 0,
  );
  if (!asset) throw new UpdateCheckFailure("正式版本暂未提供标准下载包，请稍后重试。");
  const downloadUrl = safeReleaseUrl(asset.browser_download_url, `download/${release.tag_name}/${assetName}`);
  if (!downloadUrl) throw new UpdateCheckFailure("更新下载地址校验失败，请稍后重试。");
  return {
    latest,
    releaseUrl,
    downloadUrl,
    releaseNotes: typeof release.body === "string" ? release.body.slice(0, 4_000) : "",
  };
}

function httpFailure(status) {
  if (status === 404) {
    return new UpdateCheckFailure("暂时没有可用的正式 Release，请稍后重试。");
  }
  if (status === 403 || status === 429) {
    return new UpdateCheckFailure("更新检查受 GitHub 访问限制，请稍后重试。");
  }
  return new UpdateCheckFailure("GitHub 更新服务暂时不可用，请稍后重试。");
}

export function createAppUpdateService({
  currentVersion,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const versionText = String(currentVersion ?? "").trim();
  const current = parseVersion(versionText);
  let cached = null;
  let inflight = null;

  async function readPublicRelease(signal) {
    const options = { method: "HEAD", redirect: "manual", signal };
    const latest = await fetchImpl(LATEST_RELEASE_URL, options);
    if (latest.status !== 302) throw httpFailure(latest.status);
    const tag = releaseTagFromLocation(latest.headers.get("location"));
    if (!tag) throw new UpdateCheckFailure("更新页面地址校验失败，请稍后重试。");
    const version = parseVersion(tag);
    const assetName = `canvas-lab-v${version.version}.zip`;
    const downloadUrl = `${REPOSITORY_URL}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
    const asset = await fetchImpl(downloadUrl, options);
    const contentType = asset.headers?.get("content-type")?.split(";")[0].trim().toLowerCase();
    const contentLength = asset.headers?.get("content-length") || "";
    const size = /^\d+$/.test(contentLength) ? Number(contentLength) : 0;
    const directZip = asset.status === 200 && ["application/zip", "application/octet-stream"].includes(contentType)
      && Number.isSafeInteger(size) && size > 0;
    const redirectedZip = asset.status === 302 && safeAssetRedirect(asset.headers.get("location"));
    if (!directZip && !redirectedZip) {
      throw new UpdateCheckFailure("正式版本暂未提供可验证的标准下载包，请稍后重试。");
    }
    // GitHub /releases/latest 指向最新正式版；标准 ZIP 的 HEAD 验证成功后才接纳该版本。
    // https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
    return {
      latest: version,
      releaseUrl: `${REPOSITORY_URL}/releases/tag/${encodeURIComponent(tag)}`,
      releaseNotes: "更新说明请在版本页面查看。",
      downloadUrl,
    };
  }

  async function readRelease() {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Canvas-Lab-update-check",
    };
    const controller = new AbortController();
    return withDeadline(async () => {
      let response;
      try {
        response = await fetchImpl(RELEASE_ENDPOINT, { headers, signal: controller.signal, redirect: "error" });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return readPublicRelease(controller.signal);
      }
      if (!response.ok) {
        if ([403, 429].includes(response.status) || (response.status >= 500 && response.status <= 599)) {
          return readPublicRelease(controller.signal);
        }
        throw httpFailure(response.status);
      }
      let release;
      try {
        release = await response.json();
      } catch {
        throw new UpdateCheckFailure("更新信息格式无效，请稍后重试。");
      }
      return inspectRelease(release);
    }, controller);
  }

  async function inspectUpdate() {
    const receipt = {
      status: "unavailable",
      currentVersion: versionText,
      latestVersion: null,
      releaseUrl: LATEST_RELEASE_URL,
      downloadUrl: null,
      releaseNotes: "",
      checkedAt: "",
      message: "更新检查连接失败，请稍后重试。",
    };
    try {
      if (!current) throw new UpdateCheckFailure("当前版本号无效，无法检查更新。");
      const release = await readRelease();
      const available = compareVersions(current, release.latest) < 0;
      Object.assign(receipt, {
        status: available ? "available" : "current",
        latestVersion: release.latest.version,
        releaseUrl: release.releaseUrl,
        downloadUrl: release.downloadUrl,
        releaseNotes: release.releaseNotes,
        message: available ? `发现新版本 ${release.latest.version}，可前往下载。` : "当前版本不低于最新正式版本。",
      });
    } catch (error) {
      if (error instanceof UpdateCheckFailure) receipt.message = error.message;
    }
    receipt.checkedAt = new Date(now()).toISOString();
    return Object.freeze(receipt);
  }

  return {
    check({ force = false } = {}) {
      if (inflight) return inflight;
      if (!force && cached?.expiresAt > now()) return Promise.resolve(cached.value);
      inflight = inspectUpdate().then((value) => {
        cached = { value, expiresAt: now() + (value.status === "unavailable" ? FAILURE_TTL_MS : SUCCESS_TTL_MS) };
        return value;
      }).finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}

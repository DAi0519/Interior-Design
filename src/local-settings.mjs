/**
 * [INPUT]: 依赖 node:fs/path/url 与项目根目录可写的 .env.local
 * [OUTPUT]: 对外提供 OneAPI Key 本机持久化状态、原子写入与删除能力
 * [POS]: src 的本机设置边界，只管理 Canvas Lab 自有环境项，不接触飞书登录凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  chmod,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const LOCAL_SETTINGS_PATH = fileURLToPath(
  new URL("../.env.local", import.meta.url),
);

const ONEAPI_KEY_NAME = "ONEAPI_API_KEY";

async function readSettings(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

export function envValue(source, name) {
  const prefix = `${name}=`;
  const line = String(source || "")
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith(prefix));
  if (!line) return "";
  return line.trimStart().slice(prefix.length).trim();
}

export function updateEnvValue(source, name, value) {
  const lines = String(source || "").split(/\r?\n/);
  const prefix = `${name}=`;
  const replacement = value ? `${name}=${value}` : null;
  let replaced = false;
  const nextLines = [];

  for (const line of lines) {
    if (line.trimStart().startsWith(prefix)) {
      if (!replaced && replacement) nextLines.push(replacement);
      replaced = true;
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced && replacement) {
    while (nextLines.at(-1) === "") nextLines.pop();
    if (nextLines.length > 0) nextLines.push("");
    nextLines.push(replacement);
  }

  while (nextLines.length > 1 && nextLines.at(-1) === "") nextLines.pop();
  return nextLines.length === 1 && nextLines[0] === ""
    ? ""
    : `${nextLines.join("\n")}\n`;
}

async function writeSettings(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, {
      encoding: "utf8",
      mode: 0o600,
    });
    if (process.platform !== "win32") await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
    if (process.platform !== "win32") await chmod(filePath, 0o600);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

export async function hasPersistedOneApiKey(
  filePath = LOCAL_SETTINGS_PATH,
) {
  return Boolean(envValue(await readSettings(filePath), ONEAPI_KEY_NAME));
}

export async function persistOneApiKey(
  apiKey,
  filePath = LOCAL_SETTINGS_PATH,
) {
  const normalized = String(apiKey || "").trim();
  if (!/^sk-[A-Za-z0-9._-]{8,}$/.test(normalized)) {
    throw new TypeError("不能保存格式不正确的 API Key");
  }
  const source = await readSettings(filePath);
  await writeSettings(
    filePath,
    updateEnvValue(source, ONEAPI_KEY_NAME, normalized),
  );
  return { filePath, persisted: true };
}

export async function removePersistedOneApiKey(
  filePath = LOCAL_SETTINGS_PATH,
) {
  const source = await readSettings(filePath);
  if (!envValue(source, ONEAPI_KEY_NAME)) {
    return { filePath, persisted: false };
  }
  await writeSettings(
    filePath,
    updateEnvValue(source, ONEAPI_KEY_NAME, ""),
  );
  return { filePath, persisted: false };
}

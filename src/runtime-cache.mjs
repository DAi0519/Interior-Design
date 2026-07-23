/**
 * [INPUT]: 依赖调用方提供的缓存键、异步加载器、TTL 与可选时钟
 * [OUTPUT]: 对外提供带并发去重、过期淘汰和主动失效的进程内异步缓存
 * [POS]: src 的运行时缓存基础设施，被飞书配置目录读取边界复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function createAsyncTtlCache({
  maxEntries = 100,
  now = Date.now,
  ttlMs = 5 * 60 * 1000,
} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive number");
  }

  const entries = new Map();

  function prune() {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (!entry.pending && entry.expiresAt <= currentTime) entries.delete(key);
    }
    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value;
      entries.delete(oldestKey);
    }
  }

  async function get(key, loader, { force = false } = {}) {
    const normalizedKey = String(key);
    const current = entries.get(normalizedKey);
    if (!force && current) {
      if (current.pending) return current.pending;
      if (current.expiresAt > now()) return current.value;
      entries.delete(normalizedKey);
    }

    prune();
    const pending = Promise.resolve().then(loader);
    entries.set(normalizedKey, { expiresAt: Number.POSITIVE_INFINITY, pending });

    try {
      const value = await pending;
      if (entries.get(normalizedKey)?.pending === pending) {
        entries.set(normalizedKey, { expiresAt: now() + ttlMs, value });
      }
      return value;
    } catch (error) {
      if (entries.get(normalizedKey)?.pending === pending) {
        entries.delete(normalizedKey);
      }
      throw error;
    }
  }

  return {
    clear() {
      entries.clear();
    },
    delete(key) {
      return entries.delete(String(key));
    },
    get,
  };
}

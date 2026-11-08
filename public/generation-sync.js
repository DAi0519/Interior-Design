/**
 * [INPUT]: 依赖同源请求接口、单张图片归档回执及结果状态/链接/重试元素
 * [OUTPUT]: 提供当前图片的归档状态轮询与链接，允许失败归档只重试同步
 * [POS]: public 的三种平面图出图工作区共享归档交互
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const pollIntervalMs = 1500;
const maxPolls = 160;
const syncLabels = {
  pending: '正在同步飞书…',
  success: '已同步飞书',
  failed: '飞书同步失败',
  unavailable: '暂时无法读取飞书同步状态',
};

function safeRecordUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function bindGenerationSync({ api, container, status, link, retry }) {
  const known = new WeakMap();
  const retrying = new WeakSet();
  let active = null;
  let current = null;
  let revision = 0;
  let timer;

  function render() {
    const label = Object.hasOwn(syncLabels, current?.status) ? syncLabels[current.status] : '';
    container.hidden = !label;
    status.textContent = retrying.has(active) ? '正在提交同步重试…' : label;
    if (current?.error) status.setAttribute('title', current.error);
    else status.removeAttribute('title');
    const url = safeRecordUrl(current?.recordUrl);
    link.hidden = !url;
    if (url) link.href = url;
    else link.removeAttribute('href');
    retry.hidden = current?.status !== 'failed' || !current.generationId || current.retryable === false;
    retry.disabled = retry.hidden || retrying.has(active);
  }

  function setReceipt(receipt) {
    current = receipt;
    if (active && receipt.status !== 'unavailable') known.set(active, receipt);
    render();
  }

  function follow(version, attempt = 0) {
    const generationId = current?.generationId;
    if (current?.status !== 'pending' || !generationId) return;
    timer = setTimeout(async () => {
      if (version !== revision) return;
      try {
        const { sync } = await api(`/api/sync-jobs/${encodeURIComponent(generationId)}`);
        if (version !== revision) return;
        if (!sync || sync.generationId !== generationId || !['pending', 'success', 'failed'].includes(sync.status)) {
          throw new Error('归档状态无法确认');
        }
        setReceipt(sync);
        if (sync.status !== 'pending') return;
      } catch (error) {
        if (version !== revision) return;
        if (error.statusCode === 404) {
          setReceipt({ ...current, status: 'unavailable', error: '同步状态已过保留时间' });
          return;
        }
      }
      if (attempt + 1 < maxPolls) follow(version, attempt + 1);
      else setReceipt({ ...current, status: 'unavailable', error: '同步状态暂未确认' });
    }, pollIntervalMs);
  }

  retry.addEventListener('click', async () => {
    if (retry.hidden || retry.disabled) return;
    const source = active;
    const { generationId } = current;
    retrying.add(source);
    render();
    let failure = null;
    try {
      const { sync } = await api(`/api/sync-jobs/${encodeURIComponent(generationId)}/retry`, { method: 'POST', body: '{}' });
      if (sync?.generationId !== generationId || !['pending', 'success', 'failed'].includes(sync.status)) {
        throw new Error('同步重试状态无法确认');
      }
      known.set(source, sync);
    } catch (error) {
      failure = error;
    } finally {
      retrying.delete(source);
    }
    if (source !== active) return;
    if (failure) {
      render();
      status.textContent = '同步重试未确认';
      status.setAttribute('title', failure.message || '请求失败');
      return;
    }
    setReceipt(known.get(source));
    follow(revision);
  });

  return {
    show(receipt) {
      const next = receipt && typeof receipt === 'object' ? receipt : null;
      if (next === active) return;
      clearTimeout(timer);
      revision += 1;
      active = next;
      current = next && (known.get(next) || next);
      render();
      follow(revision);
    },
  };
}

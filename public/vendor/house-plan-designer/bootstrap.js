/**
 * [INPUT]: 依赖父页写入的单次 sessionStorage 预设及固定引擎的 __PRESET__ 启动约定
 * [OUTPUT]: 提供干净单层方案、禁用导入和网络，并将保存快捷键交给宿主
 * [POS]: 固定引擎执行前的唯一初始化层，原始模型/图片上传由 Canvas Lab 宿主管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(() => {
  const seed = new URLSearchParams(location.search).get('seed');
  const id = `canvas-layout-${crypto.randomUUID()}`;
  let preset = {
    id,
    spec: { name: '未命名方案', height: 2800, phase: 'renovate', walls: [], rooms: [], furniture: [], autoElec: false },
  };
  if (seed && /^[a-zA-Z0-9-]{1,80}$/.test(seed)) {
    const key = `canvas-lab:floor-plan:load:${seed}`;
    try {
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (!raw || raw.length > 2000000) throw new Error('平面方案加载数据缺失或过大');
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object' || !payload.id || (!payload.spec && !payload.plan)) throw new Error('平面方案加载格式无效');
      preset = payload;
    } catch (error) {
      window.__FLOOR_PLAN_LOAD_ERROR__ = String(error.message || error);
    }
  }
  window.__PRESET__ = preset;
  window.addEventListener('error', event => {
    window.__FLOOR_PLAN_RUNTIME_ERROR__ = String(event.message || '浏览器无法运行空间编辑器');
  });
  // -- 产品边界 -------------------------------------------------------------
  // 原包自身没有业务网络请求；识图与 AI 出图全部经过宿主后端。
  window.fetch = () => Promise.reject(new Error('平面编辑器不提供网络请求'));
  const blockUpload = event => {
    if (event.target?.matches?.('input[type="file"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener('click', blockUpload, true);
  document.addEventListener('change', blockUpload, true);
  document.addEventListener('drop', event => {
    if (event.dataTransfer?.files?.length) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.activeElement?.blur();
      document.dispatchEvent(new CustomEvent('canvas-floor-plan-save'));
      return;
    }
    if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if ((!event.ctrlKey && !event.metaKey && ['1', '2', '3', 'e', 'c', 'm', 'd'].includes(key)) || ((event.ctrlKey || event.metaKey) && key === 'o')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();

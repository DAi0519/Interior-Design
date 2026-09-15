/**
 * [INPUT]: 依赖 Pannellum 全局 viewer、全景结果图片的浏览器 Blob URL、预览 dialog 与 Toast 回调
 * [OUTPUT]: 对外提供全景功能判定与按需创建/复位/销毁 360° 等距柱状投影预览器
 * [POS]: public 的全景结果专属交互层，仅由 panoramaEnhancement 成功结果按需唤起
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const INITIAL_VIEW = Object.freeze({ hfov: 100, pitch: 0, yaw: 0 });

export function isPanoramaPreviewFeature(featureMode) {
  return featureMode === "panoramaEnhancement";
}

export function bindPanoramaViewer({
  prepareImage,
  root = document,
  showToast,
  viewerFactory = (element, config) => window.pannellum.viewer(element, config),
} = {}) {
  const dialog = root.querySelector("#panoramaViewerDialog");
  const container = root.querySelector("#panoramaViewerCanvas");
  const closeButton = root.querySelector("#panoramaViewerClose");
  const resetButton = root.querySelector("#panoramaViewerReset");
  const title = root.querySelector("#panoramaViewerTitle");
  let openId = 0;
  let viewer = null;
  let objectUrl = null;

  function destroyViewer() {
    openId += 1;
    viewer?.destroy();
    viewer = null;
    container.replaceChildren();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function close() {
    if (dialog.open) dialog.close();
    else destroyViewer();
  }

  function reset() {
    viewer?.lookAt(
      INITIAL_VIEW.pitch,
      INITIAL_VIEW.yaw,
      INITIAL_VIEW.hfov,
      500,
    );
  }

  async function open({ imageUrl, modelLabel, outputFormat }) {
    if (typeof window.pannellum?.viewer !== "function") {
      showToast("360°预览组件未就绪");
      return;
    }

    destroyViewer();
    const currentOpenId = ++openId;
    title.textContent = `${modelLabel} · 360°预览`;
    if (!dialog.open) dialog.showModal();
    try {
      const prepared = await prepareImage({ imageUrl, modelLabel, outputFormat });
      if (currentOpenId !== openId || !dialog.open) {
        URL.revokeObjectURL(prepared.objectUrl);
        return;
      }
      objectUrl = prepared.objectUrl;
      viewer = viewerFactory(container, {
        autoLoad: true,
        backgroundColor: [8, 8, 10],
        draggable: true,
        hfov: INITIAL_VIEW.hfov,
        keyboardZoom: true,
        maxHfov: 120,
        minHfov: 35,
        mouseZoom: true,
        panorama: objectUrl,
        pitch: INITIAL_VIEW.pitch,
        showControls: true,
        type: "equirectangular",
        yaw: INITIAL_VIEW.yaw,
      });
    } catch (error) {
      close();
      showToast(`360°预览失败：${error.message}`);
    }
  }

  closeButton.addEventListener("click", close);
  resetButton.addEventListener("click", reset);
  dialog.addEventListener("close", destroyViewer);

  return { close, open, reset };
}

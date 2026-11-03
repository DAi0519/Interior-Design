/**
 * [INPUT]: 依赖HTML中的atlas-data、分类图卡与原生dialog
 * [OUTPUT]: 对外提供分类/真实结果筛选、图片放大和Escape关闭及焦点恢复交互
 * [POS]: 建筑学长风格总览的离线与严格CSP同源共享交互，无网络调用、评分或生成能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(() => {
  "use strict";
  const data = JSON.parse(document.querySelector("#atlas-data").textContent);
  const cards = [...document.querySelectorAll(".style-card")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  const resultsOnly = document.querySelector("#resultsOnly");
  const dialog = document.querySelector("#imageDialog");
  const dialogImage = document.querySelector("#dialogImage");
  let activeCategory = "all", opener = null;
  function applyFilter() {
    let visible = 0;
    for (const card of cards) {
      card.hidden = !(activeCategory === "all" || card.dataset.category === activeCategory)
        || resultsOnly.checked && card.dataset.state !== "success";
      if (!card.hidden) visible += 1;
    }
    for (const section of document.querySelectorAll("[data-category-section]")) section.hidden = ![...section.querySelectorAll(".style-card")].some(card => !card.hidden);
    document.querySelector("#visibleCount").textContent = `显示 ${visible} 款`;
    document.querySelector("#emptyFilter").hidden = visible !== 0;
    for (const button of filters) button.setAttribute("aria-pressed", String(button.dataset.filter === activeCategory));
  }
  filters.forEach(button => button.addEventListener("click", () => { activeCategory = button.dataset.filter; applyFilter(); }));
  resultsOnly.addEventListener("change", applyFilter);
  for (const button of document.querySelectorAll("[data-open]")) button.addEventListener("click", () => {
    const id = button.dataset.open, image = data.assets[id];
    if (!image) return;
    const row = data.records.find(row => row.id === id);
    const name = id === "source" ? `原始底图 · ${data.source.name || "固定底图"}` : row.name;
    opener = button; dialogImage.src = image.dataUrl; dialogImage.alt = name;
    document.querySelector("#dialogTitle").textContent = name;
    document.querySelector("#dialogMeta").textContent = `原件 ${image.width} × ${image.height} · 预览 ${image.previewWidth} × ${image.previewHeight} · SHA ${image.sha256.slice(0, 12)}…`;
    dialog.showModal();
  });
  document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => { dialogImage.removeAttribute("src"); opener?.focus(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && dialog.open) { event.preventDefault(); dialog.close(); } });
})();

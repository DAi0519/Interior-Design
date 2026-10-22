/**
 * [INPUT]: 依赖三模型能力目录、固定语义控件模板、共享摄影机球、尺寸策略、主图上传、工作流配置与统一任务接口
 * [OUTPUT]: bindImageMultiAngle 单图工具控制器，公开能力/尺寸与Sunburst质量档位记忆、机位预览/结果切换、冻结模型/档位/机位请求和飞书同步结果任务
 * [POS]: public 的多角度主工作台适配层，不持有模型路径或提示词
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindCameraSphere } from "./camera-sphere.js";
import { planMultiAngleImage, MULTI_ANGLE_IMAGE_POLICY } from "./image-multi-angle-geometry.js";

const icon = (body, className = '') => `<svg class="${className}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const arrow = rotation => icon(`<path d="M12 18V6m-5 5 5-5 5 5" transform="rotate(${rotation} 12 12)"/>`);
const positionButtons = [
  ['315,45','左上',135],['0,60','上方',180],['45,45','右上',225],
  ['270,0','左侧',90],['0,0','正面',null],['90,0','右侧',270],
  ['315,-30','左下',45],['0,-30','下方',0],['45,-30','右下',315],
].map(([pose,label,rotation])=>`<button type="button" data-preset="${pose}" aria-pressed="false">${rotation === null ? icon('<rect x="5" y="6" width="14" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>') : arrow(rotation)}<span>${label}</span></button>`).join('');
const frameIcon = size => icon(`<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4"/><rect x="${12-size/2}" y="${12-size/2}" width="${size}" height="${size}" rx="1"/>`);
const CONTROLS = `
  <div class="section-heading"><h2 id="imageMultiAngleTitle">镜头设置</h2><button type="button" class="cs-reset" data-reset title="回到正面、平视和标准景别">${icon('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>')}<span>重置</span></button></div>
  <div class="cs-stage" aria-label="拖动球面改变摄影机方位，也可使用镜头设置调整">
    <div class="cs-stage-meta"><span data-pose-summary></span><span class="cs-reference-label">相对于原图</span></div>
    <canvas data-scene role="img" aria-label="立体摄影机围绕球心原图移动，镜头始终指向原图"></canvas>
    <canvas class="cs-camera-front" aria-hidden="true"></canvas>
    <button class="cs-camera-handle" type="button" aria-label="拖动摄影机，或使用方向键调整机位" hidden></button>
    <button class="cs-photo" type="button" data-photo aria-label="选择或更换原图"><span>${icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>')}<span>选择原图</span></span></button>
    <button class="cs-nudge cs-up" type="button" data-nudge="up" aria-label="提高机位">${icon('<path d="m8 14 4-4 4 4"/>')}</button>
    <button class="cs-nudge cs-down" type="button" data-nudge="down" aria-label="降低机位">${icon('<path d="m8 10 4 4 4-4"/>')}</button>
    <button class="cs-nudge cs-left" type="button" data-nudge="left" aria-label="向左旋转摄影机">${icon('<path d="m14 8-4 4 4 4"/>')}</button>
    <button class="cs-nudge cs-right" type="button" data-nudge="right" aria-label="向右旋转摄影机">${icon('<path d="m10 8 4 4-4 4"/>')}</button>
    <span class="cs-stage-label">${icon('<rect x="7" y="2" width="10" height="16" rx="5"/><path d="M12 5v3M3 18l-2 2 2 2m18-4 2 2-2 2M5 20h14"/>')}拖动旋转<span class="cs-key-hint"> · 方向键微调</span></span>
  </div>
  <div class="cs-model-group"><div class="cs-label" id="multiAngleModelLabel">生成模型</div><div class="cs-models" data-angle-models role="group" aria-labelledby="multiAngleModelLabel"></div></div>
  <label class="cs-quality-group" data-angle-quality-field hidden><span class="cs-label">质量档位</span><select aria-label="多角度质量档位" data-angle-quality></select></label>
  <div class="cs-controls">
    <div class="cs-label">摄像机方位</div>
    <div class="cs-presets" role="group" aria-label="常用摄影机方位">${positionButtons}</div>
    <div class="cs-slider">
      <div class="cs-slider-head"><label for="cs-azimuth">水平旋转</label><output for="cs-azimuth" data-az-value>0°</output></div>
      <input id="cs-azimuth" type="range" min="0" max="360" step="1" value="0"/>
      <div class="cs-ticks" aria-hidden="true"><span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span></div>
    </div>
    <div class="cs-slider">
      <div class="cs-slider-head"><label for="cs-elevation">俯仰角度</label><output for="cs-elevation" data-el-value>0°</output></div>
      <input id="cs-elevation" type="range" min="-30" max="60" step="1" value="0"/>
      <div class="cs-ticks" aria-hidden="true"><span>-30°</span><span>0°</span><span>30°</span><span>60°</span></div>
    </div>
    <div class="cs-framing-group"><div class="cs-label" id="framing-label">景别</div><div class="cs-framing" role="group" aria-labelledby="framing-label">
      <button type="button" data-distance="0" aria-pressed="false" title="镜头靠近，突出局部细节">${frameIcon(13)}<span>特写</span></button>
      <button type="button" data-distance="50" aria-pressed="true" title="保持标准观看距离">${frameIcon(8)}<span>标准</span></button>
      <button type="button" data-distance="100" aria-pressed="false" title="镜头后退，展示更多环境">${frameIcon(4)}<span>远景</span></button>
    </div></div>
  </div>
  <p class="compact-config-note">调整机位后点击 START，实际视角以出图为准。</p>
  <div class="multi-angle-output"><span>输出尺寸 <output data-angle-size>长边最高 2K</output></span><span>长边最高 2048px</span></div>
  <p data-angle-status class="compact-config-note" role="status">读取工作流中…</p>
`;

export function bindImageMultiAngle({ root, getSourceImage, onChange, emptyModel, emptySize, exactSize, uploadInput, onSourceChange = () => {} }) {
  root.innerHTML = CONTROLS;
  let config = { available: false, reason: "多角度工作流读取中" };
  let modelKey = "qwenMultiAngle";
  let quality = "medium";
  try { modelKey = sessionStorage.getItem("canvas-lab.multi-angle-model") || modelKey; } catch {}
  try { quality = sessionStorage.getItem("canvas-lab.multi-angle-quality") || quality; } catch {}
  const modelList = root.querySelector("[data-angle-models]");
  const qualityField = root.querySelector("[data-angle-quality-field]");
  const qualitySelect = root.querySelector("[data-angle-quality]");
  const selectedModel = () => config.models?.find(model => model.key === modelKey);
  const available = () => Boolean(selectedModel()?.available);
  const unavailableReason = () => selectedModel()?.reason || config.reason || "所选多角度模型不可用";
  function renderQuality() {
    const model = selectedModel();
    const options = model?.qualityOptions || [];
    qualityField.hidden = !options.length;
    qualitySelect.disabled = !options.length || !model.available;
    if (options.length && !options.includes(quality)) quality = model.defaultQuality || options[0];
    qualitySelect.replaceChildren(...options.map(value => {
      const option = document.createElement("option");
      option.value = option.textContent = value;
      option.selected = value === quality;
      return option;
    }));
  }
  qualitySelect.addEventListener("change", () => {
    if (!selectedModel()?.qualityOptions?.includes(qualitySelect.value)) return;
    quality = qualitySelect.value;
    try { sessionStorage.setItem("canvas-lab.multi-angle-quality", quality); } catch {}
    renderSummary(); onChange();
  });
  function renderModels() {
    modelList.replaceChildren(...(config.models || []).map(model => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.angleModel = model.key;
      button.textContent = model.key === "qwenMultiAngle" ? "Qwen" : model.key === "gptImage25Sunburst" ? "Sunburst" : model.label;
      button.title = model.available ? model.label : `${model.label}：${model.reason}`;
      button.setAttribute("aria-label", model.label);
      button.setAttribute("aria-pressed", String(model.key === modelKey));
      button.disabled = !model.available;
      button.addEventListener("click", () => {
        modelKey = model.key;
        try { sessionStorage.setItem("canvas-lab.multi-angle-model", modelKey); } catch {}
        renderModels(); renderSummary(); onChange();
      });
      return button;
    }));
    renderQuality();
  }
  const sphere = bindCameraSphere(root, { onChange, light: true });
  const photo = root.querySelector("[data-photo]");
  const output = root.querySelector("[data-angle-size]");
  const status = root.querySelector("[data-angle-status]");
  photo.addEventListener("click", () => uploadInput.click());
  function sourceIssue(source = getSourceImage()) {
    if (!source) return "请先上传1张原图";
    if (source.size > MULTI_ANGLE_IMAGE_POLICY.maxInputBytes) return "原图不能超过20MB";
    try { planMultiAngleImage(source.width, source.height); return ""; }
    catch (error) { return error.message; }
  }
  function renderSummary() {
    const source = getSourceImage();
    onSourceChange(source);
    let img = photo.querySelector("img");
    if (source) {
      if (!img) { img = document.createElement("img"); img.alt = "当前原图"; photo.append(img); }
      if (img.getAttribute("src") !== source.dataUrl) img.src = source.dataUrl;
      const ratio = source.width / source.height;
      photo.style.setProperty('--photo-width', `${Math.min(128, 132 * ratio)}px`);
      photo.style.setProperty('--photo-height', `${Math.min(132, 128 / ratio)}px`);
    } else img?.remove();
    photo.classList.toggle("has-image", Boolean(source));
    const issue = sourceIssue();
    const plan = issue ? null : planMultiAngleImage(source.width, source.height);
    emptyModel.textContent = selectedModel()?.label || "多角度";
    emptySize.textContent = exactSize.textContent = selectedModel()?.provider === "oneapi" ? "最高 2K · 按模型画幅" : plan ? `${plan.outputWidth} × ${plan.outputHeight}` : "长边最高 2K";
    output.textContent = selectedModel()?.provider === "oneapi" ? "最高 2K · 按模型画幅" : plan ? `${plan.outputWidth} × ${plan.outputHeight}` : "长边最高 2K";
    status.textContent = !available() ? unavailableReason() : issue || '';
    status.hidden = available() && !issue;
    status.classList.toggle("error", !available() || Boolean(source && issue));
    sphere.draw();
  }
  const currentItem = () => ({ key: modelKey, label: selectedModel()?.label || "多角度", provider: selectedModel()?.provider });
  return {
    configure(value) { config = value; renderModels(); if (!root.classList.contains("hidden")) renderSummary(); },
    activate: renderSummary, renderSummary, currentItem,
    availabilityReason: () => !available() ? unavailableReason() : sourceIssue(),
    isAvailable: () => available() && !sourceIssue(),
    inputPolicy: (base) => base && ({ ...base, maxBytesPerImage: MULTI_ANGLE_IMAGE_POLICY.maxInputBytes, maxTotalBytes: MULTI_ANGLE_IMAGE_POLICY.maxInputBytes, maxCount: 1 }),
    jobRequest({ image, jobId }) {
      const issue = !available() ? unavailableReason() : sourceIssue(image);
      if (issue) throw new Error(issue);
      const { dataUrl, name, size, type } = image;
      return { jobId, featureMode: "imageMultiAngle", batchId: null,
        sharedInput: { referenceImages: [{ dataUrl, name, size, type }] },
        items: [{ ...currentItem(), input: { multiAngleModel: modelKey, cameraPose: sphere.value(),
          ...(selectedModel()?.qualityOptions?.length ? { quality } : {}) } }] };
    },
    loadingCopy: () => "正在生成新的镜头视角…",
  };
}

/**
 * [INPUT]: 依赖公开遮罩填充目录、主图上传、共享参考图上传、画笔/矩形/自由圈选交互、纯请求规则与主工作台任务/摘要和飞书同步回调
 * [OUTPUT]: 对外提供三模型两模式、蓝色圈选物体推荐写法/独立指令记忆/仅异常提示、GPT画笔/矩形/自由圈选或纯指令与三档输出/五质量默认1K/medium、实际尺寸摘要及飞书任务
 * [POS]: public 的区域填充控制器，不持有上游地址或工作流正文；换模型保留三类独立历史，当前工具决定请求，权限失效及旧服务缺少对应选区能力时阻断原选择
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindReferenceUpload } from "./reference-upload.js?v=2";
import { bindMaskFillCanvas } from "./image-mask-fill-canvas.js";
import { buildMaskFillJobRequest, MASK_FILL_IMAGE_POLICY,
  MASK_FILL_MODES, MASK_FILL_MODELS, maskFillModel, MASK_FILL_INFERENCE_TIERS, MASK_FILL_GPT_RESOLUTIONS,
  maskFillGptOutputSize, maskFillOutputSize, maskFillImageIssue, maskFillMode } from "./image-mask-fill-geometry.js";

const PROMPT_EXAMPLES = {
  prompt: "推荐写法：移除图1中的吊灯，补全其后的窗户和背景。保持原机位、房间布局、其他物体和光线。",
  reference: "推荐写法：将图1中的床替换成图2的床，只参考床的造型和材质。保持图1的机位、房间布局、其他家具和光线，床的大小与透视符合原空间。",
};
const BOX_PROMPT_EXAMPLES = {
  prompt: "推荐写法：移除图1蓝色圈选区域内的吊灯，补全其后的窗户和背景。保持原机位、房间布局、其他物体和光线。",
  reference: "推荐写法：将图1蓝色圈选区域内的床替换成图2的床，只参考床的造型和材质。保持其他家具和光线，床的大小与透视符合原空间。",
};
const CONTROLS = `
  <div class="mask-fill-settings">
  <div class="section-heading"><h2 id="imageMaskFillTitle">填充设置</h2><span data-mask-availability class="micro-status" aria-live="polite">读取中</span></div>
  <label class="field"><span>填充模型</span><select data-mask-model aria-label="遮罩填充模型">${MASK_FILL_MODELS.map(model => `<option value="${model.key}">${model.label}</option>`).join("")}</select></label>
  <div class="mask-fill-mode-field"><span class="mask-fill-field-label">填充方式</span><div class="mask-fill-modes" role="radiogroup" aria-label="遮罩填充模式">
    <button type="button" data-mask-mode="prompt" role="radio" aria-checked="true" class="selected">提示词填充</button>
    <button type="button" data-mask-mode="reference" role="radio" aria-checked="false">参考图填充</button>
  </div></div>
  <div class="field-grid mask-fill-api-settings" data-mask-api-settings hidden>
    <label class="field"><span>输出档位</span><select data-mask-output aria-label="GPT遮罩填充输出档位">${MASK_FILL_GPT_RESOLUTIONS.map(value => `<option value="${value}">${value}</option>`).join("")}</select></label>
    <label class="field"><span>生成质量</span><select data-mask-quality aria-label="GPT遮罩填充生成质量"><option value="medium">medium</option></select></label>
  </div>
  <div data-mask-reference-section hidden>
    <div class="section-heading"><h3>填充参考图 <span class="optional">必填 · 1张</span></h3><span data-mask-reference-count class="reference-count">0 / 1</span></div>
    <label data-mask-reference-drop class="reference-drop-zone">
      <input class="reference-input" data-mask-reference-input type="file" accept="image/png,image/jpeg,image/webp" aria-label="添加填充参考图" />
      <span>添加或拖入填充参考图</span><small>PNG / JPEG / WebP · 单张6MB · 单边4096px</small>
    </label>
    <div data-mask-reference-list class="reference-list"></div>
  </div>
  <div class="mask-fill-prompt-block"><label class="mask-fill-instruction"><span>编辑指令</span><textarea data-mask-prompt maxlength="8000" aria-label="遮罩填充编辑指令" rows="5"></textarea></label>
  </div>
  <div class="field-grid mask-fill-parameters" data-mask-parameters>
    <label class="field" data-mask-tier-field><span>推理档位</span><select data-mask-inference aria-label="遮罩填充推理档位">${MASK_FILL_INFERENCE_TIERS.map(tier => `<option value="${tier.key}">${tier.label}</option>`).join("")}</select></label>
    <label class="field" data-mask-expand-field><span>遮罩扩展</span><input data-mask-expand type="number" aria-label="遮罩扩展像素" min="0" max="256" step="1" value="10" /></label>
  </div>
  <p data-mask-status class="compact-config-note" role="status" hidden></p>
  </div>
  <div class="mask-fill-preview" aria-label="遮罩绘制区">
    <p class="mask-fill-empty" data-mask-empty>上传原图，在这里涂抹需要填充的区域</p>
    <div class="mask-fill-frame" data-mask-frame hidden><img data-mask-source alt="遮罩填充原图" draggable="false" /><canvas data-mask-canvas aria-label="用画笔涂白需要填充的区域，支持鼠标和触屏"></canvas></div>
  </div>
  <div class="mask-fill-toolbar" aria-label="遮罩画笔工具">
    <div class="mask-fill-drawing-actions" role="group" aria-label="遮罩绘制工具">
      <button type="button" data-mask-tool="brush" aria-pressed="true" class="selected">画笔</button>
      <button type="button" data-mask-tool="erase" aria-pressed="false">擦除</button>
      <button type="button" data-mask-tool="box" aria-pressed="false" hidden>框选</button>
      <button type="button" data-mask-tool="lasso" aria-pressed="false" hidden>圈选</button>
      <button type="button" data-mask-undo disabled>撤销</button><button type="button" data-mask-clear disabled>清空</button>
    </div>
    <label class="mask-fill-brush"><span>画笔大小 <output data-mask-brush-size>32px</output></span><input data-mask-brush type="range" min="4" max="128" step="1" value="32" aria-label="画笔大小" /></label>
    <p data-mask-drawing-status class="compact-config-note" aria-live="polite">上传原图后，涂抹需要编辑的区域</p>
  </div>
`;

export function bindImageMaskFill({ root, getSourceImage, onChange, onSourceChange = () => {},
  showToast = () => {}, emptyModel, emptySize, exactSize }) {
  root.innerHTML = CONTROLS;
  const by = selector => root.querySelector(selector);
  const modeButtons = [...root.querySelectorAll("[data-mask-mode]")];
  const prompt = by("[data-mask-prompt]");
  const expand = by("[data-mask-expand]");
  const inference = by("[data-mask-inference]");
  const modelSelect = by("[data-mask-model]");
  const outputResolution = by("[data-mask-output]"); outputResolution.value = "1K";
  const quality = by("[data-mask-quality]"); quality.value = "medium";
  modelSelect.value = "flux2Klein";
  const referenceSection = by("[data-mask-reference-section]");
  const availability = by("[data-mask-availability]");
  const status = by("[data-mask-status]");
  const brush = by("[data-mask-brush]");
  const brushSize = by("[data-mask-brush-size]");
  let config = { available: false, reason: "遮罩填充配置读取中", modes: [] };
  let mode = "prompt";
  const values = { prompt: { prompt: "", expand: 10 }, reference: { prompt: "", expand: 80 } };
  prompt.value = values.prompt.prompt;
  prompt.placeholder = PROMPT_EXAMPLES.prompt;
  const drawing = bindMaskFillCanvas({ preview: by(".mask-fill-preview"), toolbar: by(".mask-fill-toolbar"),
    getBrushSize: () => brush.value, onChange: () => { renderMaskControls(); renderStatus(); onChange(); } });
  const referenceUpload = bindReferenceUpload({ count: by("[data-mask-reference-count]"),
    dropZone: by("[data-mask-reference-drop]"), input: by("[data-mask-reference-input]"),
    list: by("[data-mask-reference-list]"), getLimit: () => 1,
    getPolicy: () => MASK_FILL_IMAGE_POLICY, getSubject: () => "填充参考图", showToast,
    onChange: () => { renderStatus(); onChange(); } });
  const selectedModel = () => maskFillModel(modelSelect.value);
  const selectedModelConfig = () => config.models?.find(entry => entry.key === modelSelect.value);
  const selectedConfig = () => (selectedModelConfig()?.modes
    || (selectedModel().key === "flux2Klein" ? config.modes : []))?.find(entry => entry.key === mode);
  const gptConfig = () => config.models?.find(entry => entry.key === "gptImage25Sunburst");
  const missingModelConfig = () => Boolean(config.version) && config.available === true && !config.reason
    && selectedModel().key !== "flux2Klein" && !selectedModelConfig();
  const staleGpt = () => selectedModel().provider === "oneapi" && selectedConfig()?.available
    && (!gptConfig()?.sizes || !gptConfig()?.outputResolutions || !gptConfig()?.qualityOptions);
  const staleBoxSelection = () => selectedModel().provider === "oneapi" && drawing.isBoxSelection()
    && selectedConfig()?.available && selectedModelConfig()?.supportsBoxSelection !== true;
  const staleLassoSelection = () => selectedModel().provider === "oneapi" && drawing.isLassoSelection()
    && selectedConfig()?.available && selectedModelConfig()?.supportsLassoSelection !== true;
  const available = () => Boolean(selectedConfig()?.available) && !staleGpt() && !staleBoxSelection() && !staleLassoSelection();
  const unavailableReason = () => missingModelConfig() ? "遮罩填充模型配置未更新，请重启当前工作台后刷新页面"
    : staleGpt() ? "GPT输出档位配置未更新，请重启当前工作台"
    : selectedConfig()?.reason || config.reason
      || (staleLassoSelection() ? "圈选配置未更新，请重启当前工作台"
        : staleBoxSelection() ? "框选配置未更新，请重启当前工作台" : "遮罩填充工作流当前不可用");
  const currentItem = () => selectedModel().key === "flux2Klein"
    ? { key: MASK_FILL_MODES[mode].key, label: MASK_FILL_MODES[mode].label, provider: "comfyui" }
    : { key: `${modelSelect.value}-${mode}`, label: `${selectedModel().label} · ${mode === "prompt" ? "提示词填充" : "参考图填充"}`, provider: selectedModel().provider };
  const modelIssue = () => {
    const source = getSourceImage();
    return source && selectedModel().provider === "oneapi" && Math.max(source.width, source.height) / Math.min(source.width, source.height) > 3
      ? "Sunburst局部重绘仅支持1:3至3:1的原图比例" : "";
  };

  function renderStatus() {
    availability.textContent = available() ? "已就绪" : "不可用";
    availability.classList.toggle("ready", available());
    const sourceIssue = getSourceImage() && (maskFillImageIssue(getSourceImage()) || modelIssue());
    const referenceIssue = mode === "reference" && referenceUpload.images()[0]
      ? maskFillImageIssue(referenceUpload.images()[0], "填充参考图") : "";
    const issue = !available() ? unavailableReason() : sourceIssue || referenceIssue || "";
    status.textContent = issue;
    status.hidden = !issue;
    status.classList.toggle("error", Boolean(issue));
  }

  function selectMode(next) {
    values[mode] = { prompt: prompt.value, expand: expand.value };
    mode = maskFillMode(next);
    prompt.value = values[mode].prompt;
    prompt.placeholder = (drawing.isSelection() ? BOX_PROMPT_EXAMPLES : PROMPT_EXAMPLES)[mode];
    expand.value = values[mode].expand;
    referenceSection.hidden = mode !== "reference";
    modeButtons.forEach(button => {
      const selected = button.dataset.maskMode === mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    renderSummary(); onChange();
  }

  modeButtons.forEach((button, index) => {
    button.addEventListener("click", () => selectMode(button.dataset.maskMode));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? modeButtons.length - 1
        : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + modeButtons.length) % modeButtons.length;
      selectMode(modeButtons[next].dataset.maskMode); modeButtons[next].focus();
    });
  });
  [prompt, expand, inference].forEach(control => control.addEventListener("input", onChange));
  [modelSelect, outputResolution, quality].forEach(control => control.addEventListener("change", () => { renderSummary(); onChange(); }));
  brush.addEventListener("input", () => { brushSize.textContent = `${brush.value}px`; });

  function renderMaskControls() {
    const optional = selectedModel().key === "gptImage25Sunburst";
    const selection = optional && drawing.isSelection();
    by("[data-mask-expand-field]").hidden = selection;
    by("[data-mask-parameters]").hidden = selection;
    expand.disabled = optional && !drawing.hasMask();
    prompt.placeholder = (selection ? BOX_PROMPT_EXAMPLES : PROMPT_EXAMPLES)[mode];
  }

  function renderSummary() {
    const source = getSourceImage();
    const sunburst = selectedModel().provider === "oneapi";
    const qwen = selectedModel().key === "qwenImageEdit2511";
    by("[data-mask-api-settings]").hidden = !sunburst;
    by("[data-mask-tier-field]").hidden = sunburst || qwen;
    drawing.setBoxSelectionAvailable(sunburst);
    drawing.setMaskOptional(sunburst);
    drawing.setSource(source);
    renderMaskControls();
    onSourceChange(source);
    emptyModel.textContent = currentItem().label;
    let output = source && maskFillOutputSize(source);
    if (sunburst) { try { output = source && maskFillGptOutputSize(source, outputResolution.value, gptConfig()?.sizes); } catch { output = null; } }
    emptySize.textContent = exactSize.textContent = output ? `输出 ${output.width} × ${output.height}`
      : sunburst ? `原图比例 · ${outputResolution.value}输出` : "原图比例 · 输出最高2K";
    renderStatus();
  }

  function validate() {
    const hasMask = drawing.hasMask();
    const message = !available() ? unavailableReason() : maskFillImageIssue(getSourceImage()) || modelIssue()
      || (mode === "reference" ? maskFillImageIssue(referenceUpload.images()[0], "填充参考图") : "")
      || (!prompt.value.trim() ? "请填写明确的编辑指令" : "")
      || (!hasMask && selectedModel().key !== "gptImage25Sunburst" ? "请先在原图上涂抹需要编辑的区域" : "")
      || (hasMask && (!Number.isInteger(Number(expand.value)) || Number(expand.value) < 0 || Number(expand.value) > 256) ? "遮罩扩展应为0–256的整数" : "");
    return message ? { message } : null;
  }

  return {
    configure(value) {
      config = value;
      const choices = gptConfig()?.qualityOptions;
      if (choices?.length) {
        const previous = quality.value;
        quality.innerHTML = choices.map(value => `<option value="${value}">${value}</option>`).join("");
        quality.value = choices.includes(previous) ? previous : gptConfig().defaultQuality;
      }
      renderSummary();
    },
    activate: renderSummary, renderSummary, currentItem, validate,
    inputPolicy: () => MASK_FILL_IMAGE_POLICY,
    isAvailable: () => !validate(),
    availabilityReason: () => validate()?.message || "",
    loadingCopy: () => `正在${mode === "reference" ? "按参考图" : "按提示词"}${drawing.editRegion() ? "编辑圈选物体" : drawing.hasMask() ? "填充遮罩区域" : "编辑图片"}…`,
    jobRequest({ image, jobId }) {
      const issue = validate();
      if (issue) throw new Error(issue.message);
      const editRegion = drawing.editRegion();
      return buildMaskFillJobRequest({ image, jobId, mode, maskFillModel: modelSelect.value, prompt: prompt.value,
        inferenceTier: selectedModel().provider === "oneapi" ? undefined : selectedModel().key === "qwenImageEdit2511" ? "1mp" : inference.value,
        ...(selectedModel().provider === "oneapi" ? { outputResolution: outputResolution.value, quality: quality.value } : {}), maskExpand: expand.value,
        ...(editRegion ? { editRegion } : {}),
        ...(drawing.hasMask() ? { maskImage: drawing.exportMask() } : {}), fillReferenceImage: referenceUpload.images()[0] });
    },
  };
}

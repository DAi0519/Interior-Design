/**
 * [INPUT]: 依赖全景光影控件、共享输入/逐模型适配/尺寸规则与内存DOM/存储替身
 * [OUTPUT]: 验证共享小勾/紧凑数量、全景连续多选/取消/清空、同ID版本漂移勾选与准入一致、草稿隔离、用户词透传和模型/旧进程门禁
 * [POS]: test 的全景光影浏览器交互与请求合同测试，不访问网络、飞书或GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { bindPanoramaLightingControls, normalizePanoramaLighting, panoramaLightingValidation } from "../public/panorama-lighting-controls.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { adaptGenerationInputForModel } from "../public/generation-batch.js";
import { betaSizeOptions } from "../public/beta-model-rules.js";
import { generationFeatureUnavailableReason, sizeControlState, sizeSummary } from "../public/model-capabilities.js";

const SHA = "a".repeat(64);
const preset = { id: "recSunset", name: "斜阳长影", version: 3, sha256: SHA, previewUrl: "/api/refined-lighting/preview?id=recSunset" };
const selection = { presetId: preset.id, version: preset.version, sha256: SHA };
const secondPreset = { ...preset, id: "recNight", name: "暖灯静夜", sha256: "b".repeat(64) };
const flux = { key: "aiTextureEnhancement", label: "Flux2 Klein", provider: "comfyui", sizingMode: "source",
  defaultRatio: "source", defaultResolution: "2K", sizes: { source: { "1K": 1048576, "2K": 4194304 } },
  formats: ["png"], qualityOptions: [], defaultFormat: "png", panoramaWorkflow: { id: "panorama-r5-4", sourceSize: true } };
const oneapi = { key: "seedream5Pro", label: "Seedream", provider: "oneapi", defaultRatio: "2:1", defaultResolution: "2K",
  sizes: { "2:1": { "1K": "1440x720", "2K": "2880x1440" } }, formats: ["png"], qualityOptions: [], defaultFormat: "png" };

function fixture(storage = new Map(), storageKey = "main") {
  const document = { activeElement: null, createElement: () => element() };
  function element() {
    return { ownerDocument: document, value: "", textContent: "", children: [], attributes: new Map(), listeners: new Map(),
      classList: { toggle() {} },
      setAttribute(name, value) { this.attributes.set(name, String(value)); }, removeAttribute(name) { this.attributes.delete(name); },
      addEventListener(name, listener) { this.listeners.set(name, listener); },
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      focus() { document.activeElement = this; }, fire(name, event = {}) { return this.listeners.get(name)?.(event); },
    };
  }
  const nodes = new Map();
  const root = element();
  root.querySelector = selector => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
  const controller = bindPanoramaLightingControls({ root, storageKey, storage: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  } });
  controller.configure({ available: true, presets: [preset, secondPreset] });
  controller.setCapabilities({ panoramaEnhancement: { multipleLightingSelections: true } });
  return { controller, storage, at: key => nodes.get(`[data-panorama-${key}]`) };
}

test("全景光影默认原光影，选卡保持展开并保留焦点，清空后允许直接手写", () => {
  const ui = fixture();
  assert.deepEqual(ui.controller.requestFields(), { panoramaLighting: null, prompt: "" });
  assert.equal(ui.controller.requiresOriginalPrompt(), true);
  ui.at("toggle").fire("click");
  assert.equal(ui.at("grid").hidden, false);
  ui.at("grid").children[0].fire("click");
  assert.deepEqual(ui.controller.requestFields().panoramaLighting, selection);
  assert.equal(ui.at("grid").hidden, false);
  assert.equal(ui.at("grid").children[0].ownerDocument.activeElement, ui.at("grid").children[0]);
  assert.equal(ui.at("name").textContent, "斜阳长影");
  ui.at("prompt").value = "  改成暖灯夜景  "; ui.at("prompt").fire("input");
  assert.equal(ui.controller.requestFields().prompt, "改成暖灯夜景");
  ui.at("clear").fire("click");
  assert.equal(ui.controller.requestFields().panoramaLighting, null);
  assert.equal(ui.controller.requiresOriginalPrompt(), false);
  assert.equal(ui.at("name").textContent, "自定义光影");
  assert.equal(ui.controller.requestFields().prompt, "改成暖灯夜景");
  ui.at("prompt").value = ""; ui.at("prompt").fire("input");
  assert.equal(ui.at("name").textContent, "保留原光影");
  assert.equal(ui.controller.requiresOriginalPrompt(), true);
});

test("全景连续多选/重复取消、全部清空与独立要求保留，刷新恢复每张身份", () => {
  const ui = fixture();
  ui.at("toggle").fire("click");
  const firstCard = ui.at("grid").children[0];
  ui.at("grid").children[0].fire("click");
  ui.at("grid").children[1].fire("click");
  assert.equal(ui.controller.getSelections().length, 2);
  assert.equal(ui.at("name").textContent, "2 种光影");
  assert.deepEqual(ui.at("grid").children.map(card => card.children[2].hidden), [false, false]);
  assert.deepEqual(ui.at("grid").children.map(card => card.children[1].textContent), [preset.name, secondPreset.name]);
  assert.equal(ui.controller.validation(), null);
  const restored = fixture(ui.storage);
  assert.deepEqual(restored.controller.getSelections(), ui.controller.getSelections());
  ui.at("prompt").value = "保留材质颜色"; ui.at("prompt").fire("input");
  assert.equal(ui.at("grid").children[0], firstCard);
  ui.at("grid").children[0].fire("click");
  assert.equal(ui.controller.getSelections().length, 1);
  assert.equal(ui.controller.getSelections()[0].presetId, secondPreset.id);
  ui.at("clear").fire("click");
  assert.deepEqual(ui.controller.getSelections(), []);
  assert.equal(ui.controller.requestFields().prompt, "保留材质颜色");
  assert.equal(ui.controller.requiresOriginalPrompt(), false);
});

test("全景多选逐卡检查下架与旧进程能力，不因首卡有效放行其他卡", () => {
  const ui = fixture();
  ui.at("grid").children[0].fire("click"); ui.at("grid").children[1].fire("click");
  ui.controller.setCapabilities({});
  assert.match(ui.controller.validation(), /尚未支持多光影/);
  ui.controller.setCapabilities({ panoramaEnhancement: { multipleLightingSelections: true } });
  ui.controller.configure({ presets: [preset] });
  assert.match(ui.controller.validation(), /更新或下架/);
});

test("全景同ID模板版本漂移不显示有效勾选，保留失效草稿并可直接清空", () => {
  const ui = fixture();
  ui.at("grid").children[0].fire("click");
  ui.controller.configure({ presets: [{ ...preset, version: 4, sha256: "c".repeat(64) }] });
  assert.equal(ui.at("grid").children[0].attributes.get("aria-pressed"), "false");
  assert.equal(ui.at("grid").children[0].children[2].hidden, true);
  assert.match(ui.controller.validation(), /更新或下架/);
  assert.deepEqual(ui.controller.requestFields().panoramaLighting, selection);
  assert.equal(ui.at("name").textContent, "重新选择光影模板");
  assert.equal(ui.at("clear").hidden, false);
  ui.at("clear").fire("click");
  assert.equal(ui.controller.validation(), null);
  assert.deepEqual(ui.controller.getSelections(), []);
});

test("旧单卡草稿迁移与重复身份去重，不持久化预览和正文", () => {
  const storage = new Map([["main", JSON.stringify({ selection, prompt: "傍晚" })]]);
  assert.equal(fixture(storage).controller.getSelections()[0].presetId, preset.id);
  storage.set("main", JSON.stringify({ selections: [selection, selection], prompt: "" }));
  assert.equal(fixture(storage).controller.getSelections().length, 1);
});

test("全景卡片下架阻断选择，Main/Beta草稿互相隔离且不保存正文", () => {
  const storage = new Map(), main = fixture(storage, "main");
  main.at("grid").children[0].fire("click");
  main.at("prompt").value = "傍晚"; main.at("prompt").fire("input");
  const restored = fixture(storage, "main"), beta = fixture(storage, "beta");
  assert.deepEqual(restored.controller.requestFields(), { panoramaLighting: selection, prompt: "傍晚" });
  assert.equal(beta.controller.requestFields().panoramaLighting, null);
  restored.controller.configure({ presets: [] });
  assert.match(restored.controller.validation(), /更新或下架/);
  assert.deepEqual(normalizePanoramaLighting(selection), selection);
  assert.throws(() => normalizePanoramaLighting({ ...selection, prompt: "注入正文" }), /身份无效/);
  assert.equal(panoramaLightingValidation(null, {}), null);
  assert.doesNotMatch(storage.get("main"), /previewUrl|光影提示词|reference/);
});

test("全景用户光影要求和卡片身份透传，普通功能不携全景卡片", () => {
  const base = { model: flux, prompt: { panorama: "改成夜晚", free: "自由词", refined: "精模词" }, panoramaLighting: selection,
    renderMode: { mode: "smart-default" }, referenceImages: [], emptyRoomFields: {} };
  const panorama = buildGenerationInput({ ...base, featureMode: "panoramaEnhancement" });
  assert.equal(panorama.prompt, "改成夜晚"); assert.deepEqual(panorama.panoramaLighting, selection);
  assert.equal(buildGenerationInput({ ...base, featureMode: "effectEnhancement" }).prompt, "");
  assert.equal("panoramaLighting" in buildGenerationInput({ ...base, featureMode: "free" }), false);
});

test("R5_4全景只提供原尺寸，普通Flux保留2K，混选API逐模型使用自身档位", () => {
  const sourceImage = { width: 4096, height: 2048 };
  const controls = sizeControlState({ model: flux, featureMode: "panoramaEnhancement", currentResolution: "4K" });
  assert.deepEqual(controls.resolutionOptions.map(option => option.value), ["original"]);
  assert.equal(sizeSummary({ model: flux, featureMode: "panoramaEnhancement", sourceImage }).exactSize, "4096 × 2048 · R5_4 全景");
  assert.equal(sizeControlState({ model: flux, featureMode: "refinedModel" }).resolution, "2K");
  const input = { resolution: "original", ratio: "2:1", ratioMode: "original", outputFormat: "png" };
  assert.equal(adaptGenerationInputForModel(input, flux, { featureMode: "panoramaEnhancement", sourceImage }).resolution, "original");
  assert.equal(adaptGenerationInputForModel(input, oneapi, { featureMode: "panoramaEnhancement", sourceImage }).resolution, "2K");
  const beta = betaSizeOptions({ models: [flux], featureMode: "panoramaEnhancement" });
  assert.equal(beta.resolution, "original"); assert.match(beta.resolutionOptions[0].label, /原图尺寸/);
});


test("全景R5_4旧目录阻断普通Flux回退，新目录/OneAPI及原质感门禁保持正确", () => {
  const reason = "当前服务尚未加载R5_4全景链路，请使用已更新的工作台入口";
  assert.equal(generationFeatureUnavailableReason("panoramaEnhancement", ["panoramaEnhancement"], [{ ...flux, panoramaWorkflow: undefined }]), reason);
  assert.equal(generationFeatureUnavailableReason("panoramaEnhancement", ["panoramaEnhancement"], [{ ...flux, panoramaWorkflow: { id: "old-panorama" } }]), reason);
  assert.equal(generationFeatureUnavailableReason("panoramaEnhancement", ["panoramaEnhancement"], [oneapi, flux]), null);
  assert.equal(generationFeatureUnavailableReason("panoramaEnhancement", ["panoramaEnhancement"], [oneapi]), null);
  assert.equal(generationFeatureUnavailableReason("panoramaEnhancement", null, [oneapi]), reason);
  assert.equal(generationFeatureUnavailableReason("panoramaEnhancement", ["textureEnhancement"], [flux]), reason);
  assert.equal(generationFeatureUnavailableReason("free", null, [{ ...flux, panoramaWorkflow: undefined }]), null);
  assert.match(generationFeatureUnavailableReason("textureEnhancement", null), /尚未加载质感增强/);
  assert.equal(generationFeatureUnavailableReason("textureEnhancement", ["textureEnhancement"]), null);
});

test("Main在START和重试前复核所选模型，Beta批次准入和按钮均复核R5_4身份", async () => {
  const [main, beta] = await Promise.all([readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-app.js", import.meta.url), "utf8")]);
  assert.match(main, /generationFeatureUnavailableReason\(state\.featureMode, state\.generationFeatureModes, selectedModels\(\)\)/);
  assert.match(main, /getUnavailableReason: generationUnavailableReason/);
  assert.match(main, /async function generate\([^]*?const unavailableReason = generationUnavailableReason\(\);\s*if \(unavailableReason\) \{ showToast\(unavailableReason\); return; \}/);
  const admission = beta.match(/function assertFeatureConfig\(\) \{([^]*?)\n\}/)?.[1];
  assert.ok(admission);
  assert.match(admission, /generationFeatureUnavailableReason\(state\.featureMode, state\.catalog\.generationFeatureModes, selectedModels\(\)\)/);
  assert.match(admission, /if \(unavailableReason\) throw new Error\(unavailableReason\)/);
  assert.match(beta, /const lightingIssue = [^\n]*generationFeatureUnavailableReason\(state\.featureMode, state\.catalog\.generationFeatureModes, selectedModels\(\)\)/);
});


test("Beta失败重试按原任务功能与完整服务目录准入，不受当前界面改选影响", async () => {
  const source = await readFile(new URL("../public/beta-app.js", import.meta.url), "utf8");
  const beforePost = source.match(/if \(previousJob\?\.status === "failed" && previousJob\.jobId\) \{([^]*?)const \{ job \} = await api/)?.[1];
  assert.ok(beforePost, "失败重试必须在POST之前准入");
  assert.match(beforePost, /generationFeatureUnavailableReason\(previousJob\.featureMode, state\.catalog\.generationFeatureModes, state\.catalog\.models\)/);
  assert.doesNotMatch(beforePost, /selectedModels\(\)|state\.featureMode/);
  const admit = new Function("previousJob", "state", "generationFeatureUnavailableReason", beforePost);
  const previousJob = { featureMode: "panoramaEnhancement" };
  const state = { featureMode: "free", selectedModelKeys: [oneapi.key], catalog: { models: [oneapi, { ...flux, panoramaWorkflow: undefined }] } };
  assert.throws(() => admit(previousJob, state, generationFeatureUnavailableReason), /尚未加载R5_4全景链路/);
  state.catalog.generationFeatureModes = ["panoramaEnhancement"];
  assert.throws(() => admit(previousJob, state, generationFeatureUnavailableReason), /尚未加载R5_4全景链路/);
  state.catalog.models = [oneapi, flux];
  assert.doesNotThrow(() => admit(previousJob, state, generationFeatureUnavailableReason));
});

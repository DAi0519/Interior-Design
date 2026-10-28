/**
 * [INPUT]: 依赖精模模型默认/作用域选择器、Beta轻量持久化与真实公开模型目录
 * [OUTPUT]: 验证精模双图默认/权限降级/旧Flux迁移、手动选择保持及其它功能模型恢复，不调用付费模型
 * [POS]: test 的精模默认模型纯状态合同，与光影提示词准入和页面交互测试分工
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRefinedModelSelection, DEFAULT_REFINED_MODEL_KEY } from "../public/refined-model-controls.js";
import { normalizeBetaPageState } from "../public/beta-page-state.js";
import { publicModelCatalog } from "../src/model-config.mjs";

const catalog = publicModelCatalog();
const flux = ["aiTextureEnhancement"];
const availability = (keys) => catalog.map(model => ({key:model.key,available:keys.includes(model.key)}));

test("精模默认Banana2.1，Key无权限时仅从可用双图模型降级，无双图时不回退Flux", () => {
  const selection = createRefinedModelSelection();
  assert.deepEqual(selection.forFeature("refinedModel",flux,catalog),[DEFAULT_REFINED_MODEL_KEY]);
  assert.deepEqual(selection.forFeature("refinedModel",[DEFAULT_REFINED_MODEL_KEY],catalog,availability(["gptImage2","aiTextureEnhancement"])),["gptImage2"]);
  assert.deepEqual(selection.forFeature("refinedModel",["gptImage2"],catalog,availability(["aiTextureEnhancement"])),[]);
  assert.deepEqual(selection.forFeature("refinedModel",[],catalog,availability(["banana21","aiTextureEnhancement"])),["banana21"]);
});

test("初次进入保留已有双图选择，精模与其他功能各自恢复，配置刷新不覆盖手动选择", () => {
  const selection = createRefinedModelSelection();
  assert.deepEqual(selection.forFeature("whiteModel",flux,catalog),flux);
  let refined = selection.forFeature("refinedModel",flux,catalog);
  assert.deepEqual(refined,["banana21"]);
  refined = selection.chooseByUser("refinedModel",["gptImage2"]);
  assert.deepEqual(selection.forFeature("refinedModel",refined,catalog),["gptImage2"]);
  assert.deepEqual(selection.forFeature("emptyRoom",refined,catalog),flux);
  assert.deepEqual(selection.forFeature("refinedModel",["banana2"],catalog),["gptImage2"]);
  assert.deepEqual(selection.forFeature("free",["gptImage2"],catalog),["banana2"]);
  const existing = createRefinedModelSelection();
  assert.deepEqual(existing.forFeature("refinedModel",["seedream5Pro"],catalog),["seedream5Pro"]);
});

test("手动模型选择不受预设单图用途改变，Beta旧Flux默认迁移且显式选择跨页恢复", () => {
  assert.deepEqual(normalizeBetaPageState({featureMode:"refinedModel",selectedModelKeys:flux}).selectedModelKeys,["banana21"]);
  assert.deepEqual(normalizeBetaPageState({featureMode:"refinedModel"}).selectedModelKeys,["banana21"]);
  assert.deepEqual(normalizeBetaPageState({featureMode:"whiteModel"}).selectedModelKeys,flux);
  const selection = createRefinedModelSelection();
  selection.forFeature("refinedModel",flux,catalog);
  selection.chooseByUser("refinedModel",flux);
  assert.deepEqual(selection.forFeature("refinedModel",flux,catalog,availability([])),flux);
  const stored = normalizeBetaPageState({featureMode:"refinedModel",selectedModelKeys:flux,refinedModelSelection:selection.snapshot()});
  assert.deepEqual(stored.selectedModelKeys,flux);
  const restored = createRefinedModelSelection({saved:stored.refinedModelSelection});
  assert.deepEqual(restored.forFeature("refinedModel",flux,catalog),flux);
});

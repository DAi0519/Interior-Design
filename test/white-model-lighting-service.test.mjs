/**
 * [INPUT]: 依赖统一生成服务、白模光影功能守卫及会记录任何Key/客户端读取的内存替身
 * [OUTPUT]: 对外提供公开直调和按功能路由的白模光影跨功能/非法身份零调用阻断及自动兼容验证
 * [POS]: test 的白模光影服务入口回归，覆盖旧HTTP直调所用方法，不访问网络或付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationService } from "../src/generation-service.mjs";
import { assertWhiteModelLightingFeature } from "../src/white-model-lighting.mjs";

const selection = { presetId: "recLighting", version: 3, sha256: "a".repeat(64) };
const nonWhiteModes = ["free", "emptyRoom", "styleTransfer", "refinedModel", "lightingTransfer",
  "effectEnhancement", "effectBeautification", "panoramaEnhancement", "textureEnhancement",
  "imageUpscale", "imageMaskFill", "imageRelight", "imageMultiAngle", "imageOutpaint"];

function harness() {
  const calls = [];
  const sentinel = new Error("reached existing key or client path");
  const blocked = name => () => { calls.push(name); throw sentinel; };
  return { calls, sentinel, service: createGenerationService({
    requireApiKey: blocked("key"), imageClientForModel: blocked("image-client"),
    getSessionModelCatalog: blocked("model-catalog"),
    imageUpscaleClient: { generateImage: blocked("upscale") },
    scheduleGenerationSync: blocked("archive"),
  }) };
}

for (const mode of nonWhiteModes) test(`${mode}同步路由在任何Key或客户端读取前拒绝白模光影`, () => {
  const h = harness();
  assert.throws(() => h.service.executeForMode(mode, {
    featureMode: "whiteModel", modelKey: "gptImage2", whiteModelLighting: selection,
  }), error => error.statusCode === 400 && /白模/.test(error.message));
  assert.deepEqual(h.calls, []);
});

for (const method of ["executeFree", "executeRefined", "executeEffectEnhancement", "executeImageUpscale", "executeLightingTransfer"])
  test(`${method}直接调用也不能通过伪造whiteModel功能绕过光影守卫`, async () => {
    const h = harness();
    await assert.rejects(h.service[method]({ featureMode: "whiteModel", modelKey: "gptImage2",
      whiteModelLighting: selection }), error => error.statusCode === 400 && /白模/.test(error.message));
    assert.deepEqual(h.calls, []);
  });

for (const mode of ["emptyRoom", "styleTransfer"]) test(`executeDesign的${mode}在Key和客户端读取前拒绝白模光影`, async () => {
  const h = harness();
  await assert.rejects(h.service.executeDesign({ featureMode: mode, modelKey: "gptImage2",
    whiteModelLighting: selection }), error => error.statusCode === 400 && /白模/.test(error.message));
  assert.deepEqual(h.calls, []);
});

for (const invalid of [[selection], { ...selection, prompt: "client lighting" }, { ...selection, version: "3" }])
  test("白模路由和直接设计入口的非法卡片身份在Key和客户端读取前拒绝", async () => {
    const h = harness();
    const input = { featureMode: "whiteModel", modelKey: "gptImage2", whiteModelLighting: invalid };
    assert.throws(() => h.service.executeForMode("whiteModel", input), error => error.statusCode === 400);
    await assert.rejects(h.service.executeDesign(input), error => error.statusCode === 400);
    assert.deepEqual(h.calls, []);
  });

test("守卫允许各功能的自动空值，白模省略与显式自动继续进入原有Key路径", async () => {
  for (const mode of ["whiteModel", ...nonWhiteModes]) for (const value of [null, undefined]) {
    assert.doesNotThrow(() => assertWhiteModelLightingFeature({ whiteModelLighting: value }, mode));
  }
  for (const input of [{}, { whiteModelLighting: null }]) {
    const h = harness();
    await assert.rejects(h.service.executeDesign(input), error => error === h.sentinel);
    assert.deepEqual(h.calls, ["key"]);
  }
});

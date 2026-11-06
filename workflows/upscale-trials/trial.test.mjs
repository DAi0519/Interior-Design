/**
 * [INPUT]: 依赖node:test/assert与SUPIR实验图工厂
 * [OUTPUT]: 验证双支共用一次编码、相同采样参数且只改正向词、尺寸准入及请求产物前缀
 * [POS]: workflows/upscale-trials的离线实验合同测试，不访问远端或执行GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createSupirTrialWorkflow, supirArtifactPrefix } from "./supir.mjs";
import { createTileTrialWorkflow } from "./tile.mjs";

const make = (width = 2048) => createSupirTrialWorkflow({
  artifactKey: "audit", imageBase64: "", seed: 42, generationRequest: { width, height: 1152 },
});

test("两种Prompt共用一次VAE随机编码，采样设置完全相同", () => {
  const graph = make();
  assert.equal(Object.values(graph).filter(n => n.class_type === "SUPIR_encode").length, 1);
  assert.deepEqual(graph.baselineCondition.inputs.latents, graph.interiorCondition.inputs.latents);
  assert.deepEqual(graph.baselineSample.inputs.latents, graph.interiorSample.inputs.latents);
  const normalized = variant => ({ ...graph[`${variant}Sample`].inputs, positive: null, negative: null });
  assert.deepEqual(normalized("baseline"), normalized("interior"));
  assert.equal(graph.baselineCondition.inputs.negative_prompt, graph.interiorCondition.inputs.negative_prompt);
  assert.notEqual(graph.baselineCondition.inputs.positive_prompt, graph.interiorCondition.inputs.positive_prompt);
});

test("2K画布必须32对齐，防止节点隐式改变长宽比", () => {
  for (const width of [2047, 2080, NaN, -32]) assert.throws(() => make(width));
});

test("双结果顺序固定且只有一个请求级保存节点", () => {
  const graph = make();
  assert.deepEqual(graph.batch.inputs, { image1: ["baselineDecode", 0], image2: ["interiorDecode", 0] });
  assert.equal(graph.result.inputs.filename_prefix, supirArtifactPrefix("audit"));
  assert.equal(Object.values(graph).filter(n => n.class_type === "SaveImage").length, 1);
});

test("Tile使用同一原图latent与负向条件，只有正向文本不同", () => {
  const graph = createTileTrialWorkflow({ artifactKey: "audit", imageBase64: "", seed: 42, generationRequest: { width: 2048, height: 1152 } });
  assert.deepEqual(graph.baselineSample.inputs.latent_image, graph.interiorSample.inputs.latent_image);
  assert.deepEqual(graph.baselineControl.inputs.negative, graph.interiorControl.inputs.negative);
  const normalize = variant => ({ ...graph[`${variant}Sample`].inputs, positive: null, negative: null });
  assert.deepEqual(normalize("baseline"), normalize("interior"));
  assert.equal(graph.baselineSample.inputs.denoise, 0.3);
  assert.notEqual(graph.baselineText.inputs.text, graph.interiorText.inputs.text);
});

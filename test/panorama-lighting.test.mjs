/**
 * [INPUT]: 依赖 Node 测试/断言、默认全景附件、sharp 真实2:1图片、光影v2/v3/v4历史词、飞书分段规则夹具与Flux编译器及可注入共享美化服务
 * [OUTPUT]: 对外提供v4五处照明冲突修复/历史v3范围核验、全景Flux触发词最前与用户/卡片顺序、默认正文保留及OneAPI/PromptSHA同文归档
 * [POS]: test 的全景光影服务合同测试，使用内存光影库和模型，不调用GPU或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { executeEffectRenderEnhancementWorkflow as executeWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { composeFluxPanoramaPrompt } from "../src/effect-render-enhancement-prompt.mjs";
import {
  normalizePanoramaLighting, PANORAMA_LIGHTING_CONTRACT, PANORAMA_LIGHTING_IDENTITY,
  preparePanoramaLightingInput as prepareLighting, resolvePanoramaLightingInput as resolveLighting,
} from "../src/panorama-lighting.mjs";

import { loadPanoramaRule, panoramaRule } from "./panorama-lighting-fixture.mjs";
const executeEffectRenderEnhancementWorkflow = (input, options) => executeWorkflow(input, { loadPanoramaLightingRule: loadPanoramaRule, ...options });
const resolvePanoramaLightingInput = (input, options) => resolveLighting(input, { loadRule: loadPanoramaRule, ...options });
const preparePanoramaLightingInput = (input, options) => prepareLighting(input, { loadRule: loadPanoramaRule, ...options });

const sha256 = "a".repeat(64);
const preset = { id: "recLightingOne", code: "night-warm", name: "夜景暖光", version: 3, sha256,
  prompt: "Target a dark night atmosphere with warm 3000K existing lamps, low daylight, and gentle contrast." };
const selection = { presetId: preset.id, version: preset.version, sha256 };
const library = { presets: [preset] };
const imageBytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#999999" } }).png().toBuffer();
const image = { dataUrl: `data:image/png;base64,${imageBytes.toString("base64")}`,
  name: "panorama.png", type: "image/png", size: imageBytes.length };
const input = { featureMode: "panoramaEnhancement", modelKey: "gptImage2", resolution: "1K",
  ratio: "2:1", ratioMode: "original", outputFormat: "png", referenceImages: [image] };

async function documentedContract(version) {
  const document = await readFile(new URL(`../workflows/panorama-enhancement/光影规则模板-v${version}.md`, import.meta.url), "utf8");
  const body = version === 2
    ? document.match(/\n(Preserve the input's existing geometry,[\s\S]+?)\n\n\[LIGHTING PRESET\]/)?.[1]
    : document.match(/```text\n([\s\S]+?)\n```/)?.[1];
  assert.ok(body, `v${version}文档正文缺失`);
  return body;
}

test("全景Flux触发词统一最前，兼容附件尾词及已有前缀且重复编译不叠加", () => {
  for (const source of ["Preserve materials.", "Preserve materials. zhiganEnhance",
    "zhiganEnhance, Preserve materials.", "zhiganEnhance, Preserve materials. zhiganEnhance"]) {
    const prompt = composeFluxPanoramaPrompt(source);
    assert.equal(prompt, "zhiganEnhance Preserve materials.");
    assert.equal(composeFluxPanoramaPrompt(prompt), prompt);
  }
});

test("光影v4保留默认14句原文和顺序及照明适配，默认正文不变且触发词最前", async () => {
  const graph = JSON.parse(await readFile(new URL("../workflows/panorama-enhancement/FastFlux2_workflow.json", import.meta.url), "utf8"));
  const original = graph.nodes.find(node => node.title === "4").widgets_values_named.text;
  const body = original.replace(/ zhiganEnhance$/, "");
  assert.equal(composeFluxPanoramaPrompt(body), `zhiganEnhance ${body}`);
  assert.equal(composeFluxPanoramaPrompt(original), `zhiganEnhance ${body}`);
  assert.equal(PANORAMA_LIGHTING_IDENTITY.version, 4);
  const sentences = body.split(/(?<=[.!?])\s+/);
  assert.equal(sentences.length, 27);
  const changed = new Set([1, 3, 6, 8, 10, 13, 16, 18, 19, 24, 27]);
  const removed = new Set([25, 26]);
  let end = 0, preserved = 0;
  for (const [index, sentence] of sentences.entries()) {
    if (changed.has(index + 1) || removed.has(index + 1)) {
      assert.ok(!PANORAMA_LIGHTING_CONTRACT.includes(sentence), `旧照明限制仍存在：第${index + 1}句`);
    } else {
      const start = PANORAMA_LIGHTING_CONTRACT.indexOf(sentence, end);
      assert.ok(start >= end, `默认原句缺失或顺序改变：第${index + 1}句`);
      end = start + sentence.length;
      preserved += 1;
    }
  }
  assert.equal(preserved, 14);
  assert.match(PANORAMA_LIGHTING_CONTRACT, /brightness to follow the lighting target/);
  assert.match(PANORAMA_LIGHTING_CONTRACT, /brightness and the intensity of already discernible reflections to follow the lighting target/);
  assert.match(PANORAMA_LIGHTING_CONTRACT, /white balance and warm-and-cool variation consistent with the lighting target/);
  assert.match(PANORAMA_LIGHTING_CONTRACT, /color saturation consistent with the lighting target/);
  assert.doesNotMatch(PANORAMA_LIGHTING_CONTRACT, /Relight the supplied|whole sphere|no new light patterns|no new illumination regions/);
});

test("光影v3相对已存v2仅改暗玻璃与反射两处，其余正文逐字一致", async () => {
  const previous = await documentedContract(2), historical = await documentedContract(3);
  assert.equal(createHash("sha256").update(historical).digest("hex"), "3c4167532f69715756f1eed9393f4cfa46657c54fe9282ac028df9b3c2162936");
  const glass = " In dark or blurred glass and reflections, exposure changes must not reveal, reconstruct, or sharpen content that is not already clearly visible in the input.";
  const reflection = " Do not create new reflected objects, luminaires, interior layouts, or spaces behind glass, including when the target is darker outside and brighter indoors.";
  assert.ok(historical.includes(glass));
  assert.ok(historical.includes(reflection));
  const restored = historical.replace(glass, "").replace(reflection, "")
    .replace("the intensity of already discernible reflections", "reflection intensity");
  assert.equal(restored, previous);
});

test("光影v4仅新增照明重建首句并改v3五处冲突，玻璃保护与其余22条逐字保留", async () => {
  const previous = await documentedContract(3);
  const prefix = "Rebuild the illumination to match the lighting target; replace the input's time of day, light color, direct sunlight, sun patches, and cast-shadow patterns wherever they conflict with that target. Then preserve scene content as follows.";
  assert.ok(PANORAMA_LIGHTING_CONTRACT.startsWith(`${prefix} `));
  const restored = PANORAMA_LIGHTING_CONTRACT.slice(prefix.length + 1)
    .replace("camera perspective, physical boundaries, and object placement.", "camera perspective, boundaries, and object placement.")
    .replace("When an area is distant, dark, blurred, or ambiguous, preserve its original level of discernible detail and simple appearance, while allowing brightness to follow the lighting target.", "When an area is distant, dark, blurred, or ambiguous, retain its original visibility and tonal simplicity.")
    .replace("Preserve intrinsic material color and opacity, not the input's illumination color or color grade; allow the target's light colors and light-and-shadow separation to change apparent surface color and brightness while retaining material identity.", "Preserve intrinsic surface color and opacity, while allowing brightness to follow the lighting target.")
    .replace("In distant regions that remain bright under the lighting target, retain broad exposure roll-off with slightly reduced color separation, without recovering detail. Let window and exterior brightness follow the target time of day and exposure rather than preserving their input daytime brightness.", "In already bright distant regions, retain broad exposure roll-off with slightly reduced color separation, without recovering detail.")
    .replace("Apply the preset lighting target and then the user's refinements; user refinements override the preset lighting preferences while geometry, scene content, and intrinsic material identity remain fixed. The input's illumination, exposure, and shadow patterns are not fixed.", "Apply the preset target and then the user's refinements; user refinements override the preset lighting preferences while the geometry and material constraints above remain fixed.");
  assert.equal(restored, previous);
  assert.doesNotMatch(PANORAMA_LIGHTING_CONTRACT, /retain its original visibility|In already bright distant regions/);
  assert.match(PANORAMA_LIGHTING_CONTRACT, /light colors and light-and-shadow separation to change apparent surface color and brightness/);
  assert.equal(await documentedContract(4), PANORAMA_LIGHTING_CONTRACT);
  assert.equal(createHash("sha256").update(PANORAMA_LIGHTING_CONTRACT).digest("hex"), PANORAMA_LIGHTING_IDENTITY.sha256);
});

for (const mode of ["preserve", "preset", "custom"]) {
  test(`全景${mode}的Flux触发词位于用户要求及全部正文前且归档一致，OneAPI保持原正文`, async () => {
    const custom = mode === "preserve" ? "" : "Keep soft shadows.";
    const lighting = mode === "preset" ? selection : undefined;
    const requests = [];
    for (const modelKey of ["aiTextureEnhancement", "gptImage2"]) {
      let archived;
      const result = await executeEffectRenderEnhancementWorkflow({ ...input, modelKey,
        panoramaLighting: lighting, prompt: custom }, {
        loadPanoramaPrompt: async () => ({ code: "panorama-render-enhancement", version: 4,
          published: true, prompt: "Preserve materials." }),
        loadPanoramaLightingAssets: async () => library,
        imageClient: { async generateImage(value) { requests.push(value); return { images: [{ url: image.dataUrl }] }; } },
        scheduleSync(value) { archived = value; return { status: "pending" }; },
      });
      const actual = requests.at(-1).prompt;
      assert.equal(archived.finalPrompt, actual);
      assert.equal(archived.sourcePrompt, custom);
      assert.equal(result.request.panoramaLighting.promptSha256, createHash("sha256").update(actual).digest("hex"));
      assert.equal(archived.workflow.panoramaLighting.promptSha256, result.request.panoramaLighting.promptSha256);
      assert.equal((actual.match(/zhiganEnhance/g) || []).length, modelKey === "aiTextureEnhancement" ? 1 : 0);
      if (custom) assert.ok(actual.includes(`[USER LIGHTING REFINEMENTS]\n${custom}`));
      if (lighting) assert.ok(actual.includes(preset.prompt));
    }
    assert.equal(requests[0].prompt, `zhiganEnhance ${requests[1].prompt}`);
  });
}

test("未选模板且无自定义光影要求时保留独立全景Prompt，不读取光影库", async () => {
  assert.deepEqual(await resolvePanoramaLightingInput({}, {
    loadAssets: () => { throw new Error("不应读库"); },
  }), { selection: null, prompt: null, metadata: { mode: "preserve", execution: "prompt-only", imageRoles: { source: 1 } } });
  assert.equal(normalizePanoramaLighting(undefined), null);
  let request;
  const result = await executeEffectRenderEnhancementWorkflow(input, {
    loadPanoramaPrompt: async () => ({ code: "panorama-render-enhancement", name: "原光照美化",
      prompt: "Retain original illumination and improve panorama materials.", published: true, version: 7 }),
    imageClient: { generateImage: async value => { request = value; return { images: [{ url: image.dataUrl }] }; } },
  });
  assert.equal(request.prompt, "Retain original illumination and improve panorama materials.");
  assert.equal(result.prompt.version, 7);
  assert.equal(result.request.panoramaLighting.mode, "preserve");
});

test("用户要求前置，飞书光影槽原位置插卡片，规则/卡片身份冻结且正文不进入元数据", async () => {
  let options;
  const value = await resolvePanoramaLightingInput({ panoramaLighting: selection, prompt: "稍微压暗窗外" }, {
    loadAssets: async received => { options = received; return library; },
  });
  assert.deepEqual(options, { forceRefresh: true });
  assert.deepEqual(value.selection, selection);
  assert.match(value.prompt, /When an area is distant, dark, blurred, or ambiguous, retain its original level of discernible detail/);
  assert.match(value.prompt, /A bright, translucent, or reflective area is not evidence of additional visible content/);
  assert.match(value.prompt, /never add lamps, bulbs, or luminous strips/);
  assert.equal(value.prompt, `[USER LIGHTING REFINEMENTS]\n稍微压暗窗外\n\n${panoramaRule.prompt.replace("{LIGHTING_PRESET_PROMPT}", () => preset.prompt)}`);
  assert.doesNotMatch(value.prompt, /Use only existing illumination|same-condition restoration/);
  assert.equal(value.metadata.mode, "preset");
  assert.equal(value.metadata.preset.version, 3);
  assert.equal(value.metadata.preset.sha256, sha256);
  assert.equal(value.metadata.promptSha256, createHash("sha256").update(value.prompt).digest("hex"));
  assert.doesNotMatch(JSON.stringify(value.metadata), /Target a dark|稍微压暗/);
  const prepared = await preparePanoramaLightingInput({ panoramaLighting: selection, prompt: "test" }, { loadAssets: async () => library });
  assert.deepEqual(prepared.panoramaLighting, selection);
  assert.notEqual(prepared.panoramaLighting, selection);
  assert.equal(prepared.prompt, "test");
});

test("空白或省略用户要求不增加占位段，卡片正文和原光影分支保持不变", async () => {
  for (const prompt of [undefined, "", " \n "]) {
    const value = await resolvePanoramaLightingInput({ panoramaLighting: selection, prompt }, {
      loadAssets: async () => library,
    });
    assert.equal(value.prompt, panoramaRule.prompt.replace("{LIGHTING_PRESET_PROMPT}", () => preset.prompt));
    assert.equal(value.metadata.customPromptUsed, false);
    assert.equal("customPromptSha256" in value.metadata, false);
    const preserve = await resolvePanoramaLightingInput({ prompt }, {
      loadAssets: () => { throw new Error("原光影不应读库"); },
    });
    assert.equal(preserve.prompt, null);
    assert.equal(preserve.metadata.mode, "preserve");
  }
});

test("缺失/非法卡片身份、漂移或下架模板在提交模型前拒绝", async () => {
  for (const value of [{}, [], "recLightingOne", { ...selection, version: 0 },
    { ...selection, sha256: "bad" }, { ...selection, execution: "prompt-and-reference" }]) {
    assert.throws(() => normalizePanoramaLighting(value), error => error.statusCode === 400);
  }
  for (const presets of [[], [{ ...preset, version: 4 }], [{ ...preset, sha256: "b".repeat(64) }]]) {
    let submitted = false;
    await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, panoramaLighting: selection }, {
      loadPanoramaLightingAssets: async () => ({ presets }),
      imageClient: { generateImage: async () => { submitted = true; } },
    }), error => error.statusCode === 409);
    assert.equal(submitted, false);
  }
});

test("自定义光影独立执行时用户原文同样前置，不读取全景旧词和卡片库，长度及格式前置准入", async () => {
  const custom = "Convert to blue hour with warm interior lights.\nKeep the existing lamp positions.";
  const result = await resolvePanoramaLightingInput({ prompt: `  ${custom}\n` }, {
    loadAssets: () => { throw new Error("无需卡片"); },
  });
  assert.equal(result.metadata.mode, "custom");
  assert.equal(result.prompt, `[USER LIGHTING REFINEMENTS]\n${custom}\n\n${panoramaRule.prompt.replace("{LIGHTING_PRESET_PROMPT}", "")}`);
  assert.equal(result.metadata.customPromptSha256, createHash("sha256").update(custom).digest("hex"));
  assert.equal(result.metadata.promptSha256, createHash("sha256").update(result.prompt).digest("hex"));
  assert.equal("preset" in result.metadata, false);
  for (const prompt of [[], 5, "x".repeat(8001)]) {
    await assert.rejects(() => resolvePanoramaLightingInput({ prompt }), error => error.statusCode === 400);
  }
  await assert.rejects(() => resolvePanoramaLightingInput({ lightingReferenceImages: [image] }), /仅上传待处理全景图/);
  await assert.rejects(() => resolvePanoramaLightingInput({ styleReferenceImages: [image] }), /仅上传待处理全景图/);
});

test("OneAPI光影目标只通过Prompt发送，最终正文/用户词/卡片SHA进入服务端归档", async () => {
  let request, archived;
  const result = await executeEffectRenderEnhancementWorkflow({ ...input, panoramaLighting: selection, prompt: "Keep the lamps slightly dimmer." }, {
    loadPanoramaLightingAssets: async () => library,
    loadPanoramaPrompt: () => { throw new Error("不能读取旧的保原光照词"); },
    imageClient: { generateImage: async value => { request = value; return { images: [{ url: image.dataUrl }], metadata: { tokenUsage: 1 } }; } },
    scheduleSync: value => { archived = value; return { status: "pending" }; },
  });
  assert.equal("workflow_kind" in request, false);
  assert.equal("panoramaLighting" in request, false);
  assert.equal(request.images.length, 1);
  assert.ok(request.prompt.startsWith("[USER LIGHTING REFINEMENTS]\nKeep the lamps slightly dimmer.\n\n"));
  assert.ok(request.prompt.includes(preset.prompt));
  assert.equal(archived.finalPrompt, request.prompt);
  assert.equal(archived.sourcePrompt, "Keep the lamps slightly dimmer.");
  assert.equal(archived.workflow.promptCode, panoramaRule.code);
  assert.equal(archived.workflow.panoramaLighting.preset.sha256, sha256);
  assert.equal("effectTime" in archived.workflow, false);
  assert.equal("effectWeather" in archived.workflow, false);
  assert.equal(result.request.panoramaLighting.contract.version, 1);
  assert.doesNotMatch(JSON.stringify(result), /Target a dark|Keep the lamps/);
});

test("伪造2:1声明不能绕过全景真实图片尺寸准入，失败不读词/调用模型", async () => {
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#aaa" } }).png().toBuffer();
  const square = { ...image, dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, size: bytes.length, width: 64, height: 32 };
  await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, referenceImages: [square] }, {
    loadPanoramaPrompt: () => { throw new Error("不应读词"); },
    imageClient: { generateImage: () => { throw new Error("不应调用模型"); } },
  }), /真实尺寸为 2:1/);
});

test("全景长任务将进度与取消信号传递给实际图片客户端", async () => {
  const controller = new AbortController();
  const progress = [];
  await executeEffectRenderEnhancementWorkflow({ ...input, prompt: "Change to dusk." }, {
    signal: controller.signal, onProgress: value => progress.push(value),
    imageClient: { async generateImage(_request, options) {
      assert.equal(options.signal, controller.signal);
      options.onProgress({ phase: "executing" });
      return { images: [{ url: image.dataUrl }] };
    } },
  });
  assert.deepEqual(progress, [{ phase: "executing" }]);
});

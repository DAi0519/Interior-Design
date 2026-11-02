/**
 * [INPUT]: 依赖 node:test/assert 与精模 Prompt 飞书资产解析边界
 * [OUTPUT]: 对外提供同表三模式完整Prompt/正文SHA来源、旧精模按编码隔离、纯文本边界及目录脱敏回归保障
 * [POS]: test 的精模 Prompt 配置测试，不读取或修改真实飞书 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  getRefinedModelPrompt,
  parseRefinedModelPromptEnvelope,
  publicRefinedModelPromptConfig,
  publicRefinedLightingBasePromptConfig,
  REFINED_LIGHTING_BASE_PROMPT_CODE,
  loadRefinedLightingPromptAssets,
} from "../src/refined-model-prompt.mjs";

const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const envelope = (rows, hasMore = false) => ({
  data: { data: rows, fields, has_more: hasMore },
  ok: true,
});
const options = {
  config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
  run: async () => envelope([
    ["精模忠实渲染", "refined-model-render", 1, ["下架"], "fixed v1", "首版"],
    ["精模忠实渲染", "refined-model-render", 2, ["上架"], "fixed v2", "发布"],
    ["精模忠实渲染", "refined-model-render", 3, ["下架"], "fixed v3", "停用"],
  ]),
};

test("公开目录只包含已上架版本且绝不下发 Prompt 正文", async () => {
  const config = await publicRefinedModelPromptConfig(options);
  assert.equal(config.defaultVersion, 2);
  assert.deepEqual(config.versions.map((entry) => entry.version), [2]);
  assert.ok(config.versions.every((entry) => entry.published));
  assert.equal(JSON.stringify(config).includes("fixed v"), false);
});

test("同表基础与旧精模目录按编码隔离，新基础读取不依赖旧三列且仅接收纯文本", async () => {
  let queriedFields;
  const mixed = { ...options, run: async (_config, args) => {
    queriedFields = args.filter((_value, index) => args[index - 1] === "--field-id");
    return envelope([
      ["旧精模", "refined-model-render", 13, ["上架"], "OLD DAYTIME", "旧基础"],
      ["光影基础", REFINED_LIGHTING_BASE_PROMPT_CODE, 1, ["上架"], "NEUTRAL QUALITY BASE", "新基础"],
      ["已下架基础", REFINED_LIGHTING_BASE_PROMPT_CODE, 2, ["下架"], "RETIRED BASE", "停用"],
      ["其他Prompt", "unrelated", 99, ["上架"], "UNRELATED", "无关"],
    ]);
  } };
  const current = await publicRefinedLightingBasePromptConfig(mixed);
  assert.equal(current.defaultVersion, 1);
  assert.deepEqual(current.versions.map(({ code, version }) => ({ code, version })), [{ code: REFINED_LIGHTING_BASE_PROMPT_CODE, version: 1 }]);
  assert.equal(JSON.stringify(current).includes("NEUTRAL QUALITY"), false);
  assert.deepEqual(queriedFields, fields);
  const asset = await getRefinedModelPrompt(REFINED_LIGHTING_BASE_PROMPT_CODE, { ...mixed, version: 1 });
  assert.equal(asset.prompt, "NEUTRAL QUALITY BASE");
  assert.equal(asset.renderPrompt, undefined);
  assert.deepEqual(queriedFields, fields);
  assert.deepEqual((await publicRefinedModelPromptConfig(mixed)).versions.map(entry => entry.version), [13]);
  await assert.rejects(getRefinedModelPrompt(REFINED_LIGHTING_BASE_PROMPT_CODE, { ...mixed, version: 2 }), error => error.statusCode === 409);
  const modular = JSON.stringify({ MAIN: "wrong bundle", TIME: { DAYTIME: "d", DUSK: "s", NIGHT: "n" },
    WEATHER: { CLEAR: "c", OVERCAST: "o", RAINY: "r", FOGGY: "f" }, TONE: { WARM: "w", COOL: "c" } });
  const wrong = { ...options, run: async () => envelope([["错误基础", REFINED_LIGHTING_BASE_PROMPT_CODE, 1, ["上架"], modular, "错误"]]) };
  const unavailable = await publicRefinedLightingBasePromptConfig(wrong);
  assert.equal(unavailable.defaultVersion, null);
  assert.match(unavailable.reason, /独立纯文本/);
  await assert.rejects(getRefinedModelPrompt(REFINED_LIGHTING_BASE_PROMPT_CODE, wrong), error => error.statusCode === 409 && /独立纯文本/.test(error.message));
});

test("下架版本即使使用旧内部测试参数也必须阻断", async () => {
  for (const version of [1, 3]) {
    await assert.rejects(
      getRefinedModelPrompt("refined-model-render", { ...options, allowDraft: true, version }),
      (error) => error.statusCode === 409 && /尚未上架/.test(error.message),
    );
  }
  const current = await getRefinedModelPrompt("refined-model-render", {
    ...options,
    allowDraft: true,
  });
  assert.equal(current.version, 2);
  const selected = await getRefinedModelPrompt("refined-model-render", { ...options, version: 2 });
  assert.equal(selected.prompt, "fixed v2");
});

test("全下架时目录为空且不能默认回退到下架版本", async () => {
  const retired = {
    ...options,
    run: async () => envelope([
      ["精模忠实渲染", "refined-model-render", 1, ["下架"], "retired", "停用"],
    ]),
  };
  assert.deepEqual(await publicRefinedModelPromptConfig(retired), { defaultVersion: null, versions: [] });
  await assert.rejects(
    getRefinedModelPrompt("refined-model-render", { ...retired, allowDraft: true }),
    (error) => error.statusCode === 409,
  );
});

test("默认最高完整上架版本并排除状态缺失和正文不完整的记录", async () => {
  const candidates = {
    ...options,
    run: async () => envelope([
      ["精模忠实渲染", "refined-model-render", 2, ["上架"], "fixed v2", "发布"],
      ["精模忠实渲染", "refined-model-render", 4, ["上架"], "fixed v4", "发布"],
      ["精模忠实渲染", "refined-model-render", 5, [], "fixed v5", "未配置状态"],
      ["精模忠实渲染", "refined-model-render", 6, ["上架"], "", "缺正文"],
    ]),
  };
  const config = await publicRefinedModelPromptConfig(candidates);
  assert.equal(config.defaultVersion, 4);
  assert.deepEqual(config.versions.map((entry) => entry.version), [4, 2]);
  assert.equal((await getRefinedModelPrompt("refined-model-render", candidates)).version, 4);
});

test("拒绝不完整分页和缺失字段", () => {
  assert.throws(() => parseRefinedModelPromptEnvelope(envelope([], true)), /超过 200 条/);
  assert.throws(
    () => parseRefinedModelPromptEnvelope({ data: { data: [], fields: [] }, ok: true }),
    /缺少字段/,
  );
});

test("精模主正文保持纯文本，三列模块组成同一资产，部分配置排除且执行409阻断", async () => {
  const bundle={MAIN:"简洁基础",TIME:{DAYTIME:"白天",DUSK:"黄昏",NIGHT:"夜晚"},
    WEATHER:{CLEAR:"晴朗",OVERCAST:"阴天",RAINY:"雨天",FOGGY:"薄雾"},TONE:{WARM:"暖调",COOL:"冷调"}};
  let queriedFields;
  const candidates={...options,run:async (_config,args)=>{
    queriedFields=args.filter((value,index)=>args[index-1]==="--field-id");
    return {ok:true,data:{fields:[...fields,"时段提示词","天气提示词","色调提示词"],has_more:false,data:[
      ["旧精模","refined-model-render",10,["上架"],"legacy prompt","历史","","",""],
      ["简洁精模","refined-model-render",11,["上架"],bundle.MAIN,"模块化",JSON.stringify(bundle.TIME),JSON.stringify(bundle.WEATHER),JSON.stringify(bundle.TONE)],
      ["错误精模","refined-model-render",12,["上架"],"部分模块","错误",JSON.stringify(bundle.TIME),"",""],
    ]}};
  }};
  const config=await publicRefinedModelPromptConfig(candidates);
  assert.equal(config.defaultVersion,11);
  assert.deepEqual(config.versions.map(entry=>entry.version),[11,10]);
  assert.equal(config.versions[0].atmosphereSource,"refined-prompt");
  assert.equal(config.versions[0].atmosphereAvailable,true);
  assert.match(config.versions[0].tableUrl,/base\/base\?table=table$/);
  assert.equal("atmosphereSource" in config.versions[1],false);
  assert.match(config.reason,/v12/);
  assert.equal(JSON.stringify(config).includes("简洁基础"),false);
  assert.deepEqual(queriedFields,[...fields,"时段提示词","天气提示词","色调提示词"]);
  const asset=await getRefinedModelPrompt("refined-model-render",{...candidates,version:11});
  assert.equal(asset.prompt,"简洁基础");
  assert.deepEqual(JSON.parse(asset.renderPrompt),bundle);
  await assert.rejects(getRefinedModelPrompt("refined-model-render",{...candidates,version:12}),error=>error.statusCode===409);
});

test("三种执行完整Prompt只查精模表一次，按编码取最新完整上架正文并冻结真实来源", async () => {
  let queries = 0;
  const assets = await loadRefinedLightingPromptAssets({ ...options, forceRefresh: true,
    run: async (config, args) => {
      queries += 1;
      assert.equal(config.cliPath, "lark-cli");
      assert.equal(args[args.indexOf("--table-id") + 1], "table");
      assert.deepEqual(args.filter((_value, index) => args[index - 1] === "--field-id"), fields);
      const body = envelope([
        ["历史精模", "refined-model-render", 99, ["上架"], "LEGACY", "历史"],
        ["精模渲染｜仅提示词", "refined-lighting-base", 4, ["上架"], "OLD PURE", "旧版"],
        ["精模渲染｜仅提示词", "refined-lighting-base", 5, ["上架"], "COMPLETE PURE", "合并"],
        ["精模渲染｜仅提示词", "refined-lighting-base", 6, ["下架"], "RETIRED PURE", "下架"],
        ["精模渲染｜仅提示词", "refined-lighting-base", 7, ["上架"], "", "不完整"],
        ["精模渲染｜参考图迁移", "lighting-reference-transfer", 7, ["上架"], "COMPLETE REFERENCE", "迁入"],
        ["精模渲染｜氛围词＋参考图", "lighting-prompt-reference", 4, ["上架"], "COMPLETE HYBRID", "迁入"],
      ]);
      body.data.record_id_list = body.data.data.map((_row, index) => `rec${index}`);
      return body;
    } });
  assert.equal(queries, 1);
  assert.match(assets.promptTableUrl, /base\/base\?table=table$/);
  for (const [key, code, version, prompt, id] of [
    ["purePrompt", "refined-lighting-base", 5, "COMPLETE PURE", "rec2"],
    ["referenceRule", "lighting-reference-transfer", 7, "COMPLETE REFERENCE", "rec5"],
    ["hybridRule", "lighting-prompt-reference", 4, "COMPLETE HYBRID", "rec6"],
  ]) {
    const asset = assets[key];
    assert.equal(asset.code, code);
    assert.equal(asset.version, version);
    assert.equal(asset.prompt, prompt);
    assert.equal(asset.id, id);
    assert.equal(asset.published, true);
    assert.equal(asset.tableId, "table");
    assert.equal(asset.source, `feishu:table:${code}@v${version}`);
    assert.equal(asset.sha256, createHash("sha256").update(prompt).digest("hex"));
  }
});

test("三模式独立缺失或全下架返回null，不借用旧精模和其他编码", async () => {
  const assets = await loadRefinedLightingPromptAssets({ ...options, run: async () => envelope([
    ["旧精模", "refined-model-render", 99, ["上架"], "OLD", "历史"],
    ["纯词", "refined-lighting-base", 5, ["下架"], "RETIRED", "下架"],
    ["参考迁移", "lighting-reference-transfer", 7, ["上架"], "REFERENCE", "迁入"],
  ]) });
  assert.equal(assets.purePrompt, null);
  assert.equal(assets.hybridRule, null);
  assert.equal(assets.referenceRule.prompt, "REFERENCE");
});

test("三模式控制Prompt拒绝模块正文和重复上架版本", async () => {
  const modular = JSON.stringify({ MAIN: "wrong bundle", TIME: { DAYTIME: "d", DUSK: "s", NIGHT: "n" },
    WEATHER: { CLEAR: "c", OVERCAST: "o", RAINY: "r", FOGGY: "f" }, TONE: { WARM: "w", COOL: "c" } });
  for (const code of ["refined-lighting-base", "lighting-reference-transfer", "lighting-prompt-reference"]) {
    const wrong = { ...options, run: async () => envelope([["错误模式", code, 1, ["上架"], modular, "错误"]]) };
    await assert.rejects(loadRefinedLightingPromptAssets(wrong), error => error.statusCode === 409 && /独立纯文本/.test(error.message));
    await assert.rejects(getRefinedModelPrompt(code, wrong), error => error.statusCode === 409 && /独立纯文本/.test(error.message));
  }
  const row = ["重复纯词", "refined-lighting-base", 5, ["上架"], "PURE", "重复"];
  await assert.rejects(loadRefinedLightingPromptAssets({ ...options, run: async () => envelope([row, row]) }),
    error => error.statusCode === 409 && /重复上架版本/.test(error.message));
});

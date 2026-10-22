/**
 * [INPUT]: 依赖真实 PNG/SeedVR2 工作流元数据、Beta独立三表 Store/归档投影、正式生成服务与内存 CLI/超分客户端
 * [OUTPUT]: 验证六套稳定归档标签与冻结配置、两KS新4K/6K真实请求/尺寸/参数逐字段回读、无Prompt恢复、旧2X历史兼容及同步失败仅重归档
 * [POS]: test 的 Beta AI超分归档合同测试，不提交 GPU、收费请求或真实飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  BETA_BASE_CONFIG, betaFeatureLabel, buildBetaRunFields, captureBetaGenerationArchive, createBetaBaseStore,
} from "../src/beta-base.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { IMAGE_UPSCALE_WORKFLOWS, imageUpscaleWorkflowMetadata } from "../src/image-upscale-workflow.mjs";
import { LARK_SYNC_CONFIG } from "../src/lark-sync.mjs";

const key = "ks_seedvr2_2x_direct";
const definition = IMAGE_UPSCALE_WORKFLOWS[key];
const sourceBytes = await sharp({ create: { width: 384, height: 512, channels: 3, background: "#7b8592" } }).png().toBuffer();
const outputBytes = await sharp({ create: { width: 768, height: 1024, channels: 3, background: "#f37021" } }).png().toBuffer();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const outputUrl = `data:image/png;base64,${outputBytes.toString("base64")}`;
const source = { dataUrl: `data:image/png;base64,${sourceBytes.toString("base64")}`,
  type: "image/png", name: "source.png", size: sourceBytes.length };
const request = ({ workflowKey = key, resolution = "2X" } = {}) => ({ batchId: "BETA-upscalearchive01", featureMode: "imageUpscale", testTime: "2026-10-20 12:00:00",
  item: { caseId: "SAMPLE-1", runId: "RUN-upscale-archive01", attempt: 1,
    input: { featureMode: "imageUpscale", modelKey: workflowKey, upscaleWorkflowKey: workflowKey, resolution,
      outputFormat: "png", referenceImages: [source] } } });
const nativeMetadata = () => imageUpscaleWorkflowMetadata({ actualOutputHeight: 1024, actualOutputWidth: 768,
  artifactKey: "upscale-archive-fixture", executionDurationMs: 100, generationRequest: {
    ...request().item.input, sourceHeight: 512, sourceWidth: 384 }, height: 1024, width: 768,
  outputFilename: "upscale-result.png", outputSha256: digest(outputBytes), promptId: "prompt-upscale-fixture",
  queueDurationMs: 20, resolution: "2X", seed: 42 });
const metadata = () => ({ ...nativeMetadata(), feature: "image-upscale", provider: "comfyui" });
function result() {
  const upstream = metadata();
  const preview = { outputFormat: "png", resolution: "2X", referenceImageCount: 1, size: "768x1024", transport: "comfyui-workflow" };
  return { durationMs: 123, images: [{ url: outputUrl }], request: preview,
    upstream: { metadata: upstream, outputFormat: "png", transport: "comfyui-workflow" },
    workflow: { key, version: definition.version, label: definition.label },
    sync: captureBetaGenerationArchive({ durationMs: 123, modelLabel: definition.label, finalPrompt: "",
      preview, workflow: upstream, referenceImages: [source], resultImage: { url: outputUrl } }) };
}
const envelope = fields => ({ ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)],
  record_id_list: ["rec-upscale"], has_more: false } });

function fixture({ initialFields = {}, download = outputBytes } = {}) {
  const fields = structuredClone(initialFields), commands = [], uploads = [];
  let readTransform = null;
  const run = async (config, args, options = {}) => {
    commands.push(args);
    assert.equal(config.baseToken, BETA_BASE_CONFIG.baseToken);
    assert.notEqual(config.baseToken, LARK_SYNC_CONFIG.baseToken);
    assert.equal(args[args.indexOf("--table-id") + 1], BETA_BASE_CONFIG.tableId, "仅使用独立 Beta 跑图明细");
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(fields, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-upscale"] } };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1]));
      return { ok: true, data: {} };
    }
    if (args.includes("+record-upload-attachment")) {
      const fieldId = args[args.indexOf("--field-id") + 1];
      const name = { [BETA_BASE_CONFIG.inputFieldId]: "输入图", [BETA_BASE_CONFIG.styleReferenceFieldId]: "风格参考图",
        [BETA_BASE_CONFIG.resultFieldId]: "结果图" }[fieldId];
      assert.ok(name);
      const files = args.flatMap((arg, index) => arg === "--file" ? [args[index + 1]] : []);
      fields[name] = await Promise.all(files.map(async (file, index) => {
        const bytes = await readFile(join(options.cwd, file));
        uploads.push({ field: name, bytes });
        return { file_token: `${name}-${index}`, name: file, size: bytes.length };
      }));
      return { ok: true, data: {} };
    }
    if (args.includes("+record-download-attachment")) {
      await writeFile(join(options.cwd, args[args.indexOf("--output") + 1]), download);
      return { ok: true, data: {} };
    }
    if (args.includes("+record-get") || args.includes("+record-list")) {
      const returned = structuredClone(fields);
      if (args.includes("+record-get")) readTransform?.(returned, args);
      return envelope(returned);
    }
    throw new Error(`不允许的测试 CLI 命令：${args[1]}`);
  };
  return { store: createBetaBaseStore({ run }), fields, commands, uploads,
    freshStore: () => createBetaBaseStore({ run }), transformReads: transform => { readTransform = transform; } };
}

test("AI超分六个稳定工作流按真源标签冻结，客户端展示名和冲突模型不能改身份", () => {
  assert.equal(betaFeatureLabel("imageUpscale"), "AI超分");
  for (const workflow of Object.values(IMAGE_UPSCALE_WORKFLOWS)) {
    const input = { featureMode: "imageUpscale", modelKey: workflow.key, upscaleWorkflowKey: workflow.key,
      resolution: workflow.resolutions[0].key };
    const fields = buildBetaRunFields({ ...request(), item: { ...request().item, input, modelLabel: "伪造标签" } });
    assert.equal(fields["功能"], "AI超分");assert.equal(fields["出图模型"], workflow.label);
    assert.deepEqual(JSON.parse(fields["配置快照"]), { modelKey: workflow.key,
      upscaleWorkflowKey: workflow.key, resolution: input.resolution });
    assert.equal(JSON.parse(fields["场景参数"]).upscaleWorkflowKey, workflow.key);
  }
  for (const patch of [{ upscaleWorkflowKey: "missing" }, { modelKey: "banana21" }]) {
    assert.throws(() => buildBetaRunFields({ ...request(), item: { ...request().item,
      input: { ...request().item.input, ...patch } } }), error => error.statusCode === 409 && error.retryable === false);
  }
});

test("正式超分服务在Beta归档开关下捕获完整工作流和空Prompt，不访问OneAPI", async () => {
  let generated = 0, captured = 0;
  const service = createGenerationService({ archiveImageUpscale: true,
    imageClientForModel() { throw new Error("超分不应访问OneAPI"); },
    imageUpscaleClient: { async generateImage(input) {
      generated += 1;
      assert.equal(input.upscaleWorkflowKey, key);assert.equal(input.sourceWidth, 384);
      assert.equal(input.sourceHeight, 512);assert.equal(input.width, 768);assert.equal(input.height, 1024);
      return { images: [{ url: outputUrl }], outputFormat: "png", transport: "comfyui-workflow", metadata: nativeMetadata() };
    } },
    scheduleGenerationSync(payload) { captured += 1;return captureBetaGenerationArchive(payload); },
  });
  const actual = await service.executeForMode("imageUpscale", request().item.input);
  assert.equal(generated, 1);assert.equal(captured, 1);
  assert.equal(actual.sync.archiveFields["最终 Prompt"], "");
  const workflow = JSON.parse(actual.sync.archiveFields["生成参数"]).workflow;
  for (const [name, value] of Object.entries(nativeMetadata())) assert.deepEqual(workflow[name], value, name);
  assert.equal(workflow.feature, "image-upscale");
  assert.equal(workflow.inputMegapixels, null);
  assert.equal(workflow.sourceSha256, definition.sourceSha256);
  assert.notEqual(workflow.sourceSha256, digest(sourceBytes), "来源工作流摘要不冒充输入图片摘要");
  assert.doesNotMatch(JSON.stringify(actual.sync), /data:image|source\.png/);
});

test("独立Beta记录只在真实尺寸、工作流和原图/结果附件全部回读后完成", async () => {
  const ui = fixture();
  const run = await ui.store.beginRun(request());
  const archived = await ui.store.completeRun(run.recordId, result());
  assert.equal(ui.fields["尺寸"], "768x1024");
  assert.equal(ui.fields["最终 Prompt"], "");assert.equal(ui.fields["Prompt融合"], null);
  assert.equal(ui.fields["Prompt / 工作流版本"], `${key}@${definition.version}`);
  assert.equal(ui.fields["出图模型"], definition.label);
  assert.equal(ui.fields["状态"], "成功");assert.match(archived.previewUrl, /^data:image\/webp;base64,/);
  assert.deepEqual(ui.uploads.map(({ field }) => field), ["输入图", "结果图"]);
  assert.deepEqual(ui.uploads[0].bytes, sourceBytes);assert.deepEqual(ui.uploads[1].bytes, outputBytes);
  const workflow = JSON.parse(ui.fields["生成参数"]).workflow;
  assert.deepEqual(workflow, metadata());
  assert.equal(ui.fields["风格参考图"]?.length || 0, 0);
});

test("配置/参数/版本/真实尺寸与三类附件漂移均拒绝完成，不展示成功预览", async () => {
  for (const mutate of [
    fields => { fields["配置快照"] = "{}"; },
    fields => { fields["生成参数"] = "{}"; },
    fields => { fields["Prompt / 工作流版本"] = "fake@version"; },
    fields => { fields["尺寸"] = "1x1"; },
    fields => { fields["输入图"][0].size += 1; },
    fields => { fields["输入图"][0].file_token = ""; },
    fields => { fields["输入图"] = []; },
    fields => { fields["风格参考图"] = [{ file_token: "extra", size: 1 }]; },
    fields => { fields["结果图"].push({ ...fields["结果图"][0] }); },
  ]) {
    const ui = fixture();const run = await ui.store.beginRun(request());
    ui.transformReads(mutate);
    await assert.rejects(ui.store.completeRun(run.recordId, result()), error => error.statusCode === 409 && error.retryable === false);
  }
});

test("同步失败只重归档并复用已上传结果，恢复无Prompt记录时不丢工作流或重传图片", async () => {
  const ui = fixture();const run = await ui.store.beginRun(request());
  const generated = result();
  ui.transformReads(fields => { fields["生成参数"] = "{}"; });
  await assert.rejects(ui.store.completeRun(run.recordId, generated), /生成参数/);
  await ui.store.failRun(run.recordId, new Error("仅同步失败"), { retainArchive: true });
  ui.transformReads(null);
  const complete = await ui.store.completeRun(run.recordId, generated);
  assert.equal(complete.recordId, run.recordId);
  assert.equal(ui.uploads.filter(upload => upload.field === "结果图").length, 1);
  ui.fields["状态"] = "失败";ui.fields["错误信息"] = "进程重启前回读未确认";
  delete ui.fields["最终 Prompt"];
  const historical = JSON.parse(ui.fields["生成参数"]);
  historical.workflow.workflowVersion = "2026-10-20.1";
  ui.fields["生成参数"] = JSON.stringify(historical);
  ui.fields["Prompt / 工作流版本"] = `${key}@2026-10-20.1`;
  const before = ui.uploads.length;
  const recovered = await ui.freshStore().recoverRun(request());
  assert.equal(recovered.recordId, run.recordId);assert.equal(ui.fields["状态"], "成功");
  assert.equal(ui.uploads.length, before);
  assert.equal(ui.commands.filter(args => args.includes("+record-download-attachment")).length, 1);
  assert.deepEqual(JSON.parse(ui.fields["生成参数"]).workflow, { ...metadata(), workflowVersion: "2026-10-20.1" });
});

for (const workflowKey of ["ks_seedvr2_2x", "ks_seedvr2_2x_direct"]) {
  for (const [resolution, width, height] of [["4K", 3072, 4096], ["6K", 4608, 6144]]) {
    test(`${workflowKey} ${resolution}真实请求到独立归档/无Prompt恢复，拒绝伪造2X参数`, async () => {
      const bytes = await sharp({ create: { width, height, channels: 3, background: "#f37021" } }).png().toBuffer();
      const ui = fixture({ download: bytes }), batch = request({ workflowKey, resolution });
      let calls = 0, submitted;
      const service = createGenerationService({ archiveImageUpscale: true, scheduleGenerationSync: captureBetaGenerationArchive,
        imageClientForModel() { assert.fail("超分不能走OneAPI"); },
        imageUpscaleClient: { async generateImage(input) {
          calls++; submitted = input;
          await new Promise(resolve => setTimeout(resolve, 2));
          assert.equal(input.width, width); assert.equal(input.height, height);
          assert.equal(input.resolution, resolution);
          return { images: [{ url: `data:image/png;base64,${bytes.toString("base64")}` }], outputFormat: "png",
            transport: "comfyui-workflow", metadata: imageUpscaleWorkflowMetadata({ generationRequest: input,
              actualOutputWidth: width, actualOutputHeight: height, width, height, resolution,
              outputSha256: digest(bytes), artifactKey: "long-edge-archive", outputFilename: "long-edge.png",
              promptId: "prompt-long-edge", seed: 42 }) };
        } },
      });
      const run = await ui.store.beginRun(batch);
      const actual = await service.executeForMode("imageUpscale", batch.item.input);
      await ui.store.completeRun(run.recordId, actual);
      assert.equal(calls, 1);
      assert.equal(submitted.images[0].image_url, source.dataUrl);
      assert.equal(ui.fields["出图模型"], IMAGE_UPSCALE_WORKFLOWS[workflowKey].label, "公开新名称不迁移稳定归档单选");
      assert.equal(ui.fields["尺寸"], `${width}x${height}`);
      assert.deepEqual(JSON.parse(ui.fields["配置快照"]), { modelKey: workflowKey, upscaleWorkflowKey: workflowKey, resolution, outputFormat: "png" });
      const parameters = JSON.parse(ui.fields["生成参数"]), workflow = parameters.workflow;
      assert.equal(parameters.resolution, resolution);
      assert.equal(workflow.resolution, resolution);
      assert.equal(workflow.workflowId, workflowKey);
      assert.equal(workflow.workflowVersion, "2026-10-21.1");
      assert.equal(workflow.outputScale, undefined);
      assert.equal(workflow.seedVrMaxResolution, height);
      assert.equal(workflow.seedVrResolution, width);
      assert.equal(workflow.inputMegapixels, IMAGE_UPSCALE_WORKFLOWS[workflowKey].inputMegapixels);
      assert.equal(workflow.outputSha256, digest(bytes));
      assert.deepEqual([workflow.sourceWidth, workflow.sourceHeight], [384, 512]);
      assert.deepEqual(ui.uploads.map(({ bytes: uploaded }) => digest(uploaded)), [digest(sourceBytes), digest(bytes)]);
      ui.fields["状态"] = "失败"; delete ui.fields["最终 Prompt"];
      const uploads = ui.uploads.length;
      await ui.freshStore().recoverRun(batch);
      assert.equal(ui.fields["状态"], "成功"); assert.equal(ui.uploads.length, uploads); assert.equal(calls, 1);
      assert.deepEqual(JSON.parse(ui.fields["生成参数"]).workflow, workflow);
      for (const mutate of [value => { value.outputScale = 2; }, value => { value.seedVrMaxResolution = 0; }]) {
        const wrong = structuredClone(ui.fields), parameters = JSON.parse(wrong["生成参数"]);
        mutate(parameters.workflow); wrong["生成参数"] = JSON.stringify(parameters);
        const drifted = fixture({ initialFields: wrong, download: bytes });
        await assert.rejects(drifted.store.recoverRun(batch), { statusCode: 409, retryable: false });
        assert.equal(drifted.uploads.length, 0);
      }
    });
  }
}

test("历史超分缺失/串用工作流元数据、请求参数、输出SHA或真实附件时禁止恢复", async () => {
  const original = fixture();const run = await original.store.beginRun(request());
  await original.store.completeRun(run.recordId, result());
  for (const mutate of [
    workflow => { delete workflow.inputMegapixels; },
    workflow => { workflow.workflowId = "ks_seedvr2_2x"; },
    workflow => { workflow.sourceSha256 = "0".repeat(64); },
    workflow => { workflow.requestedOutputWidth += 2; },
    workflow => { workflow.resolution = "4K"; },
    workflow => { workflow.outputSha256 = "0".repeat(64); },
  ]) {
    const fields = structuredClone(original.fields);
    const parameters = JSON.parse(fields["生成参数"]);mutate(parameters.workflow);fields["生成参数"] = JSON.stringify(parameters);
    const ui = fixture({ initialFields: fields });
    await assert.rejects(ui.store.recoverRun(request()), error => error.statusCode === 409 && error.retryable === false);
    assert.equal(ui.uploads.length, 0);
    assert.equal(ui.commands.some(args => args.includes("+record-upsert")), false);
  }
  const truncated = fixture({ initialFields: original.fields, download: outputBytes.subarray(0, -1) });
  await assert.rejects(truncated.store.recoverRun(request()), /字节数、尺寸或 SHA-256/);
});

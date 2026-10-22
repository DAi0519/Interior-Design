/**
 * [INPUT]: 依赖 node:test/assert、crypto/fs、sharp真实PNG与Beta独立Base Store的CLI替身
 * [OUTPUT]: 对外提供已有结果附件的字节/尺寸/SHA-256与冻结字段恢复、数值机器精度容差、真实差异阻断及同步重试上传幂等合同
 * [POS]: test 的 Beta失败归档恢复回归保障，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { BETA_BASE_CONFIG, buildBetaRunFields, createBetaBaseStore } from "../src/beta-base.mjs";

const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f37021" } }).png().toBuffer();
const hash = createHash("sha256").update(bytes).digest("hex");
const image = `data:image/png;base64,${bytes.toString("base64")}`;
function envelope(fields) { return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: ["rec-existing"], has_more: false } }; }
function fixture({ mutate = () => {}, download = bytes, driftAfterWrite = false } = {}) {
  const request = { batchId: "BETA-recoverytest01", featureMode: "imageOutpaint", testTime: "2026-10-19 15:51:58",
    item: { caseId: "CASE-1", runId: "RUN-recoverytest01", attempt: 1, input: {
      featureMode: "imageOutpaint", outpaintEngine: "gptImage25Sunburst", outpaintWorkflowKey: "outpaint-sunburst",
      outpaintCanvas: { ratio: "original", resolution: "2K", scale: 2 / 3, position: { x: 0.5, y: 0.5 } },
    } } };
  const fields = { ...buildBetaRunFields(request),
    "状态": ["失败"], "错误信息": "飞书生成信息回读不一致：费用（USD）",
    "结果图": [{ file_token: "file-result", name: "result.png", size: bytes.length }],
    "输入图": [{ file_token: "file-input", name: "input.png", size: bytes.length }], "风格参考图": [],
    "最终 Prompt": "Extend this room with consistent architecture.", "尺寸": "8x8", "时延（ms）": 2042,
    "Prompt / 工作流版本": "image-outpaint-sunburst@2026-10-15.2", "Prompt融合": null,
    "费用（USD）": 0.020485, "生成参数": JSON.stringify({ workflow: {
      outputSha256: hash, outputWidth: 8, outputHeight: 8, workflowId: "image-outpaint-sunburst",
      workflowVersion: "2026-10-15.2", usageCost: { costUsd: 0.020485000000000003 },
    } }),
  };
  mutate(fields);
  const commands = [];
  let wrote = false;
  const store = createBetaBaseStore({ async run(_config, args, options) {
    commands.push(args);
    if (args.includes("+record-list") || args.includes("+record-get")) {
      const returned = JSON.parse(JSON.stringify(fields));
      if (wrote && driftAfterWrite) returned["配置快照"] = "{}";
      return envelope(returned);
    }
    if (args.includes("+record-download-attachment")) {
      await writeFile(join(options.cwd, args[args.indexOf("--output") + 1]), download);
      return { ok: true, data: {} };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1])); wrote = true;
      return { ok: true, data: {} };
    }
    throw new Error(`恢复不得创建记录或上传附件：${args[1]}`);
  } });
  return { store, fields, request, commands };
}

test("恢复已有扩图核验实际附件和冻结元数据，只完成原记录，容忍USD机器精度尾差", async () => {
  const { store, request, fields, commands } = fixture();
  const result = await store.recoverRun(request);
  assert.equal(result.recordId, "rec-existing");
  assert.equal(result.runId, request.item.runId);
  assert.equal(result.attempt, 1);
  assert.equal(fields["状态"], "成功");
  assert.equal(fields["错误信息"], "");
  assert.equal(commands.filter((args) => args.includes("+record-download-attachment")).length, 1);
  assert.deepEqual(commands.filter((args) => args.includes("+record-upsert")).map((args) =>
    JSON.parse(args[args.indexOf("--json") + 1])), [{ "状态": "成功", "错误信息": "" }]);
});

test("原记录不存在附件时返回null，允许调用方生成尚未生成的失败项", async () => {
  const { store, request, commands } = fixture({ mutate(fields) { fields["结果图"] = []; } });
  assert.equal(await store.recoverRun(request), null);
  assert.equal(commands.length, 1);
});

test("已有附件的冻结配置/费用/字节/尺寸/SHA差异及恢复后漂移均阻断，不退回生图", async () => {
  const variants = [
    { mutate(fields) { fields["配置快照"] = "{}"; } },
    { mutate(fields) { fields["费用（USD）"] = 0.020486; } },
    { download: Buffer.concat([bytes, Buffer.from([1])]) },
    { mutate(fields) { const p = JSON.parse(fields["生成参数"]); p.workflow.outputSha256 = "0".repeat(64); fields["生成参数"] = JSON.stringify(p); } },
    { mutate(fields) { fields["尺寸"] = "16x8"; } },
    { mutate(fields) { fields["结果图"].push({ ...fields["结果图"][0] }); } },
    { driftAfterWrite: true },
  ];
  for (const variant of variants) {
    const { store, request } = fixture(variant);
    await assert.rejects(store.recoverRun(request), (error) => error.statusCode === 409 && error.retryable === false);
  }
});

test("归档同步重试保留原冻结合同并复用已上传附件，不重复上传", async () => {
  const written = {};
  let uploads = 0, corruptRead = true;
  const store = createBetaBaseStore({ async run(_config, args) {
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(written, Object.fromEntries(body.fields.map((field, index) => [field, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-existing"] } };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
      return { ok: true, data: {} };
    }
    if (args.includes("+record-upload-attachment")) {
      assert.equal(args[args.indexOf("--field-id") + 1], BETA_BASE_CONFIG.resultFieldId);
      uploads += 1;
      written["结果图"] = [{ file_token: "file-result", name: "result.png", size: bytes.length }];
      return { ok: true, data: {} };
    }
    if (args.includes("+record-get")) return envelope({ ...written,
      ...(corruptRead && args.includes("状态") ? { "状态": ["失败"] } : {}) });
    throw new Error(`未知测试命令：${args[1]}`);
  } });
  const archived = await store.beginRun({ batchId: "BETA-archiveidempotent", featureMode: "free", testTime: "2026-10-19 15:51:58",
    item: { caseId: "CASE-1", runId: "RUN-archive-idempotent", input: { modelKey: "seedream5", prompt: "原冻结输入" } } });
  const result = { durationMs: 10, images: [{ url: image }], request: { outputFormat: "png" } };
  await assert.rejects(store.completeRun(archived.recordId, result), /状态/);
  await store.failRun(archived.recordId, new Error("状态回读失败"), { retainArchive: true });
  corruptRead = false;
  written["输入文本"] = "外部篡改";
  await assert.rejects(store.completeRun(archived.recordId, result), /输入文本/);
  assert.equal(uploads, 1);
  written["输入文本"] = "原冻结输入";
  assert.equal((await store.completeRun(archived.recordId, result)).recordId, archived.recordId);
  assert.equal(uploads, 1);
});

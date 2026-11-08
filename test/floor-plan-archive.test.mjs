/**
 * [INPUT]: 依赖平面出图归档及内存飞书 CLI 替身
 * [OUTPUT]: 验证归档查重、附件上传响应丢失后的续传及实际下载 SHA
 * [POS]: test 的平面出图归档合同，无真实飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

import { FLOOR_PLAN_ARCHIVE_ID_FIELD, FLOOR_PLAN_ARCHIVE_LABELS, syncFloorPlanToLark } from "../src/floor-plan-archive.mjs";
import { LARK_SYNC_CONFIG } from "../src/lark-sync.mjs";

const config = { ...LARK_SYNC_CONFIG, baseToken: "base-test", tableId: "tblTest", baseUrl: "https://example.test/base/base-test" };
const featureMode = "floorPlanCamera";
const fieldTypes = { [FLOOR_PLAN_ARCHIVE_ID_FIELD]: "text", "标题": "text", "功能": "select", "生图模型": "select", "Prompt融合": "select",
  "Agent 编码": "text", "Agent 版本": "number", "原始 Prompt": "text", "最终 Prompt": "text", "生成参数": "text",
  "尺寸": "text", "耗时（秒）": "number", "状态": "select", "错误信息": "text", "参考图": "attachment", "结果图": "attachment" };
const options = { "功能": Object.values(FLOOR_PLAN_ARCHIVE_LABELS), "生图模型": ["Banana 2.1"],
  "Prompt融合": ["Gemini 3.1 Pro"], "状态": ["成功", "同步失败"] };
const fields = Object.entries(fieldTypes).map(([name, type], index) => ({ name, type,
  id: { "参考图": config.referenceFieldId, "结果图": config.resultFieldId }[name] || `fldTest${index}`,
  ...(options[name] ? { options: options[name].map((option) => ({ name: option })) } : {}),
}));

async function image(width, height, color, fileName) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  const url = `data:image/png;base64,${bytes.toString("base64")}`;
  return { url, imageUrl: url, fileName, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function inputFixture() {
  return { archiveId: "camera-test-batch1-model1-01", featureMode, title: "机位渲染 · 沙发",
    durationMs: 1230, sourcePrompt: "保留机位", finalPrompt: "The exact submitted prompt.", modelLabel: "Banana 2.1",
    preview: { outputFormat: "png", ratio: "16:9", resolution: "2K", referenceImageCount: 1 },
    workflow: { agentModelLabel: "Gemini 3.1 Pro", agentCode: "camera-agent", agentVersion: 7 },
    referenceImages: [await image(8, 7, "#932323", "原图.png"), await image(8, 7, "#232393", "机位标注.png")],
    resultImage: await image(16, 9, "#323232", "结果.png"),
  };
}

function fakeLark({ failPartialUpload = false, corruptDownload = false, missingSchema = false } = {}) {
  const records = new Map(), attachments = new Map(), commands = [];
  let failed = false;
  async function run(_config, args, context) {
    const command = args[1];
    const value = (key) => args[args.indexOf(key) + 1];
    const id = value("--record-id");
    const record = records.get(id);
    commands.push(command);
    if (command === "+field-list") return { ok: true, data: { fields: missingSchema ? fields.slice(1) : fields } };
    if (command === "+record-list") {
      const archiveId = JSON.parse(value("--filter-json")).conditions[0][2];
      const matching = [...records].filter(([, row]) => row[FLOOR_PLAN_ARCHIVE_ID_FIELD] === archiveId);
      return { ok: true, data: { record_id_list: matching.map(([recordId]) => recordId), data: matching.map(() => [archiveId]) } };
    }
    if (command === "+record-batch-create") {
      const { fields: names, rows } = JSON.parse(value("--json"));
      const recordId = `recTest${records.size + 1}`;
      records.set(recordId, Object.fromEntries(names.map((name, index) => [name, rows[0][index]])));
      return { ok: true, data: { record_id_list: [recordId] } };
    }
    assert.ok(record);
    if (command === "+record-get") return { ok: true, data: { record: { record_id: id, fields: structuredClone(record) } } };
    if (command === "+record-upsert") {
      Object.assign(record, JSON.parse(value("--json")));
      return { ok: true };
    }
    if (command === "+record-upload-attachment") {
      const name = fields.find((field) => field.id === value("--field-id")).name;
      record[name] ||= [];
      for (const [index, arg] of args.entries()) if (arg === "--file") {
        const bytes = await readFile(join(context.cwd, args[index + 1]));
        const token = `token${attachments.size + 1}`;
        attachments.set(token, bytes);
        record[name].push({ file_token: token, size: bytes.length });
        if (failPartialUpload && name === "参考图" && !failed) {
          failed = true;
          throw new Error("上传响应丢失");
        }
      }
      return { ok: true };
    }
    if (command === "+record-download-attachment") {
      const bytes = Buffer.from(attachments.get(value("--file-token")));
      if (corruptDownload) bytes[bytes.length - 1] ^= 1;
      await writeFile(join(context.cwd, value("--output")), bytes);
      return { ok: true };
    }
    assert.fail(`意外的 CLI 命令 ${command}`);
  }
  return { records, attachments, commands, run };
}

test("参考图部分上传成功后续传，按任务身份复用同一记录与附件", async () => {
  const input = await inputFixture(), lark = fakeLark({ failPartialUpload: true });
  const first = await syncFloorPlanToLark(input, config, lark);
  assert.equal(first.ok, false);
  assert.equal(lark.records.get(first.recordId)["状态"], "同步失败");
  assert.equal(lark.attachments.size, 1);
  const second = await syncFloorPlanToLark(input, config, lark);
  assert.equal(second.ok, true, second.error);
  assert.equal(second.recordId, first.recordId);
  assert.equal(lark.records.size, 1);
  assert.equal(lark.attachments.size, 3);
  const record = lark.records.get(second.recordId);
  assert.equal(record["功能"], FLOOR_PLAN_ARCHIVE_LABELS[featureMode]);
  assert.equal(record["状态"], "成功");
  assert.equal(record["最终 Prompt"], input.finalPrompt);
  assert.equal(record["尺寸"], "16x9");
  assert.deepEqual(JSON.parse(record["生成参数"]).workflow.attachmentManifest["参考图"].map(({ sha256 }) => sha256),
    input.referenceImages.map(({ sha256 }) => sha256));
  const writes = lark.commands.filter((command) => /create|upsert|upload/.test(command)).length;
  assert.equal((await syncFloorPlanToLark(input, config, lark)).ok, true);
  assert.equal(lark.commands.filter((command) => /create|upsert|upload/.test(command)).length, writes);
});

test("附件回读内容错误或 Schema 缺失时均不报成功", async () => {
  const input = await inputFixture(), lark = fakeLark({ corruptDownload: true });
  const result = await syncFloorPlanToLark(input, config, lark);
  assert.equal(result.ok, false);
  assert.match(result.error, /SHA/);
  assert.equal(lark.records.get(result.recordId)["状态"], "同步失败");
  const noSchema = fakeLark({ missingSchema: true });
  assert.equal((await syncFloorPlanToLark(input, config, noSchema)).ok, false);
  assert.equal(noSchema.records.size, 0);
  assert.equal(noSchema.attachments.size, 0);
});

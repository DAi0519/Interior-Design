/**
 * [INPUT]: 依赖渲染台冻结归档、独立Schema/manifest及共享飞书记录/附件I/O、临时文件和真实附件下载
 * [OUTPUT]: 对外提供按任务ID定位记录的可续传同步、字段/附件双回读与下载字节SHA验证，失败不重跑图像模型
 * [POS]: src 的AI渲染台异步归档执行器，只写该任务记录与独立字段，不触发生成或改其他功能配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadImageBytes } from "./image-artifact.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { LARK_SYNC_CONFIG, buildRecordFields, createRecord, recordIdFrom, recordUrl, upsertRecord,
  uploadAttachments, materializeReferenceImages, readVerifiedArchiveRecord, verifyArchiveFields, verifyArchiveAttachments } from "./lark-sync.mjs";
import { AI_RENDER_STUDIO_GUIDE_FIELD, verifyAiRenderStudioSyncSchema,
  aiRenderStudioArchiveManifest, aiRenderStudioRecordFields } from "./ai-render-studio-archive.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const label = "AI渲染台";

async function findRecord(config, jobId, run) {
  const body = await run(config, ["base", "+record-list", "--as", "user", "--base-token", config.baseToken,
    "--table-id", config.tableId, "--field-id", "AI渲染台任务ID", "--filter-json",
    JSON.stringify({ logic: "and", conditions: [["AI渲染台任务ID", "==", jobId]] }), "--limit", "2", "--format", "json"]);
  if (body?.ok !== true || !Array.isArray(body.data?.record_id_list) || !Array.isArray(body.data?.data)) throw new Error("AI渲染台任务归档查重返回格式不正确");
  if (body.data.has_more || body.data.record_id_list.length > 1) throw new Error("AI渲染台同一任务存在重复记录，已停止自动同步");
  return body.data.record_id_list[0] || null;
}

async function verifyDownloadedFiles(config, recordId, fields, manifest, run, directory) {
  const identities = verifyArchiveAttachments(fields, manifest, null, label);
  let fileIndex = 0;
  for (const [name, expected] of Object.entries(manifest)) {
    for (const [index, file] of expected.entries()) {
      const remote = fields[name][index], output = `verify-${fileIndex++}.bin`;
      await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
        "--table-id", config.tableId, "--record-id", recordId, "--file-token", remote.file_token,
        "--output", output, "--overwrite", "--format", "json"], { cwd: directory });
      const path = join(directory, output);
      if ((await stat(path)).size !== file.size || digest(await readFile(path)) !== file.sha256) {
        throw new Error(`AI渲染台“${name}”附件下载字节或SHA与实际生成不一致`);
      }
    }
  }
  return identities;
}

export async function syncAiRenderStudioToLark(archive, config = LARK_SYNC_CONFIG, { run = runLarkCli } = {}) {
  let recordId = null;
  let recordVerified = false;
  let directory = null;
  try {
    const schema = await verifyAiRenderStudioSyncSchema(config, { run,
      lightingPresetNames: archive.workflow?.lightingPreset ? [archive.workflow.lightingPreset.name] : [] });
    const resultBytes = await loadImageBytes(archive.resultImage.url);
    const manifest = aiRenderStudioArchiveManifest(archive, resultBytes);
    const fields = { ...buildRecordFields({ ...archive,
      actualSize: `${archive.workflow.outputWidth}x${archive.workflow.outputHeight}` }), ...aiRenderStudioRecordFields(archive) };
    directory = await mkdtemp(join(tmpdir(), "canvas-ai-render-sync-"));
    recordId = await findRecord(config, archive.workflow.jobId, run);
    if (!recordId) {
      recordId = recordIdFrom(await createRecord(config, fields, run));
      if (!recordId) throw new Error("AI渲染台归档创建未返回记录ID，请重试同步以按任务ID查重恢复");
    }
    const before = await readVerifiedArchiveRecord(config, recordId, run, label);
    verifyArchiveFields(before, fields, label);
    recordVerified = true;
    const attachments = { "参考图": archive.referenceImages,
      "结果图": [{ imageUrl: archive.resultImage.url, mimeType: "image/png", fileName: "ai-render-studio-result.png" }],
      [AI_RENDER_STUDIO_GUIDE_FIELD]: archive.guideImage ? [archive.guideImage] : [] };
    for (const [name, images] of Object.entries(attachments)) {
      const existing = before[name] || [];
      if (existing.length) {
        // --- 已上传附件先校验再复用；网络未知导致的重复点击不追加第二份 ---
        await verifyDownloadedFiles(config, recordId, { [name]: existing }, { [name]: manifest[name] }, run, directory);
        continue;
      }
      const files = await materializeReferenceImages(images, directory, { prefix: `studio-${Object.keys(attachments).indexOf(name)}` });
      await uploadAttachments(config, recordId, schema.attachmentFieldIds[name], files, directory, run);
    }
    const initial = await readVerifiedArchiveRecord(config, recordId, run, label);
    verifyArchiveFields(initial, fields, label);
    const identities = await verifyDownloadedFiles(config, recordId, initial, manifest, run, directory);
    await upsertRecord(config, { "状态": "成功", "错误信息": null }, recordId, run);
    const final = await readVerifiedArchiveRecord(config, recordId, run, label);
    verifyArchiveFields(final, { ...fields, "状态": "成功", "错误信息": null }, label);
    verifyArchiveAttachments(final, manifest, identities, label);
    // --- 成功状态后的字段与token仍需复核，附件实际字节在前一阶段已逐一下载验证 ---
    return { ok: true, recordId, recordUrl: recordUrl(config, recordId) };
  } catch (error) {
    const message = String(error?.message || "AI渲染台同步未完成").slice(0, 700);
    if (recordId && recordVerified) {
      try { await upsertRecord(config, { "状态": "同步失败", "错误信息": message }, recordId, run); }
      catch { /* 保留首次同步错误；下次按同任务ID继续，不重新生成图片。 */ }
    }
    return { ok: false, error: message, recordId, recordUrl: recordId ? recordUrl(config, recordId) : null };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

/**
 * [INPUT]: 依赖飞书记录/附件及 {id} 对象关联 CellValue、参考图真实单图/全景2:1校验与轻量预览，接收样本集 ID 和逐张样本上传
 * [OUTPUT]: 对外提供草稿样本集、单样本幂等保存、完成回读、无原图的元数据与按需单图读取，上传与原图读取均核验全景实际2:1
 * [POS]: src 的 Beta 样本资产边界，被 beta-base.mjs 组合；可用状态只在全部选定样本确认后写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createImagePreviewDataUrl, decodeImageDataUrl } from "./image-artifact.mjs";
import { normalizeReferenceImage, REFERENCE_IMAGE_POLICY } from "./reference-image.mjs";
import { betaBaseContractError } from "./beta-base-schema.mjs";

const SET_FIELDS = ["样本集 ID", "名称", "功能", "状态", "样本数量", "说明"];
const SAMPLE_FIELDS = ["样本 ID", "样本集", "样本图", "提示词", "文件名", "状态", "空间类型", "其他空间类型"];
const selectValue = (value) => Array.isArray(value) ? value[0] ?? null : value ?? null;
const links = (value) => Array.isArray(value) ? value.map((entry) => typeof entry === "string"
  ? entry : entry?.record_id || entry?.recordId || entry?.id).filter(Boolean) : [];
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function inputError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode, retryable: false });
}

export function normalizeBetaSampleImage(image, featureMode) {
  const normalized = normalizeReferenceImage(image);
  if (!normalized?.width || !normalized?.height) throw inputError("样本图内容或 MIME 类型无效");
  if (featureMode === "panoramaEnhancement" && normalized.width !== normalized.height * 2) {
    throw inputError(`全景图样本必须为 2:1 等距柱状投影图片（当前 ${normalized.width}x${normalized.height}）`);
  }
  return { dataUrl: normalized.imageUrl, name: normalized.fileName, size: normalized.size,
    type: normalized.mimeType, width: normalized.width, height: normalized.height };
}

export function createBetaSampleStore({ config, run, featureLabels, createRecord, updateRecord,
  listRecords, getRecord, uploadAttachments }) {
  const locks = new Map();
  async function exclusive(setId, operation) {
    const previous = locks.get(setId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    locks.set(setId, pending);
    try { return await pending; }
    finally { if (locks.get(setId) === pending) locks.delete(setId); }
  }
  function setMetadata({ fields, recordId }) {
    return {
      featureMode: Object.entries(featureLabels).find(([, label]) => label === selectValue(fields["功能"]))?.[0] || null,
      name: String(fields["名称"] || "").trim(), recordId,
      sampleCount: Number(fields["样本数量"]) || 0,
      sampleSetId: String(fields["样本集 ID"] || "").trim(), status: selectValue(fields["状态"]),
    };
  }
  async function sets() {
    const rows = await listRecords(run, config, config.sampleSetTableId, SET_FIELDS);
    return rows.map(setMetadata).filter((entry) => entry.sampleSetId);
  }
  async function findSet(setId, includeDraft = false) {
    return (await sets()).find((entry) => entry.sampleSetId === setId
      && (entry.status === "可用" || (includeDraft && !entry.status))) || null;
  }
  async function sampleRows(set) {
    return (await listRecords(run, config, config.sampleTableId, SAMPLE_FIELDS))
      .filter(({ fields }) => links(fields["样本集"]).includes(set.recordId));
  }
  function metadata(set, { fields, recordId }) {
    const attachment = Array.isArray(fields["样本图"]) ? fields["样本图"][0] : null;
    const sampleId = String(fields["样本 ID"] || "").trim();
    return {
      sampleId, recordId, status: selectValue(fields["状态"]),
      prompt: String(fields["提示词"] || "").trim(),
      roomType: selectValue(fields["空间类型"]) || "",
      roomTypeDetail: String(fields["其他空间类型"] || "").trim(),
      image: attachment?.file_token ? {
        name: String(fields["文件名"] || attachment.name || ""), size: Number(attachment.size) || 0,
        type: types[extname(attachment.name || fields["文件名"] || "").toLowerCase()] || "",
        previewUrl: `/api/beta/sample-sets/${encodeURIComponent(set.sampleSetId)}/samples/${encodeURIComponent(sampleId)}/image`,
      } : null,
    };
  }
  async function download(row, featureMode) {
    const attachment = row.fields["样本图"]?.[0];
    if (!attachment?.file_token) throw inputError("飞书样本缺少原图", 409);
    if (Number(attachment.size) > REFERENCE_IMAGE_POLICY.maxBytesPerImage) throw inputError("样本图不能超过 8MB", 409);
    const type = types[extname(attachment.name || "").toLowerCase()];
    if (!type) throw inputError("样本图仅支持 PNG、JPEG、WebP", 409);
    const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-sample-"));
    const file = `sample${extname(attachment.name).toLowerCase()}`;
    try {
      await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
        "--table-id", config.sampleTableId, "--record-id", row.recordId, "--file-token", attachment.file_token,
        "--output", file, "--overwrite", "--format", "json"], { cwd: directory });
      if ((await stat(join(directory, file))).size > REFERENCE_IMAGE_POLICY.maxBytesPerImage) {
        throw inputError("样本图不能超过 8MB", 409);
      }
      const bytes = await readFile(join(directory, file));
      return normalizeBetaSampleImage({ dataUrl: `data:${type};base64,${bytes.toString("base64")}`,
        type, size: Number(attachment.size), name: row.fields["文件名"] || attachment.name }, featureMode);
    } finally { await rm(directory, { force: true, recursive: true }); }
  }
  const store = {
    async listSampleSets() { return (await sets()).filter((entry) => entry.status === "可用"); },
    async getSampleSet(setId, { includeDraft = false } = {}) {
      const set = await findSet(setId, includeDraft);
      if (!set) return null;
      const rows = await sampleRows(set);
      return { ...set, samples: rows.filter(({ fields }) => selectValue(fields["状态"]) === "可用")
        .map((row) => metadata(set, row)) };
    },
    async createSampleSet({ featureMode, name, samples = [] }) {
      const sampleSetId = `SET-${randomUUID().slice(0, 12).toUpperCase()}`;
      const recordId = await createRecord(run, config, {
        "样本集 ID": sampleSetId, "名称": name, "功能": featureLabels[featureMode], "状态": null, "样本数量": 0,
      }, config.sampleSetTableId);
      // 飞书创建记录会把显式 null 填成字段默认值，创建后用更新清空并真实回读。
      await updateRecord(run, config, recordId, { "状态": null }, config.sampleSetTableId);
      const draft = await getRecord(run, config, config.sampleSetTableId, recordId, SET_FIELDS);
      if (selectValue(draft?.fields["状态"]) || draft?.fields["样本集 ID"] !== sampleSetId
        || draft?.fields["名称"] !== name || selectValue(draft?.fields["功能"]) !== featureLabels[featureMode]
        || Number(draft?.fields["样本数量"]) !== 0) {
        throw betaBaseContractError("飞书样本集草稿信息回读不一致");
      }
      const set = { featureMode, name, sampleSetId, recordId, sampleCount: 0, status: null, samples: [] };
      // 内部历史调用仍可组合逐张保存；HTTP 入口只接收无图片的草稿创建。
      for (const [index, sample] of samples.entries()) {
        await store.addSample(sampleSetId, { ...sample, sampleId: `${sampleSetId}-${String(index + 1).padStart(3, "0")}` });
      }
      return samples.length ? store.completeSampleSet(sampleSetId,
        samples.map((_, index) => `${sampleSetId}-${String(index + 1).padStart(3, "0")}`)) : set;
    },
    async addSample(setId, sample) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(String(sample.sampleId || ""))) throw inputError("样本 ID 无效");
      return exclusive(setId, async () => {
        const set = await findSet(setId, true);
        if (!set) throw inputError("样本集不存在或已归档", 404);
        if (set.status === "可用") throw inputError("已完成的样本集不能继续上传", 409);
        const image = sample.image ? normalizeBetaSampleImage(sample.image, set.featureMode) : null;
        if (set.featureMode !== "free" && !image) throw inputError("样本缺少有效图片");
        const rows = await sampleRows(set);
        const row = rows.find(({ fields }) => fields["样本 ID"] === sample.sampleId);
        const fields = { "样本 ID": sample.sampleId, "样本集": [{ id: set.recordId }],
          "提示词": sample.prompt || "", "文件名": image?.name || "",
          ...(set.featureMode === "emptyRoom" ? { "空间类型": sample.roomType, "其他空间类型": sample.roomTypeDetail || "" } : {}) };
        const sameField = (field, value, actual) => field === "样本集"
          ? String(links(actual)) === String(links(value)) : String(actual ?? "") === String(value);
        if (selectValue(row?.fields["状态"]) === "可用" && Object.entries(fields)
          .some(([field, value]) => !sameField(field, value, row.fields[field]))) {
          throw inputError("样本 ID 已对应另一份内容，请保留原样本重试", 409);
        }
        const recordId = row?.recordId || await createRecord(run, config, { ...fields, "状态": null }, config.sampleTableId);
        if (!row) await updateRecord(run, config, recordId, { "状态": null }, config.sampleTableId);
        if (row?.fields["样本图"]?.[0]?.file_token) {
          const previous = await download(row, set.featureMode);
          if (!image || digest(decodeImageDataUrl(previous.dataUrl)) !== digest(decodeImageDataUrl(image.dataUrl))) {
            throw inputError("样本 ID 已对应另一张图片，请保留原样本重试", 409);
          }
        } else if (image) {
          const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-library-"));
          const file = `${sample.sampleId}.${image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1]}`;
          try {
            await writeFile(join(directory, file), decodeImageDataUrl(image.dataUrl));
            await uploadAttachments(run, config, recordId, config.sampleImageFieldId, [file], directory, config.sampleTableId);
          } finally { await rm(directory, { force: true, recursive: true }); }
        }
        await updateRecord(run, config, recordId, fields, config.sampleTableId);
        const saved = await getRecord(run, config, config.sampleTableId, recordId, SAMPLE_FIELDS);
        for (const [field, value] of Object.entries(fields)) {
          if (!sameField(field, value, saved?.fields[field])) throw betaBaseContractError(`飞书样本信息回读不一致：${field}`);
        }
        const attachment = saved?.fields["样本图"]?.[0];
        if (image && (!attachment?.file_token || Number(attachment.size) !== image.size)) {
          throw betaBaseContractError("飞书样本附件校验失败");
        }
        await updateRecord(run, config, recordId, { "状态": "可用" }, config.sampleTableId);
        const confirmed = await getRecord(run, config, config.sampleTableId, recordId, SAMPLE_FIELDS);
        if (selectValue(confirmed?.fields["状态"]) !== "可用") throw betaBaseContractError("飞书样本状态回读不一致");
        return metadata(set, confirmed);
      });
    },
    async completeSampleSet(setId, sampleIds) {
      return exclusive(setId, async () => {
        const set = await findSet(setId, true);
        if (!set) throw inputError("样本集不存在或已归档", 404);
        const rows = (await sampleRows(set)).filter(({ fields }) => selectValue(fields["状态"]) === "可用");
        const actualIds = rows.map(({ fields }) => String(fields["样本 ID"] || ""));
        if (!sampleIds.length || new Set(sampleIds).size !== sampleIds.length
          || actualIds.length !== sampleIds.length || sampleIds.some((id) => !actualIds.includes(id))) {
          throw inputError("样本集未全部上传确认，请重试剩余样本", 409);
        }
        if (set.featureMode !== "free" && rows.some(({ fields }) => !fields["样本图"]?.[0]?.file_token)) {
          throw inputError("样本集仍有缺少原图的样本", 409);
        }
        await updateRecord(run, config, set.recordId, { "状态": "可用", "样本数量": rows.length }, config.sampleSetTableId);
        const saved = await getRecord(run, config, config.sampleSetTableId, set.recordId, SET_FIELDS);
        if (selectValue(saved?.fields["状态"]) !== "可用" || Number(saved?.fields["样本数量"]) !== rows.length) {
          throw betaBaseContractError("飞书样本集完成信息回读不一致");
        }
        return store.getSampleSet(setId);
      });
    },
    async resolveSample(setId, sampleId, { recordId, sampleSetRecordId } = {}) {
      const setRow = sampleSetRecordId
        ? await getRecord(run, config, config.sampleSetTableId, sampleSetRecordId, SET_FIELDS) : null;
      const set = setRow ? setMetadata(setRow) : await findSet(setId);
      if (!set || set.sampleSetId !== setId || set.status !== "可用") throw inputError("样本集不存在或已归档", 404);
      const row = recordId ? await getRecord(run, config, config.sampleTableId, recordId, SAMPLE_FIELDS)
        : (await sampleRows(set)).find(({ fields }) => fields["样本 ID"] === sampleId);
      if (!row || row.fields["样本 ID"] !== sampleId || selectValue(row.fields["状态"]) !== "可用"
        || !links(row.fields["样本集"]).includes(set.recordId)) {
        throw inputError("样本不属于所选样本集或尚未上传确认", 409);
      }
      return { ...metadata(set, row), featureMode: set.featureMode,
        image: set.featureMode === "free" ? null : await download(row, set.featureMode) };
    },
    async getSampleImage(setId, sampleId) {
      const sample = await store.resolveSample(setId, sampleId);
      if (!sample.image) throw inputError("此样本没有图片", 404);
      const preview = await createImagePreviewDataUrl(decodeImageDataUrl(sample.image.dataUrl));
      return { bytes: decodeImageDataUrl(preview), contentType: "image/webp" };
    },
  };
  return store;
}

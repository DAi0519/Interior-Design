/**
 * [INPUT]: 依赖新版附件、当前工作台原生图工厂、已保存合成原图/遮罩/参考图与实机节点Schema
 * [OUTPUT]: 构建统一1024裁剪/同种子双张的原生与EditUtils编码链对照图；仅显式--execute时提交独立GPU任务并保存图片/摘要
 * [POS]: validation 的一次性检查与对照工具，不写工作台配置、原附件、飞书或MaaS生产策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createImageMaskFillWorkflow } from "../../../src/image-mask-fill-workflow.mjs";

const sourcePath = process.argv.slice(2).find(value => !value.startsWith("--"));
if (!sourcePath) throw new Error("用法：node rebuild-comparison.mjs [--execute] 新版附件.json");
const folder = new URL("./", import.meta.url);
const server = "http://maas-workflow-app-50-prodtestzwapp50.k8s-zhongwei.qunhequnhe.com";
const sourceBytes = await readFile(sourcePath), source = JSON.parse(sourceBytes);
const schema = JSON.parse(await readFile("/tmp/flux2-rebuild-object-info-zw.json", "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fixtures = Object.fromEntries(await Promise.all(["source.png", "mask-rgb.png", "reference.png"].map(async name => [name, await readFile(new URL(name, folder))])));
const seed = source.nodes.find(node => node.type === "RandomNoise").widgets_values[0];
const prompt = source.nodes.find(node => node.id === 619).widgets_values[0];
const native = createImageMaskFillWorkflow({ artifactKey: `audit-${randomUUID()}`, imageBase64: fixtures["source.png"].toString("base64"), seed,
  generationRequest: { maskFillMode: "reference", inferenceTier: "original", sourceWidth: 512, sourceHeight: 512,
    maskBase64: fixtures["mask-rgb.png"].toString("base64"), fillReferenceBase64: fixtures["reference.png"].toString("base64"), prompt, maskExpand: 80 } });
// -------- 两图共用输入/遮罩/裁剪/分割/采样/回贴，仅切换编辑条件链 --------
Object.assign(native.crop.inputs, { preresize: false, output_resize_to_target_size: true, output_target_width: 1024, output_target_height: 1024 });
native.referenceScale.inputs.scale_to_length = 1024;
native.repeat.inputs.amount = 2;
const editutils = structuredClone(native);
for (const id of ["positive", "negative", "encode", "positiveMain", "negativeMain", "referenceCanvas", "referenceEncode", "positiveReference", "negativeReference", "noiseMask"]) delete editutils[id];
editutils.edit = { class_type: "Flux2KleinEditTextEncode_EditUtils", inputs: {
  clip: ["clip", 0], vae: ["vae", 0], prompt, image1: ["crop", 1], image2: ["referenceCrop", 0], ref_longest_edge: 1024, mask: ["crop", 2] } };
editutils.zero = { class_type: "ConditioningZeroOut", inputs: { conditioning: ["edit", 0] } };
editutils.repeat.inputs.samples = ["edit", 1];
editutils.guider.inputs.positive = ["edit", 0];
editutils.guider.inputs.negative = ["zero", 0];
editutils.editSize = { class_type: "GetImageSize", inputs: { image: ["edit", 3] } };
editutils.editWidth = { class_type: "PreviewAny", inputs: { source: ["editSize", 0] } };
editutils.editHeight = { class_type: "PreviewAny", inputs: { source: ["editSize", 1] } };

function validate(graph) {
  for (const [id, node] of Object.entries(graph)) {
    const info = schema[node.class_type];
    if (!info) throw new Error(`缺节点 ${id}/${node.class_type}`);
    const fields = { ...info.input.required, ...info.input.optional };
    for (const name of Object.keys(info.input.required || {})) if (!(name in node.inputs)) throw new Error(`缺输入 ${id}.${name}`);
    for (const [name, value] of Object.entries(node.inputs)) {
      const spec = fields[name];
      if (!spec) throw new Error(`未知输入 ${id}.${name}`);
      if (Array.isArray(value)) {
        const type = schema[graph[value[0]]?.class_type]?.output?.[value[1]];
        if (!type || (spec[0] !== "*" && spec[0] !== type)) throw new Error(`连线类型错误 ${id}.${name}`);
      } else if (Array.isArray(spec[0]) && !spec[0].includes(value)) throw new Error(`选项错误 ${id}.${name}`);
    }
  }
}
const graphs = { native, editutils };
const report = { at: new Date().toISOString(), server, sourcePath, sourceSha256: sha(sourceBytes),
  scope: "isolated coding-chain smoke comparison; not original default-1536 workflow execution or production quality evaluation",
  controls: { seed, batchSize: 2, steps: 4, cfg: 1, sampler: "euler_ancestral", inference: 1024, maskExpand: 80,
    model: "flux-2-klein-9b.safetensors", biRefModel: "General.safetensors", output: "512x512", prompt,
    fixtureSha256: Object.fromEntries(Object.entries(fixtures).map(([name, bytes]) => [name, sha(bytes)])) },
  deviationsFromAttachment: ["仅测试编码链；两边统一关闭整图预放大、1024裁剪与调度", "两边统一General.safetensors，不评估附件的另一BiRefNet权重", "共用当前工作台的先填孔再扩张与参考预处理", "共用原比例输出512x512，附件原默认1536回贴未在本次执行"], runs: [] };
for (const [name, graph] of Object.entries(graphs)) {
  graph.output.inputs.filename_prefix = `CanvasLab_MaskAudit_${name}_${randomUUID()}`;
  validate(graph);
  const bytes = Buffer.from(JSON.stringify(graph, null, 2) + "\n");
  await writeFile(new URL(`rebuild-${name}.api.json`, folder), bytes);
  report.runs.push({ name, graphSha256: sha(bytes), nodeCount: Object.keys(graph).length, filenamePrefix: graph.output.inputs.filename_prefix, status: "validated", outputs: [] });
}
const reportUrl = new URL("rebuild-comparison-runs.json", folder);
await writeFile(reportUrl, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ schemaValidated: true, controls: report.controls, execute: process.argv.includes("--execute") }));
if (process.argv.includes("--execute")) {
  const request = async (path, options = {}) => {
    const result = await fetch(server + path, { ...options, signal: AbortSignal.timeout(30000) });
    const body = await result.json();
    if (!result.ok) throw new Error(JSON.stringify({ status: result.status, body }));
    return body;
  };
  for (const run of report.runs) {
    const startedAt = Date.now();
    const admission = await request("/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: randomUUID(), prompt: graphs[run.name] }) });
    run.admission = admission; run.status = "running";
    console.log(JSON.stringify({ name: run.name, promptId: admission.prompt_id, status: run.status }));
    await writeFile(reportUrl, JSON.stringify(report, null, 2) + "\n");
    let history;
    while (Date.now() - startedAt < 15 * 60 * 1000) {
      history = (await request(`/history/${admission.prompt_id}`))[admission.prompt_id];
      if (history?.status?.status_str === "error") throw new Error(JSON.stringify(history.status));
      if (history?.status?.completed) break;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    if (!history?.status?.completed) throw new Error("对照任务超时，禁止自动重提");
    const outputs = history.outputs?.output?.images || [];
    if (outputs.length !== 2) throw new Error(`输出张数不符：${outputs.length}`);
    for (const [index, file] of outputs.entries()) {
      if (!file.filename.startsWith(run.filenamePrefix + "_")) throw new Error("产物前缀不符");
      const response = await fetch(server + "/view?" + new URLSearchParams(file), { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`产物读取失败 ${response.status}；禁止重跑GPU`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const local = `rebuild-${run.name}-${index + 1}.png`;
      await writeFile(new URL(local, folder), bytes);
      run.outputs.push({ local, filename: file.filename, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: sha(bytes) });
    }
    run.status = history.status.status_str; run.elapsedMs = Date.now() - startedAt;
    run.actualCrop = { width: history.outputs.inferenceWidth?.text, height: history.outputs.inferenceHeight?.text };
    run.actualEditMain = { width: history.outputs.editWidth?.text ?? null, height: history.outputs.editHeight?.text ?? null };
    run.messages = history.status.messages;
    await writeFile(reportUrl, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ name: run.name, status: run.status, elapsedMs: run.elapsedMs, actualCrop: run.actualCrop, actualEditMain: run.actualEditMain, outputs: run.outputs }));
  }
}

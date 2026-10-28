/**
 * [INPUT]: 依赖正式KS直入27.1工厂、固定长边表达式、4K/6K策略、当前ComfyUI只读schema与Node标准库
 * [OUTPUT]: 独立4K原尺寸推理交付与5K推理6K交付两份MaaS画布/API，核对schema/端口控件/回投与工厂一致
 * [POS]: scripts 的KS双档固定值交接导出器；4K补流内尺寸连接，6K仅换URL/PNG外壳，不提交GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createImageUpscaleWorkflow, imageUpscaleTargetDimensions, imageUpscaleExecutionPlan,
  IMAGE_UPSCALE_WORKFLOWS, KS_FIXED_6K_POLICY, KS_UPSCALE_AREA_POLICY,
  fixedUpscaleLongEdgeExpression } from '../src/image-upscale-workflow.mjs';
import { createComfyUiClient } from '../src/comfyui-client.mjs';

const NAMES = Object.freeze({ '4K': 'KS-固定4K推理-4K交付.MaaS', '6K': 'KS-固定5K推理-6K交付.MaaS' });
const OUTPUT = new URL('../workflows/', import.meta.url);
const WORKFLOW_KEY = 'ks_seedvr2_2x_direct';
const SEED = 1758808765;
const ARTIFACT_KEY = 'ks-fixed5k-handoff';
const SOURCE = Object.freeze({ width: 960, height: 1200 });
const LAYOUT = {
  70: { pos: [-350, 0], size: [290, 210], title: '唯一后端参数 input_img / 原图URL' },
  71: { pos: [0, 0], size: [285, 200], title: '1. 下载原图 / MaaSUrlLoader' },
  80: { pos: [340, -140], size: [230, 130], title: '2. 读取真实宽高 / GetImageSize' },
  81: { pos: [630, -150], size: [300, 210], title: '3. 固定5120推理长边 / 比例最近偶数' },
  82: { pos: [970, -150], size: [235, 145], title: 'Seed短边 = min(推理宽,高)' },
  83: { pos: [630, 230], size: [300, 210], title: '固定6144成品长边 / 比例最近偶数' },
  77: { pos: [1270, 0], size: [300, 215], title: '4. 前置Lanczos / 固定5K推理画布' },
  75: { pos: [1650, 0], size: [355, 450], title: '5. SeedVR2整图增强 / 固定5K' },
  78: { pos: [2080, 0], size: [300, 215], title: '6. 后置Lanczos / 固定6K像素尺寸' },
  76: { pos: [2470, 0], size: [320, 255], title: '7. result_img / PNG交付' },
  73: { pos: [1250, 600], size: [350, 260], title: '7B mixed / 36层与I/O卸载 / CPU' },
  74: { pos: [1650, 600], size: [365, 380], title: 'FP16 VAE / 内部1024块+128重叠' },
};

// -------- 从正式运行真源取图；仅输入改URL、输出改MaaS报告 --------
export function createRuntimeGraph(resolution = '6K', source = SOURCE) {
  assert.ok(Object.hasOwn(NAMES, resolution), '仅导出4K或6K');
  const workflow = IMAGE_UPSCALE_WORKFLOWS[WORKFLOW_KEY];
  assert.equal(workflow.version, '2026-10-27.1', '请先更新KS直入正式工厂');
  const target = imageUpscaleTargetDimensions(source, resolution, WORKFLOW_KEY);
  const generationRequest = { upscaleWorkflowKey: WORKFLOW_KEY, upscaleWorkflowVersion: workflow.version,
    resolution, sourceWidth: source.width, sourceHeight: source.height };
  const plan = imageUpscaleExecutionPlan({ ...target, ...generationRequest, workflowKey: WORKFLOW_KEY });
  assert.equal(plan.policyVersion, resolution === '6K' ? KS_FIXED_6K_POLICY.version : KS_UPSCALE_AREA_POLICY.version);
  assert.equal(plan.seedVrMaxResolution, resolution === '6K' ? 5120 : 4096);
  if (resolution === '4K') assert.equal(plan.deliveryPostResize, false);
  return createImageUpscaleWorkflow({ artifactKey: ARTIFACT_KEY, imageBase64: '', seed: SEED,
    width: target.width, height: target.height, generationRequest });
}
export function createHandoffGraph(resolution = '6K') {
  const graph = createRuntimeGraph(resolution), is4k = resolution === '4K';
  if (is4k) {
    graph['80'] = { class_type: 'GetImageSize', inputs: { image: ['71', 0] } };
    graph['81'] = { class_type: 'SimpleMathDual+', inputs: { a: ['80', 0], b: ['80', 1],
      value_1: fixedUpscaleLongEdgeExpression('a', 4096), value_2: fixedUpscaleLongEdgeExpression('b', 4096) } };
    graph['82'] = { class_type: 'SimpleMath+', inputs: { a: ['81', 0], b: ['81', 2], value: 'min(a,b)' } };
    graph['77'].inputs.width = ['81', 0]; graph['77'].inputs.height = ['81', 2];
    graph['75'].inputs.resolution = ['82', 0];
  }
  delete graph['79'];
  graph['70'] = { class_type: 'MaaSInputString', inputs: { key: 'input_img', value: '', required: true,
    display_name: '原图URL', info: is4k ? '仅此业务输入；固定4096推理与成品，等比最近偶数'
      : '仅此业务输入；固定5120推理、6144成品，等比最近偶数' } };
  graph['71'] = { class_type: 'MaaSUrlLoader', inputs: { url: ['70', 0] } };
  graph['76'] = { class_type: 'MaaSReportImage', inputs: { image: [is4k ? '75' : '78', 0], key: 'result_img',
    bucket_key: '', batch_size: 1, format: '.png', quality: 100 } };
  return graph;
}

const choices = declaration => Array.isArray(declaration[0]) ? declaration[0]
  : declaration[0] === 'COMBO' ? declaration[1]?.options : null;
const widgetType = declaration => Boolean(choices(declaration))
  || ['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO'].includes(declaration[0]);
const fieldType = declaration => choices(declaration) ? 'COMBO' : declaration[0];
const compatible = (left, right) => left === right || left === '*' || right === '*';
function defaultValue(declaration) {
  return declaration[1]?.default ?? choices(declaration)?.[0]
    ?? (declaration[0] === 'STRING' ? '' : declaration[0] === 'BOOLEAN' ? false : 0);
}
function validateSchema(graph, info) {
  for (const [id, node] of Object.entries(graph)) {
    const schema = info[node.class_type]; assert.ok(schema, `缺少节点${node.class_type}`);
    const declarations = { ...schema.input.required, ...schema.input.optional };
    for (const name of Object.keys(schema.input.required || {})) assert.ok(Object.hasOwn(node.inputs, name), `${id}缺少${name}`);
    for (const [name, value] of Object.entries(node.inputs)) {
      const declaration = declarations[name]; assert.ok(declaration, `${id}非法参数${name}`);
      if (Array.isArray(value)) {
        const source = graph[value[0]], outputType = info[source?.class_type]?.output[value[1]];
        assert.ok(outputType && compatible(outputType, declaration[0]), `${id}.${name}端口类型不匹配`);
      } else {
        const enumeration = choices(declaration);
        if (enumeration) assert.ok(enumeration.includes(value), `${id}.${name}枚举不可用`);
        if (['INT', 'FLOAT'].includes(declaration[0])) {
          assert.ok(Number.isFinite(value));
          if (declaration[0] === 'INT') assert.ok(Number.isInteger(value));
          if (declaration[1]?.min != null) assert.ok(value >= declaration[1].min);
          if (declaration[1]?.max != null) assert.ok(value <= declaration[1].max);
        }
      }
    }
  }
}

function topologicalOrder(graph) {
  const ordered = [], remaining = new Set(Object.keys(graph));
  while (remaining.size) {
    const ready = [...remaining].filter(id => Object.values(graph[id].inputs)
      .filter(Array.isArray).every(([source]) => ordered.includes(source)));
    assert.ok(ready.length, '图中存在循环依赖');
    for (const id of ready) { ordered.push(id); remaining.delete(id); }
  }
  return ordered;
}

export function createHandoffCanvas(graph, info, resolution = '6K') {
  const is4k = resolution === '4K';
  const layout = is4k ? { ...LAYOUT,
    81: { ...LAYOUT[81], title: '3. 固定4096推理与成品长边 / 比例最近偶数' },
    77: { ...LAYOUT[77], title: '4. 前置Lanczos / 固定4K推理画布' },
    75: { ...LAYOUT[75], title: '5. SeedVR2整图增强 / 固定4K' },
    76: { ...LAYOUT[76], pos: [2080, 0], title: '6. result_img / 4K PNG交付' },
  } : LAYOUT;
  const order = topologicalOrder(graph);
  const nodes = Object.entries(graph).map(([id, node]) => {
    const schema = info[node.class_type], declarations = { ...schema.input.required, ...schema.input.optional };
    const names = [...(schema.input_order?.required || Object.keys(schema.input.required || {})),
      ...(schema.input_order?.optional || Object.keys(schema.input.optional || {}))];
    const widgetNames = names.filter(name => widgetType(declarations[name]));
    const entries = widgetNames.flatMap(name => {
      const value = Array.isArray(node.inputs[name]) || !Object.hasOwn(node.inputs, name)
        ? defaultValue(declarations[name]) : node.inputs[name];
      return [[name, value], ...(name === 'seed' ? [['control_after_generate', 'fixed']] : [])];
    });
    return { id: Number(id), type: node.class_type, ...layout[id], flags: {}, order: order.indexOf(id), mode: 0,
      inputs: names.filter(name => !widgetType(declarations[name]) || Array.isArray(node.inputs[name]))
        .map(name => ({ name, type: fieldType(declarations[name]), link: null,
          ...(schema.input.optional?.[name] ? { shape: 7 } : {}),
          ...(widgetNames.includes(name) ? { widget: { name } } : {}) })),
      outputs: schema.output.map((type, slot_index) => ({ name: schema.output_name?.[slot_index] || type,
        type, links: [], slot_index })),
      properties: { 'Node name for S&R': node.class_type,
        canvasLabLiteralInputNames: Object.keys(node.inputs).filter(name => !Array.isArray(node.inputs[name])) },
      widgets_values: entries.map(([, value]) => value), widgets_values_named: Object.fromEntries(entries) };
  });
  const byId = new Map(nodes.map(n => [String(n.id), n])), links = [];
  for (const [id, node] of Object.entries(graph)) for (const [name, value] of Object.entries(node.inputs)) {
    if (!Array.isArray(value)) continue;
    const target = byId.get(id), source = byId.get(value[0]), inputIndex = target.inputs.findIndex(i => i.name === name);
    const input = target.inputs[inputIndex], output = source.outputs[value[1]];
    assert.ok(compatible(output.type, input.type));
    const number = links.length + 1; links.push([number, source.id, value[1], target.id, inputIndex, output.type]);
    input.link = number; output.links.push(number);
  }
  return { last_node_id: is4k ? 82 : 83, last_link_id: links.length, nodes, links, version: 0.4, config: {},
    groups: [
      { title: '唯一业务输入 + 流内固定值计算 / 不传分辨率', bounding: [-380, -240, 1615, 750], color: '#3f789e', flags: {} },
      { title: is4k ? '固定4096推理 → 固定4096成品 / 现有节点' : '固定5120推理 → 固定6144成品 / 现有节点',
        bounding: [1240, -100, is4k ? 1200 : 1580, 610], color: '#477652', flags: {} },
      { title: '保持实测模型与卸载 / 无外部切图拼接', bounding: [1210, 540, 850, 490], color: '#606878', flags: {} },
    ], extra: { ds: { scale: 0.43, offset: [450, 260] }, workflowRendererVersion: 'LG', canvasLab: {
      runtimeWorkflowKey: WORKFLOW_KEY, runtimeWorkflowVersion: IMAGE_UPSCALE_WORKFLOWS[WORKFLOW_KEY].version,
      executionPolicyVersion: is4k ? KS_UPSCALE_AREA_POLICY.version : KS_FIXED_6K_POLICY.version,
      inferenceLongEdge: is4k ? 4096 : 5120, deliveryLongEdge: is4k ? 4096 : 6144,
      backendFields: ['input_img'], resultKey: 'result_img', outputFormat: '.png', requiredNewPlugins: [],
      maasEnvelopeGpuTested: false, maasEndpointPublished: false, dynamic20MPPolicyApplied: false,
      note: is4k ? '4K模型核心复用正式KS直入工厂，仅将已有固定4096等比尺寸计算移入现有数学节点；MaaS URL/Report外壳待发布联调。'
        : '核心图复用正式KS直入工厂，固定5K到6K核心已有四比例单次实测；MaaS URL/Report外壳待平台发布及PNG回读。',
      contract: { '[INPUT]': '仅input_img原图URL，尺寸常量固定在数学与模型节点',
        '[OUTPUT]': is4k ? '原比例最近偶数，4096长边推理后直接交付4096长边PNG'
          : '原比例最近偶数，5120推理后Lanczos恢复6144长边PNG；不是原生6K推理',
        '[POS]': is4k ? 'workflows 的KS直入27.1固定4K MaaS交接图，输入输出外壳待正式平台联调'
          : 'workflows 的KS直入27.1固定5K到6K MaaS交接图，输入输出外壳待正式平台联调',
        '[PROTOCOL]': '变更时更新此头部，然后检查 CLAUDE.md' },
    } } };
}

export function validateCanvas(graph, canvas, resolution = '6K') {
  const is4k = resolution === '4K';
  const projected = {};
  for (const node of canvas.nodes) {
    const inputs = Object.fromEntries(node.properties.canvasLabLiteralInputNames
      .map(name => [name, node.widgets_values_named[name]]));
    for (const input of node.inputs) if (input.link != null) {
      const link = canvas.links.find(item => item[0] === input.link), source = canvas.nodes.find(n => n.id === link[1]);
      assert.equal(link[3], node.id); assert.equal(node.inputs[link[4]].name, input.name); assert.ok(source.order < node.order);
      inputs[input.name] = [String(link[1]), link[2]];
    }
    projected[String(node.id)] = { class_type: node.type, inputs };
  }
  assert.deepEqual(projected, graph, '画布回投与API不一致');
  const tested = createRuntimeGraph(resolution);
  for (const [id, node] of Object.entries(tested)) {
    if (['71', '76', '79'].includes(id)) continue;
    const actual = structuredClone(graph[id]);
    if (is4k && id === '75') actual.inputs.resolution = node.inputs.resolution;
    if (is4k && id === '77') { actual.inputs.width = node.inputs.width; actual.inputs.height = node.inputs.height; }
    assert.deepEqual(actual, node);
  }
  assert.equal(graph['79'], undefined); assert.equal(graph['75'].inputs.max_resolution, is4k ? 4096 : 5120);
  assert.equal(graph['70'].inputs.key, 'input_img'); assert.equal(graph['76'].inputs.key, 'result_img');
  assert.equal(Object.values(graph).filter(n => n.class_type.startsWith('MaaSInput')).length, 1);
  assert.ok(!Object.values(graph).some(n => /CanvasLabKSSizePlan|SplitImage|MergeTile/.test(n.class_type)));
  assert.equal(canvas.nodes.length, is4k ? 10 : 12); assert.equal(canvas.links.length, is4k ? 14 : 19);
}

export async function exportHandoff(resolution = '6K') {
  const graph = createHandoffGraph(resolution), name = NAMES[resolution];
  const types = [...new Set(Object.values(graph).map(node => node.class_type))];
  const info = await createComfyUiClient({ baseUrl: process.env.COMFYUI_BASE_URL }).getObjectInfo(types);
  validateSchema(graph, info);
  const canvas = createHandoffCanvas(graph, info, resolution); validateCanvas(graph, canvas, resolution);
  await writeFile(new URL(`${name}.api.json`, OUTPUT), JSON.stringify(graph, null, 2) + '\n');
  await writeFile(new URL(`${name}.json`, OUTPUT), JSON.stringify(canvas, null, 2) + '\n');
  return { status: 'runtime-factory-schema-and-roundtrip-passed-not-maas-executed', nodes: canvas.nodes.length,
    resolution, links: canvas.links.length, preservedRuntimeCore: true, removedDiagnostic79: true,
    backendFields: ['input_img'], newPlugins: [], gpuSubmissionsByExporter: 0,
    runtimeWorkflowVersion: IMAGE_UPSCALE_WORKFLOWS[WORKFLOW_KEY].version,
    executionPolicyVersion: resolution === '4K' ? KS_UPSCALE_AREA_POLICY.version : KS_FIXED_6K_POLICY.version,
    factorySha256: createHash('sha256').update(await readFile(new URL('../src/image-upscale-workflow.mjs', import.meta.url))).digest('hex') };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const receipts = [];
  for (const resolution of ['4K', '6K']) receipts.push(await exportHandoff(resolution));
  console.log(JSON.stringify(receipts));
}

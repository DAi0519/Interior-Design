/**
 * [INPUT]: 依赖平面图机位主服务、OneAPI连接与Beta样本冻结输入
 * [OUTPUT]: 提供Beta机位编辑底图及墙线分析、模式配置与准入、批次原文直出、同机位推理复用、实际送模图及逐图回执归档投影
 * [POS]: src 的Beta与平面图机位适配层，复用主工作台标注、Agent和生图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import { analyzeFloorPlanCameraAnnotation, executeFloorPlanCamera, FLOOR_PLAN_CAMERA_DEFAULTS, FLOOR_PLAN_CAMERA_WORKFLOW,
  prepareFloorPlanCameraInput, readFloorPlanCameraConfig, validateFloorPlanCamera } from './floor-plan-camera-service.mjs';
import { decodeImageDataUrl } from './image-artifact.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });
const generationModes = Object.freeze(['agent', 'direct']);

export function normalizeBetaFloorPlanCameraInput(input) {
  if (input.styleReferenceImages?.length || input.lightingReferenceImages?.length || Object.hasOwn(input, 'foregroundCrop')) {
    throw fail('机位渲染只接受样本原图和机位');
  }
  const mode = input.floorPlanCameraGenerationMode === undefined ? 'agent' : input.floorPlanCameraGenerationMode;
  if (!generationModes.includes(mode)) throw fail('请选择有效的机位生成模式');
  const direct = mode === 'direct';
  if (input.floorPlanCameraWorkflowVersion !== FLOOR_PLAN_CAMERA_WORKFLOW || (!direct && (!Number.isSafeInteger(input.promptVersion)
    || input.promptVersion < 2 || !/^[a-f0-9]{64}$/.test(input.floorPlanCameraPromptSha256 || '')))) {
    throw fail('请刷新平面图机位Prompt配置');
  }
  if (direct && ['promptAgentModelKey', 'promptVersion', 'floorPlanCameraPromptSha256'].some(key => Object.hasOwn(input, key))) {
    throw fail('提示词直出不需要空间推理配置');
  }
  const prompt = input.prompt ?? '';
  if (typeof prompt !== 'string' || prompt.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(prompt)) {
    throw fail('摄影要求最多4000字且不能包含控制字符');
  }
  if (direct && !prompt.trim()) throw fail('请输入直出提示词');
  const camera = validateFloorPlanCamera(input.camera);
  if (camera.height !== FLOOR_PLAN_CAMERA_DEFAULTS.height) throw fail('Beta机位使用人眼平视的默认高度');
  return { featureMode: 'floorPlanCamera', modelKey: input.modelKey, camera, prompt,
    ...(direct ? { floorPlanCameraGenerationMode: mode } : {
      promptAgentModelKey: input.promptAgentModelKey, promptVersion: input.promptVersion,
      floorPlanCameraPromptSha256: input.floorPlanCameraPromptSha256,
    }),
    floorPlanCameraWorkflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW,
    resolution: input.resolution ?? '2K', aspectRatio: input.aspectRatio ?? '16:9', outputFormat: 'png',
    referenceImages: input.referenceImages || [], ...(input.complexity != null ? { complexity: input.complexity } : {}) };
}

function analysisKey(item) {
  const input = item.input;
  return JSON.stringify([item.sampleId || item.caseId, input.camera, input.prompt, input.promptAgentModelKey,
    input.floorPlanCameraWorkflowVersion, input.promptVersion, input.floorPlanCameraPromptSha256, input.resolution, input.aspectRatio]);
}

export function floorPlanCameraArchiveItem(item, prepared) {
  const { guide, source } = prepared;
  const bytes = decodeImageDataUrl(guide.imageUrl);
  if (sha256(bytes) !== guide.sha256) throw fail('机位标注图与实际送模摘要不一致');
  return { ...item, modelLabel: prepared.model.label, input: { ...item.input,
    floorPlanCameraSubmittedSha256: guide.sha256, floorPlanCameraSourceSha256: source.sha256,
    referenceImages: [{ name: `机位标注图.${guide.format === 'jpeg' ? 'jpg' : guide.format}`,
      type: guide.type, size: bytes.length, dataUrl: guide.imageUrl }] } };
}

function betaCameraResult(result, analysis) {
  if (sha256(result.compiledPrompt) !== result.compiledPromptSha256) throw fail('机位最终Prompt归档摘要不一致');
  const direct = result.generationMode === 'direct';
  const agentCostAttributed = direct ? false : !analysis.costAttributed;
  if (!direct) analysis.costAttributed = true;
  const imageCost = result.receipts.image.usageCost?.costUsd;
  const agentCost = agentCostAttributed ? result.receipts.agent.usageCost?.costUsd : 0;
  const betaCostUsd = Number.isFinite(imageCost) && Number.isFinite(agentCost) && imageCost >= 0 && agentCost >= 0
    ? imageCost + agentCost : undefined;
  const workflow = { ...result, image: undefined, outputSha256: result.image.sha256, outputWidth: result.image.width,
    outputHeight: result.image.height, ...(direct ? {} : { agentCostAttributed }), betaCostUsd };
  return { images: [result.image], ...(direct ? {} : { prompt: result.prompt }),
    workflow: { key: 'floor-plan-camera', version: FLOOR_PLAN_CAMERA_WORKFLOW },
    request: { outputFormat: 'png' }, durationMs: Math.max(1, result.durationMs),
    upstream: { metadata: { costUsd: betaCostUsd } }, sync: { archiveFields: {
      '最终 Prompt': result.compiledPrompt,
      ...(direct ? {} : { 'Prompt融合': result.agent.label, 'Agent 编码': result.prompt.code, 'Agent 版本': result.prompt.version }),
      '生成参数': JSON.stringify({ workflow, referenceImageCount: 1 }),
    } } };
}

export function createBetaFloorPlanCameraService({ getModels, getClient, getPrompt, requireKey } = {}) {
  const deps = { getModels, ...(getPrompt ? { getPrompt } : {}) };
  return {
    async config() {
      return { ...await readFloorPlanCameraConfig(deps), betaGenerationModes: generationModes };
    },
    analyzeAnnotation: referenceImage => analyzeFloorPlanCameraAnnotation({ referenceImage }, { includeImage: true }),
    createAnalysisCache(previous) {
      return new Map([...(previous || [])].filter(([, entry]) => entry.ready));
    },
    async verify(batch) {
      const first = batch.items[0].input;
      const direct = first.floorPlanCameraGenerationMode === 'direct';
      if (batch.items.some(({ input }) => (input.floorPlanCameraGenerationMode === 'direct') !== direct
        || (direct && input.prompt !== first.prompt))) throw fail('同一批机位直出需使用同一个生成模式和提示词');
      const config = await readFloorPlanCameraConfig({ ...deps, includeAgentPrompt: !direct });
      if (!config.available) throw fail(config.reason || '平面图机位配置不可用');
      const groups = new Map();
      for (const item of batch.items) {
        const { input } = item;
        const model = config.models.find(model => model.key === input.modelKey && model.available);
        if ((!direct && (config.prompt.version !== input.promptVersion || config.prompt.sha256 !== input.floorPlanCameraPromptSha256
          || !config.agentModels.some(agent => agent.key === input.promptAgentModelKey && agent.selectable)))
          || !model?.sizes[input.aspectRatio]?.[input.resolution]
          || input.complexity != null && !model.complexityOptions.includes(input.complexity)) {
          throw fail('机位Prompt版本、模型权限或出图规格变化，请刷新配置');
        }
        item.modelLabel = model.label;
        const key = analysisKey(item);
        const group = groups.get(key) || { total: 0, counts: new Map() };
        const count = (group.counts.get(input.modelKey) || 0) + 1;
        if (!config.batch.imageCounts.includes(count) || ++group.total > config.batch.maxImages) {
          throw fail(`每个机位最多生成${config.batch.maxImages}张，每个模型最多${config.batch.imageCounts.at(-1)}张`);
        }
        group.counts.set(input.modelKey, count);
        groups.set(key, group);
      }
    },
    async prepare(input) {
      if (input.referenceImages?.length !== 1) throw fail('每个机位样本需要一张户型原图');
      const mode = input.floorPlanCameraGenerationMode === 'direct' ? { generationMode: 'direct' } : {
        agentModelKey: input.promptAgentModelKey, promptVersion: input.promptVersion, promptSha256: input.floorPlanCameraPromptSha256,
      };
      return prepareFloorPlanCameraInput({ action: 'render', workflowVersion: input.floorPlanCameraWorkflowVersion,
        referenceImage: input.referenceImages[0], camera: input.camera, modelKey: input.modelKey, ...mode, userRequirements: input.prompt,
        resolution: input.resolution, aspectRatio: input.aspectRatio, ...(input.complexity != null ? { complexity: input.complexity } : {}) }, deps);
    },
    async execute(item, prepared, cache) {
      const key = analysisKey(item);
      const connection = requireKey ? sha256(requireKey()) : null;
      const assertConnection = () => {
        if (requireKey && sha256(requireKey()) !== connection) throw fail('OneAPI连接已变更，请刷新配置后新建批次', 409);
      };
      const client = await getClient();
      assertConnection();
      let analysis;
      const result = await executeFloorPlanCamera(prepared, { ...deps, client, assertConnection,
        async getModels(...args) {
          assertConnection();
          const models = await getModels(...args);
          assertConnection();
          return models;
        },
        reuseAnalysis(run) {
          analysis = cache.get(key);
          if (!analysis) {
            analysis = { connection, guideSha256: prepared.guide.sha256, sourceSha256: prepared.source.sha256 };
            cache.set(key, analysis);
            analysis.promise = Promise.resolve().then(run).then(value => {
              analysis.ready = true;
              return value;
            });
          }
          if (analysis.connection !== connection || analysis.guideSha256 !== prepared.guide.sha256
            || analysis.sourceSha256 !== prepared.source.sha256) throw fail('同机位的OneAPI连接或样本原图已改变，请新建批次', 409);
          return analysis.promise;
        },
      });
      return betaCameraResult(result, analysis);
    },
  };
}

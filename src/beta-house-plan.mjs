/**
 * [INPUT]: 依赖户型布局主服务、独立Prompt资产和Beta冻结输入/归档字段
 * [OUTPUT]: 提供Beta布局准入、按样本执行及归档强校验，沿用主工作台模型/默认参数
 * [POS]: src 的Beta与户型布局适配层，不复制Agent或图片推理，不写普通生成记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { isDeepStrictEqual } from 'node:util';
import { HOUSE_PLAN_WORKFLOW, readHousePlanConfig, prepareHousePlanInput, executeHousePlan, validateHousePlanAnnotations } from './house-plan-service.mjs';
import { HOUSE_PLAN_CODE, housePlanHash } from './house-plan-prompt.mjs';
import { betaBaseContractError } from './beta-base-schema.mjs';
const fail = message => Object.assign(new Error(message), { statusCode: 400, retryable: false });
export function normalizeBetaHousePlanInput(input) {
  if (input.styleReferenceImages?.length || input.lightingReferenceImages?.length) throw fail('户型布局只接受户型原图');
  if (input.housePlanWorkflowVersion !== HOUSE_PLAN_WORKFLOW || !Number.isSafeInteger(input.promptVersion)
    || input.promptVersion < 1 || !/^[a-f0-9]{64}$/.test(input.housePlanPromptSha256 || '')) throw fail('请刷新户型布局Prompt配置');
  if (typeof input.prompt !== 'string' || input.prompt.length > 4000) throw fail('布局补充需求最多4000字');
  if (!input.promptAgentModelKey) throw fail('请选择布局分析模型');
  return { featureMode: 'housePlanLayout', modelKey: input.modelKey, prompt: input.prompt,
    promptAgentModelKey: input.promptAgentModelKey, promptVersion: input.promptVersion,
    housePlanPromptSha256: input.housePlanPromptSha256, housePlanWorkflowVersion: HOUSE_PLAN_WORKFLOW,
    annotations: validateHousePlanAnnotations(input.annotations), referenceImages: input.referenceImages || [], outputFormat: 'png' };
}
export function createBetaHousePlanService({ getModels, getClient, getPrompt, prepare = prepareHousePlanInput, execute = executeHousePlan } = {}) {
  const deps = { getModels, ...(getPrompt ? { getPrompt } : {}) };
  return {
    config: () => readHousePlanConfig(deps),
    async verify(batch) {
      const config = await this.config();
      if (!config.available) throw fail(config.reason || '户型布局配置不可用');
      for (const { input } of batch.items) {
        const asset = config.promptVersions.find(asset => asset.version === input.promptVersion);
        if (!asset || asset.sha256 !== input.housePlanPromptSha256
          || !config.layoutModels.some(model => model.key === input.modelKey && model.available)
          || !config.agentModels.some(model => model.key === input.promptAgentModelKey)) throw fail('布局版本或模型权限变化，请刷新配置');
      }
    },
    async prepare(input) {
      if (input.referenceImages?.length !== 1) throw fail('每个布局样本需要一张户型原图');
      return prepare({ action: 'layout', referenceImage: input.referenceImages[0], annotations: input.annotations,
        userRequirements: input.prompt, modelKey: input.modelKey, agentModelKey: input.promptAgentModelKey,
        promptVersion: input.promptVersion, promptSha256: input.housePlanPromptSha256 }, deps);
    },
    async execute(prepared) {
      let compiledPrompt = '';
      const result = await execute(prepared, { ...deps, client: getClient(), onCompiledPrompt: text => { compiledPrompt = text; } });
      if (!compiledPrompt || housePlanHash(compiledPrompt) !== result.compiledPromptSha256) throw fail('布局最终Prompt归档摘要不一致');
      const costs = Object.values(result.receipts).map(value => value.usageCost?.costUsd).filter(value => Number.isFinite(value));
      const costUsd = costs.length === 2 ? costs.reduce((a, b) => a + b, 0) : undefined;
      const workflow = { ...result, image: undefined, outputSha256: result.image.sha256,
        outputWidth: result.image.width, outputHeight: result.image.height };
      return { images: [result.image], prompt: result.prompt, workflow: { key: 'house-plan-layout', version: HOUSE_PLAN_WORKFLOW },
        request: { outputFormat: 'png' }, durationMs: result.durationMs,
        upstream: { metadata: { costUsd } }, sync: { archiveFields: {
          '最终 Prompt': compiledPrompt, 'Prompt融合': result.agent.label, 'Agent 编码': result.prompt.code,
          'Agent 版本': result.prompt.version, '生成参数': JSON.stringify({ workflow, referenceImageCount: 1 }),
        } } };
    },
  };
}
export function housePlanArchiveSnapshot(input) {
  return input.featureMode === 'housePlanLayout' ? { annotations: input.annotations, housePlanPromptSha256: input.housePlanPromptSha256,
    housePlanWorkflowVersion: input.housePlanWorkflowVersion } : {};
}
export function verifyHousePlanArchive(fields, snapshot, bytes) {
  let actual;
  try { actual = JSON.parse(fields['生成参数']).workflow; } catch { throw betaBaseContractError('户型布局缺少实际生成参数'); }
  if (actual?.featureMode !== 'housePlanLayout' || actual.workflowVersion !== snapshot.housePlanWorkflowVersion
    || actual.prompt?.code !== HOUSE_PLAN_CODE || actual.prompt.version !== snapshot.promptVersion
    || actual.prompt.sha256 !== snapshot.housePlanPromptSha256 || fields['Agent 编码'] !== HOUSE_PLAN_CODE
    || Number(fields['Agent 版本']) !== snapshot.promptVersion || actual.model?.key !== snapshot.modelKey
    || actual.agent?.key !== snapshot.promptAgentModelKey || !isDeepStrictEqual(actual.annotations, snapshot.annotations)
    || housePlanHash(fields['最终 Prompt'] || '') !== actual.compiledPromptSha256
    || !/^[a-f0-9]{64}$/.test(actual.source?.sha256 || '')
    || !/^[a-f0-9]{64}$/.test(actual.outputSha256 || '') || bytes && housePlanHash(bytes) !== actual.outputSha256) {
    throw betaBaseContractError('户型布局实际标注、模型、Prompt版本或成品摘要与冻结配置不一致');
  }
}

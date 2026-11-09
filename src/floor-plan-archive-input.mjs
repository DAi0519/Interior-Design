/**
 * [INPUT]: 平面出图任务的原图、实际送模图、最终提示词、逐图结果和回执。
 * [OUTPUT]: 户型布局标注图优先保留原件，生成逐图稳定归档身份，投影可复验的飞书记录，并串行安排同步。
 * [POS]: 三个平面图出图入口与飞书归档之间的私有边界，亦用于有原始证据的补录。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import { decodeImageDataUrl } from './image-artifact.mjs';
import { FLOOR_PLAN_ARCHIVE_LABELS, syncFloorPlanToLark } from './floor-plan-archive.mjs';
import { FLOOR_PLAN_GPT_MODEL_KEYS } from './floor-plan-service.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

function archiveImage(imageUrl, fileName, expectedSha256) {
  const sha256 = hash(decodeImageDataUrl(imageUrl));
  if (expectedSha256 && sha256 !== expectedSha256) throw new Error('归档参考图与生成时的文件摘要不一致');
  return { imageUrl, fileName, sha256, mimeType: imageUrl.slice(5, imageUrl.indexOf(';')) };
}

export function floorPlanArchiveInput({ featureMode, jobId, result, sourceImage, submittedImageUrl,
  compiledPrompt = result.compiledPrompt, slot = 1, imageIndex = 1, total = 1, agentReceipt = result.receipts?.agent }) {
  const label = FLOOR_PLAN_ARCHIVE_LABELS[featureMode];
  if (!label || !result.image?.url || !result.model?.key || !compiledPrompt) throw new Error('缺少平面出图的归档证据');
  const compiledPromptSha256 = hash(compiledPrompt);
  if (result.compiledPromptSha256 && result.compiledPromptSha256 !== compiledPromptSha256) throw new Error('归档提示词与实际送模词摘要不一致');
  const actual = result.actual || {};
  const submittedSha256 = actual.referenceImageSha256 || actual.agentInputImageSha256
    || (result.action !== 'camera' ? result.source?.submittedSha256 : null);
  const source = archiveImage(sourceImage.dataUrl, sourceImage.name || '原始平面图', result.source?.sha256);
  const annotatedLayout = featureMode === 'housePlanLayout' && result.source?.submittedRole === 'space-annotated-plan';
  const submitted = archiveImage(submittedImageUrl, featureMode === 'floorPlanCamera' ? '实际送模-机位标注图'
    : annotatedLayout ? '实际送模-空间标注图' : '实际送模-平面图', submittedSha256);
  const sameInput = source.sha256 === submitted.sha256;
  const archiveId = `floor-plan-${hash(JSON.stringify([featureMode, jobId, result.model.key, slot]))}`;
  const sourcePrompt = result.userRequirements || '';
  const submittedRole = actual.generationMode === 'text-to-image' ? 'agent-camera-annotated-plan'
    : featureMode === 'floorPlanCamera' ? 'camera-annotated-plan' : 'submitted';
  const transport = result.transport || actual.transport || (result.action === 'camera' ? 'images-edits'
    : actual.generationMode === 'text-to-image' ? 'images-generations'
      : FLOOR_PLAN_GPT_MODEL_KEYS.includes(result.model.key) ? 'responses-background' : 'responses');
  return {
    archiveId, featureMode, title: `${label} · ${result.model.label} · 第${slot}张`,
    durationMs: result.durationMs, finalPrompt: compiledPrompt, sourcePrompt, modelLabel: result.model.label,
    resultImage: { url: result.image.url, sha256: result.image.sha256 },
    referenceImages: sameInput ? [source] : annotatedLayout ? [submitted, source] : [source, submitted],
    preview: { outputFormat: result.image.type.split('/')[1], quality: actual.quality, ratio: result.aspectRatio,
      referenceImageCount: actual.referenceImageCount ?? 1, resolution: result.resolution || actual.outputResolution || (result.action === 'camera' ? '2K-max' : undefined),
      transport },
    workflow: {
      jobId, imageIndex, total, modelIndex: slot, featureMode, action: result.action, workflowVersion: result.workflowVersion,
      modelKey: result.model.key, modelId: result.model.id, agentModelKey: result.agent?.key, agentModelId: result.agent?.id,
      agentModelLabel: result.agent?.label, agentCode: result.agent ? result.prompt?.code : undefined,
      agentVersion: result.agent ? result.prompt?.version : undefined,
      prompt: result.prompt, compiledPromptSha256, userRequirements: sourcePrompt, source: result.source,
      referenceRoles: sameInput ? ['original-and-submitted'] : annotatedLayout ? ['space-annotated-plan', 'original'] : ['original', submittedRole],
      sourceSha256: source.sha256, submittedSha256: submitted.sha256, outputSha256: result.image.sha256,
      camera: result.camera, annotations: result.annotations, plan: result.plan, viewSummary: result.viewSummary, scenePrompt: result.scenePrompt,
      requestedComplexity: result.requestedComplexity, actual,
      receipts: { agent: agentReceipt, image: result.receipts?.image || { requestId: result.requestId, usageCost: result.usageCost } },
    },
  };
}

export function createFloorPlanArchiveScheduler(syncJobs, writeArchive = syncFloorPlanToLark) {
  let previousWrite = Promise.resolve();
  return input => syncJobs.enqueue(input.archiveId, () => {
    const write = previousWrite.then(() => writeArchive(input));
    previousWrite = write.catch(() => {});
    return write;
  }, { retryable: true });
}

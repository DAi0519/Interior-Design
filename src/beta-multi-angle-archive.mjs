/**
 * [INPUT]: 依赖冻结机位/模型/指令版本、实际多角度回执、结果字节与共享镜头指令
 * [OUTPUT]: 提供多角度 Beta 功能标签、配置投影及生成/恢复时的结果校验
 * [POS]: src 的 Beta 多角度归档合同，由 beta-base 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { betaBaseContractError } from "./beta-base-schema.mjs";
import { MULTI_ANGLE_PROMPT_VERSION, multiAnglePrompt } from "./image-multi-angle-prompt.mjs";
import { resolveMultiAngleModel } from "./image-multi-angle-service.mjs";

export const BETA_MULTI_ANGLE_LABEL = "多角度";

export function multiAngleArchiveSnapshot(input) {
  if (input.featureMode !== "imageMultiAngle") return {};
  return {
    multiAngleModel: input.multiAngleModel,
    cameraPose: input.cameraPose,
    multiAnglePromptVersion: input.multiAnglePromptVersion,
  };
}

export function verifyBetaMultiAngleArchive(fields, snapshot, resultBytes) {
  let parameters;
  try { parameters = JSON.parse(fields["生成参数"]); }
  catch (cause) { throw betaBaseContractError("多角度缺少实际生成参数", cause); }
  const workflow = parameters?.workflow;
  const model = resolveMultiAngleModel(snapshot.multiAngleModel);
  if (!workflow || workflow.feature !== "image-multi-angle" || workflow.modelKey !== model.key
    || workflow.provider !== model.provider || !isDeepStrictEqual(workflow.pose, snapshot.cameraPose)
    || !snapshot.multiAnglePromptVersion || workflow.promptVersion !== snapshot.multiAnglePromptVersion
    || workflow.finalPromptCaptured !== true || !workflow.workflowVersion
    || fields["Prompt / 工作流版本"] !== `${workflow.workflowId}@${workflow.workflowVersion}`
    || parameters.referenceImageCount !== 1 || parameters.quality !== snapshot.quality) {
    throw betaBaseContractError("多角度实际机位、模型、质量或指令版本与冻结配置不一致");
  }
  const prompt = fields["最终 Prompt"];
  if (typeof prompt !== "string" || !prompt.trim()
    || (workflow.promptVersion === MULTI_ANGLE_PROMPT_VERSION && prompt !== multiAnglePrompt(snapshot.cameraPose))) {
    throw betaBaseContractError("多角度缺少与机位一致的实际提交指令");
  }
  if (createHash("sha256").update(resultBytes).digest("hex") !== workflow.outputSha256
    || fields["尺寸"] !== `${workflow.actualOutputWidth}x${workflow.actualOutputHeight}`) {
    throw betaBaseContractError("多角度结果尺寸或 SHA-256 与回执不一致");
  }
}

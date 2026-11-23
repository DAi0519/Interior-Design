/**
 * [INPUT]: 依赖扩图/超分/多角度共享能力、Beta样本原图与冻结机位输入
 * [OUTPUT]: 对外提供Beta图片工具脱敏目录、入队与执行准入，以及多角度模型、质量、机位和镜头指令版本冻结
 * [POS]: src 的Beta图片工具准入层，复用正式多角度、扩图和超分的真实输入校验
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { publicBetaOutpaintConfig, verifyBetaOutpaintBatch } from "./beta-outpaint.mjs";
import { publicBetaUpscaleConfig, validateBetaUpscaleSource, verifyBetaUpscaleBatch } from "./beta-upscale.mjs";
import { normalizeImageOutpaintInput } from "./image-outpaint-service.mjs";
import { MULTI_ANGLE_API_MODELS, resolveMultiAngleQuality } from "./image-multi-angle-oneapi.mjs";
import { MULTI_ANGLE_PROMPT_VERSION, normalizeCameraPose } from "./image-multi-angle-prompt.mjs";
import { MULTI_ANGLE_IMAGE_POLICY } from "./image-multi-angle-image.mjs";
import { resolveMultiAngleModel, validateMultiAngleInput } from "./image-multi-angle-service.mjs";
import { REFERENCE_IMAGE_POLICY } from "./reference-image.mjs";

const multiAngleModels = [resolveMultiAngleModel(), ...MULTI_ANGLE_API_MODELS];
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });

export function multiAngleRecoveryError(cause) {
  const message = cause ? `${String(cause.message || "生成失败").slice(0, 440)}。原多角度请求已尝试执行，请先核对原任务`
    : "未找到可恢复的多角度结果，请先核对原任务";
  return Object.assign(fail(message, 409), { cause });
}

export function singleBetaImageToolAttempt(featureMode, input) {
  return featureMode === "imageMultiAngle" || featureMode === "imageOutpaint"
    && ["gptImage25Sunburst", "gptImage26Sunburst", "gptImage26Flare"].includes(input.outpaintEngine);
}

function publicBetaMultiAngleConfig(rawConfig) {
  const models = multiAngleModels.map(({ id, ...model }) => {
    const status = rawConfig.models?.find(candidate => candidate.key === model.key);
    const available = status?.available === true;
    return { ...model, available, reason: available ? "" : String(status?.reason || "多角度模型暂不可用").slice(0, 500) };
  });
  return { models, available: models.some(model => model.available), defaultModelKey: multiAngleModels[0].key,
    promptVersion: MULTI_ANGLE_PROMPT_VERSION, imagePolicy: { ...MULTI_ANGLE_IMAGE_POLICY,
      maxInputBytes: REFERENCE_IMAGE_POLICY.maxBytesPerImage } };
}

export function normalizeBetaMultiAngleInput(input, { recovering = false } = {}) {
  const modelKey = input.multiAngleModel ?? input.modelKey;
  if (typeof modelKey !== "string" || !modelKey || (input.modelKey !== undefined && input.modelKey !== modelKey)) {
    throw fail("所选多角度模型不一致或缺失");
  }
  const model = resolveMultiAngleModel(modelKey);
  if (input.referenceImages?.length || input.styleReferenceImages?.length || input.lightingReferenceImages?.length) {
    throw fail("Beta多角度请仅提交飞书样本ID，不接受重传原图或其他参考图");
  }
  if (input.resolution !== undefined && input.resolution !== "2K") throw fail("Beta多角度输出长边最高2K");
  const version = input.multiAnglePromptVersion ?? MULTI_ANGLE_PROMPT_VERSION;
  if (version !== MULTI_ANGLE_PROMPT_VERSION && (!recovering || !/^\d{4}-\d{2}-\d{2}\.en\.\d+$/.test(version))) {
    throw fail("多角度镜头指令版本已变化，请刷新配置", 409);
  }
  const quality = resolveMultiAngleQuality(model, input.quality);
  return { featureMode: "imageMultiAngle", modelKey: model.key, multiAngleModel: model.key,
    cameraPose: normalizeCameraPose(input.cameraPose), multiAnglePromptVersion: version,
    resolution: "2K", ...(quality ? { quality } : {}) };
}

function verifyBetaMultiAngleBatch(batch, rawConfig) {
  const { models } = publicBetaMultiAngleConfig(rawConfig);
  for (const item of batch.items) {
    if (item.input.multiAnglePromptVersion !== MULTI_ANGLE_PROMPT_VERSION) throw fail("多角度镜头指令版本已变化，请刷新配置", 409);
    const model = models.find(candidate => candidate.key === item.input.multiAngleModel);
    if (!model?.available) throw fail(`${model?.label || "所选多角度模型"} 暂不可用：${model?.reason || "目录不可用"}`, 409);
  }
}

export function createBetaImageToolAdmission({ getOutpaintConfig, getUpscaleConfig, getMultiAngleConfig }) {
  const tools = {
    imageOutpaint: { readConfig: getOutpaintConfig, verify: verifyBetaOutpaintBatch, validate: normalizeImageOutpaintInput },
    imageUpscale: { readConfig: getUpscaleConfig, verify: verifyBetaUpscaleBatch, validate: validateBetaUpscaleSource },
    imageMultiAngle: { readConfig: getMultiAngleConfig, verify: verifyBetaMultiAngleBatch, validate: validateMultiAngleInput },
  };
  const read = async mode => (await tools[mode].readConfig?.()) ?? {};
  const verify = async batch => tools[batch.featureMode].verify(batch, await read(batch.featureMode));
  return {
    handles: mode => Object.hasOwn(tools, mode),
    verify,
    async validateItem(batch, item) {
      await verify({ ...batch, items: [item] });
      await tools[batch.featureMode].validate(item.input);
    },
    async config() {
      return {
        outpaint: publicBetaOutpaintConfig(await read("imageOutpaint")),
        upscale: publicBetaUpscaleConfig(await read("imageUpscale")),
        ...(getMultiAngleConfig ? { multiAngle: publicBetaMultiAngleConfig(await read("imageMultiAngle")) } : {}),
      };
    },
  };
}

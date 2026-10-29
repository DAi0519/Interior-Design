/**
 * [INPUT]: 依赖共享 ComfyUI 客户端、节点/模型连线准入器与全景 R5_4 工厂，接收单张原始全景及取消/进度选项
 * [OUTPUT]: 对外提供全景专用客户端配置、执行前真实尺寸/完整节点准入与默认二十分钟执行窗口
 * [POS]: src 的全景传输适配器，仅提交球面工作流，复用普通客户端的单次提交、产物身份与 SHA 校验
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createComfyUiClient } from "./comfyui-client.mjs";
import { verifyMultiAngleCapabilities } from "./image-multi-angle-workflow.mjs";
import {
  PANORAMA_REQUIRED_NODES,
  PANORAMA_WORKFLOW,
  createPanoramaWorkflow,
  panoramaArtifactPrefix,
  panoramaSourceDimensions,
  panoramaWorkflowMetadata,
} from "./panorama-workflow.mjs";

export const PANORAMA_EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;
export const PANORAMA_CLIENT_OPTIONS = Object.freeze({
  artifactPrefix: panoramaArtifactPrefix,
  outputNodeId: PANORAMA_WORKFLOW.outputNodeId,
  workflowFactory: createPanoramaWorkflow,
  workflowMetadataFactory: panoramaWorkflowMetadata,
});

const fail = message => Object.assign(new Error(message), { statusCode: 409, retryable: false });

export function createPanoramaClient(options = {}) {
  const client = createComfyUiClient({ ...options, ...PANORAMA_CLIENT_OPTIONS });
  return {
    ...client,
    async generateImage(request, runOptions = {}) {
      runOptions.signal?.throwIfAborted();
      if (request?.workflow_kind !== PANORAMA_WORKFLOW.id || request.n !== 1 || request.images?.length !== 1) {
        throw fail("全景 R5_4 需要独立工作流身份与单张原图请求");
      }
      const dataUrl = request.images[0]?.image_url;
      const match = typeof dataUrl === "string" && /^data:image\/(?:png|jpeg|webp);base64,([a-zA-Z0-9+/=\s]+)$/.exec(dataUrl);
      if (!match) throw fail("全景 R5_4 需要原始 PNG、JPEG 或 WebP 图片");
      const dimensions = panoramaSourceDimensions(match[1]);
      if (request.width !== dimensions.width || request.height !== dimensions.height) {
        throw fail("全景 R5_4 请求尺寸与原图真实尺寸不一致");
      }
      const graph = createPanoramaWorkflow({
        artifactKey: "panorama-capability-check",
        generationRequest: request,
        imageBase64: match[1],
        prompt: request.prompt,
        negativePrompt: request.negative_prompt,
        seed: 1,
        ...dimensions,
      });
      const catalog = await client.getObjectInfo(PANORAMA_REQUIRED_NODES);
      try {
        verifyMultiAngleCapabilities(graph, catalog);
      } catch (error) {
        throw fail(error.message);
      }
      runOptions.signal?.throwIfAborted();
      return client.generateImage(request, { executionTimeoutMs: PANORAMA_EXECUTION_TIMEOUT_MS, ...runOptions });
    },
  };
}

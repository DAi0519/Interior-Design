/**
 * [INPUT]: 依赖实际超分节点图与 ComfyUI object_info 节点接口和模型枚举
 * [OUTPUT]: 提供 verifyGraphCapabilities 纯合同核验，以及独立/嵌入 KS 共用的执行与排队时限
 * [POS]: src 的超分能力合同边界，被 image-upscale-service 与 comfyui-client 复用，不发请求或构建工作流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const IMAGE_UPSCALE_KS_TIMEOUT_MS = 15 * 60 * 1000;
export const IMAGE_UPSCALE_QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

export function verifyGraphCapabilities(graph, objectInfo) {
  for (const node of Object.values(graph)) {
    const schema = objectInfo[node.class_type]?.input;
    if (!schema) throw new Error(`缺少超分节点：${node.class_type}`);
    for (const field of Object.keys(schema.required || {})) {
      if (!(field in node.inputs)) throw new Error(`超分节点接口不兼容：${node.class_type}.${field}`);
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      const specification = schema.required?.[field] || schema.optional?.[field];
      if (!specification) throw new Error(`超分节点接口不兼容：${node.class_type}.${field}`);
      if (Array.isArray(value)) continue;
      const choices = Array.isArray(specification[0]) ? specification[0]
        : specification[0] === "COMBO" ? specification[1]?.options : null;
      if (choices && !choices.includes(value)) {
        throw new Error(`超分节点配置尚未就绪：${node.class_type}.${field}`);
      }
    }
  }
}

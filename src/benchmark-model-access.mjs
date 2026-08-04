/**
 * [INPUT]: 依赖冻结 Benchmark 计划、OneAPI 模型目录客户端与按配置解析的外部图像客户端
 * [OUTPUT]: 对外提供 OneAPI 模型权限和 ComfyUI 等外部 Provider 健康状态的统一预检
 * [POS]: src 的 Benchmark Provider 准入层，被工作台预检与 Runner 执行共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function accessError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function oneApiModelIds(plan) {
  return new Set(
    plan.groups.flatMap((group) => [
      group.fusionModel.id,
      ...group.configs
        .filter((config) => config.imageModelProvider === "oneapi")
        .map((config) => config.imageModelId),
    ]),
  );
}

function externalConfigs(plan) {
  return [
    ...new Map(
      plan.groups
        .flatMap((group) => group.configs)
        .filter((config) => config.imageModelProvider !== "oneapi")
        .map((config) => [config.imageModelId, config]),
    ).values(),
  ];
}

export async function assertBenchmarkModelAvailability(
  client,
  plan,
  { imageClientForModel = null } = {},
) {
  const available = new Set(
    (await client.listModels())
      .map((model) => model.id || model.name)
      .filter(Boolean),
  );
  const missing = [...oneApiModelIds(plan)].filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw accessError(`当前 API Key 未开放模型：${missing.join("、")}`);
  }
  for (const config of externalConfigs(plan)) {
    if (typeof imageClientForModel !== "function") {
      throw accessError(`${config.imageModelLabel} 缺少 ${config.imageModelProvider} 图像客户端`);
    }
    const imageClient = await imageClientForModel(config);
    if (!imageClient || typeof imageClient.generateImage !== "function") {
      throw accessError(`${config.imageModelLabel} 图像客户端不可用`);
    }
    if (typeof imageClient.checkHealth !== "function") {
      throw accessError(`${config.imageModelLabel} 缺少服务健康检查`);
    }
    const health = await imageClient.checkHealth();
    if (health?.available !== true) {
      throw accessError(`${config.imageModelLabel} 服务当前不可用`);
    }
  }
}

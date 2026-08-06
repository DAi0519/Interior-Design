/**
 * [INPUT]: 依赖环境变量中的 Benchmark Base/OneAPI/ComfyUI 配置、benchmark-base 与 benchmark-runner 应用服务
 * [OUTPUT]: 提供可汇总多候选 Agent/Style/融合模型的默认只读预演、显式 --execute 才按模型 Provider 执行生图的模型横评命令行入口
 * [POS]: 项目根目录的 Benchmark Runner 启动器，与个人测试工作台 server.mjs 相互隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  benchmarkBaseConfigFromEnv,
  createBenchmarkBaseStore,
} from "./src/benchmark-base.mjs";
import {
  buildBenchmarkPlan,
  runBenchmark,
} from "./src/benchmark-runner.mjs";
import { createComfyUiClient } from "./src/comfyui-client.mjs";
import { createOneApiClient } from "./src/oneapi-client.mjs";

function integerArgument(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} 后必须是正整数`);
  }
  return value;
}

function stringArgument(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = String(args[index + 1] || "").trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} 后缺少值`);
  }
  return value;
}

function publicPlan(plan) {
  const values = (group, getter) => [...new Set(group.configs.map(getter))].join("、");
  return {
    groups: plan.groups.map((group) => ({
      cases: group.cases.length,
      fusionAgent: values(group, (config) => `${config.agent.code}@v${config.agent.version}`),
      fusionModel: values(group, (config) => config.fusionModel.label),
      groupId: group.groupId,
      imageModels: group.configs.map((config) => config.imageModelLabel),
      output: group.output,
      promptBatchesPerCase: group.cases[0]?.batches.length || 0,
      styleDna: values(group, (config) => `${config.style.code}@v${config.style.version}`),
    })),
    summary: plan.summary,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const config = benchmarkBaseConfigFromEnv();
  const store = createBenchmarkBaseStore(config);
  const snapshot = await store.loadSnapshot();
  const plan = buildBenchmarkPlan(snapshot, {
    groupId: stringArgument(args, "--group"),
    maxCases: integerArgument(args, "--max-cases"),
    maxPromptBatches: integerArgument(args, "--max-prompt-batches"),
  });

  if (!execute) {
    console.log(JSON.stringify({
      ...publicPlan(plan),
      mode: "plan",
      note: "未调用融合或出图模型；传入 --execute 才会执行并写回 Base",
    }, null, 2));
    return;
  }

  const apiKey = String(process.env.ONEAPI_API_KEY || "").trim();
  if (!apiKey) throw new Error("执行模式缺少 ONEAPI_API_KEY");
  const oneApiClient = createOneApiClient(apiKey);
  const comfyUiClient = createComfyUiClient();
  const result = await runBenchmark(plan, {
    client: oneApiClient,
    execute: true,
    imageClientForModel: (model) =>
      model.imageModelProvider === "comfyui" ? comfyUiClient : oneApiClient,
    store,
  });
  console.log(JSON.stringify({
    ...publicPlan(plan),
    result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

# src/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护服务端业务模块清单
model-config.mjs: 模型参数真源，维护模型 ID、尺寸矩阵、格式、GPT 中等质量默认值与请求白名单
agent-model-config.mjs: Prompt Agent 模型真源，维护七个候选 ID、图片输入能力与接口可用性组合
oneapi-client.mjs: OneAPI HTTP 客户端，Prompt Agent、Style DNA 多轮多图反推与图生图走 Responses，纯文生图走 Images API，并统一脱敏错误
lark-cli.mjs: 飞书 CLI 基础设施，统一子进程执行、JSON 解析、超时和错误归一化
lark-sync.mjs: 飞书生成记录同步边界，分列归档用户原始 Prompt、实际最终 Prompt、工作流元数据、结果图与参考图附件
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: Prompt Agent 配置边界，以五分钟进程缓存按编码读取最高已上架且 Prompt 完整的白模 Agent 版本
white-model-workflow.mjs: 设计模型渲染应用服务，按版本化 Style DNA 唯一编码编排 Prompt Agent、Responses 图生图、质量回显与非阻塞归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，维护可公开编辑的默认 System Prompt 单一真源，首轮校验 1–5 张同风格参考图并支持仅图片触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-image.mjs: 参考图安全边界，默认最多 4 张并允许调用方设置独立上限，统一校验单张 8MB、合计 20MB、MIME 与真实字节数
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

# src/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护服务端业务模块清单
model-config.mjs: 模型参数真源，维护模型 ID、合法尺寸矩阵、首张参考图可信宽高最近比例选择、格式、GPT 中等质量默认值与请求白名单
image-dimensions.mjs: 无解码图片尺寸探测器，从 PNG IHDR、JPEG SOF 与 WebP VP8X/VP8L/VP8 图片头读取可信宽高
agent-model-config.mjs: Prompt Agent 模型真源，维护九个候选 ID、最新 Doubao、图片输入能力与接口可用性组合，不纳入 Opus
oneapi-client.mjs: OneAPI HTTP 客户端，Prompt Agent、Style DNA 多轮图片/PDF 反推与图生图走 Responses，分别构造 input_image/input_file，纯文生图走 Images API，归一化请求 ID 并统一脱敏错误
lark-cli.mjs: 飞书 CLI 基础设施，移除 OneAPI Key 后统一子进程环境、执行、JSON 解析、超时和错误归一化
lark-setup.mjs: 运营首次运行边界，检查固定版本 CLI、应用配置、用户 Token、最小 Scope 与 Base 可读性，并编排非阻塞 Device Flow 和临时二维码
local-settings.mjs: 本机设置边界，保留未知环境项并原子写入或删除 .env.local 中的 OneAPI Key
lark-sync.mjs: 飞书生成记录同步边界，分列归档用户原始 Prompt、实际最终 Prompt、出图模型、融合基模、画幅适配模式、工作流元数据、结果图与参考图附件
image-artifact.mjs: 图片产物基础设施，统一生成结果 data URL 解码、受限远程下载与输出扩展名
benchmark-base.mjs: Benchmark 飞书持久化边界，分页读取样本/配置/Prompt/模型结果/横评对比五表，幂等写入 Prompt、逐 Run 结果、重试链和展示宽表，并支持历史附件回填
benchmark-identifiers.mjs: Benchmark 标识基础设施，统一稳定 Prompt/Run/重试 ID、SHA-256 与模型提供商归一化
benchmark-runner.mjs: 模型横评应用服务，校验控制变量、排除停用配置、生成稳定 Prompt/Run ID，逐 Run 留存成功失败与重试，同时同步模型结果真源和横评展示
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: 统一 Prompt 资产边界，维护 `AI 生图` Base 内白模与风格反推独立数据表配置，以 Agent 编码派生稳定展示名，并用五分钟进程缓存输出脱敏已上架版本目录与默认最高/指定版本读取
white-model-workflow.mjs: 设计模型渲染应用服务，按版本化 Style DNA 唯一编码与指定场景融合 Agent 版本编排、融合基模名称归档、真实图片宽高驱动的最近合法比例、手动画幅覆盖、Responses 图生图与非阻塞归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，向浏览器公开脱敏已上架 Prompt 版本目录与附件策略，仅在服务端精确读取所选正文，首轮接收无业务数量上限的 PNG/JPEG/WebP/GIF/PDF 并支持仅附件触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-attachment.mjs: Style DNA 多模态附件安全边界，在通用图片校验之上增加 PDF 文件签名、MIME、真实字节、单文件/合计容量与可选数量校验，并输出 Responses 图片/文件附件
reference-image.mjs: 参考图安全边界，保留生成链路默认最多 4 张并允许调用方配置格式、容量及可选数量上限，统一校验 MIME/真实字节并附加可信图片宽高
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

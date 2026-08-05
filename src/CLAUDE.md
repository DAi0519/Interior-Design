# src/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护服务端业务模块清单
model-config.mjs: 模型参数真源，维护五个 OneAPI 模型与 Flux2 Klein ComfyUI 工作流、Provider、参考图能力、合法尺寸/原图尺寸契约及请求白名单
image-dimensions.mjs: 无解码图片尺寸探测器，从 PNG IHDR、JPEG SOF 与 WebP VP8X/VP8L/VP8 图片头读取可信宽高
agent-model-config.mjs: Prompt Agent 模型真源，维护十个候选 ID（含 Doubao Seed 2.0 Lite）、图片输入能力与接口可用性组合，不纳入 Opus
oneapi-client.mjs: OneAPI HTTP 客户端，样本单图分析、Prompt Agent、双图 AI 评审、Style DNA 多轮图片/PDF 反推与图生图走 Responses，分别构造 input_image/input_file，纯文生图走 Images API，归一化请求 ID 并统一脱敏错误
ai-texture-workflow.mjs: Flux2 Klein ComfyUI 执行图，维护 Flux2 节点连接、外部正向 Prompt 原样注入、固定负向 Prompt、运行时图片/Seed 注入及版本元数据
comfyui-client.mjs: ComfyUI HTTP 客户端，上传单张参考图、提交版本化工作流、轮询 History、下载输出并归一为 data URL 与排队/执行元数据
lark-cli.mjs: 飞书 CLI 基础设施，优先解析项目内固定版 1.0.77、首次调用校验最低版本，移除 OneAPI Key 后统一子进程环境、执行、JSON 解析、超时和错误归一化
lark-setup.mjs: 运营首次运行边界，检查固定版本 CLI、应用配置、用户 Token、字段读取/记录读写/附件上传最小 Scope 与 Base 可读性，并编排非阻塞 Device Flow 和临时二维码
local-settings.mjs: 本机设置边界，保留未知环境项并原子写入或删除 .env.local 中的 OneAPI Key
lark-sync.mjs: 飞书生成记录同步边界，按真实 Base 字段“生图模型”“Prompt融合”分列归档最终出图模型、融合基模及用户原始 Prompt、实际最终 Prompt、画幅适配模式、工作流元数据、结果图与参考图附件
image-artifact.mjs: 图片产物基础设施，统一生成结果 data URL 解码、受限远程下载与输出扩展名
benchmark-base-schema.mjs: Benchmark Base Schema 适配层，维护五张运行表投影字段，并在冻结配置写入前用稳定编码解析实时单选名称、剥离默认 medium 展示后缀、阻止未建模质量档
benchmark-base-config.mjs: Benchmark Base 连接/响应协议层，解析五表环境配置、必填项、分页 envelope 与单选字段值
benchmark-base.mjs: Benchmark 飞书持久化边界，分页读取带空间类型/数据集版本/空间结构/镜头/软装/材质复杂度/输入质量及人工准入类型的样本与其余四张运行表，复用实时字段 Schema 创建冻结生成配置并为写入失败补充配置 ID/阶段上下文，录入完整六项标签、批量同步样本集名称并读写参考图/结果图，幂等写入 Prompt、逐 Run 结果、重试链和展示宽表，并按入口分别筛选“横向对比（展示）”“运行明细”“模型总表”视图
benchmark-identifiers.mjs: Benchmark 标识基础设施，兼容历史模型横评并支持任意提示阶段候选维度的稳定 Prompt/Run/重试 ID、SHA-256 与 Provider 归一化
benchmark-experiment-config.mjs: Benchmark 实验配置领域层，把 `variableKey + variantValues` 规范化为八类质量配置的单变量候选与稳定配置 ID，并推导提示/出图阶段及校验 Provider 输出能力
benchmark-model-access.mjs: Benchmark Provider 准入层，统一检查 OneAPI 模型权限与 ComfyUI 等外部图像服务健康状态
benchmark-runner.mjs: 通用单变量横评应用服务，按因子阶段决定候选间共享或隔离冻结 Prompt，校验模型权限与输出策略，逐 Run 留存成功失败和重试并同步横评展示
benchmark-review.mjs: Benchmark AI 评审领域层，维护与飞书同构的 `white-model-review@v2` 双图三维协议、严格 JSON 解析、旧协议隔离、可用图准入、P95 及模型分类分析
benchmark-labeling.mjs: Benchmark 样本 AI 标注领域层，维护 `sample-labeling@v2`、受控空间与空间结构/镜头/软装/材质复杂度/输入质量五个独立低中高维度、人工准入隔离、单图视觉模型协议、严格 JSON 解析、理由和置信度
benchmark-workbench-store.mjs: Benchmark 当前 worktree 本地状态边界，原子持久化样本集、实验、样本分类元数据、评审批次和版本化 AI 评分，并兼容旧状态迁移
benchmark-workbench.mjs: Benchmark 浏览器应用服务，编排样本治理、五维 AI 待审标注、八类单变量零写入计划、确认后配置落库/运行/评分/分析及飞书跳转，并持久化任务阶段与拦截协议漂移
benchmark-jobs.mjs: Benchmark 后台任务注册表，为长耗时批量生成与 AI 评分公开阶段、Base 落库状态、起止时间、进度、结果和可诊断失败消息
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: 统一 Prompt 资产边界，维护 `AI 生图` Base 内白模与风格反推独立数据表配置，以 Agent 编码稳定路由并支持白模 Agent 可选展示名，用五分钟进程缓存输出脱敏已上架版本目录与默认最高/指定版本读取
white-model-workflow.mjs: 设计模型渲染应用服务，按融合输入指纹复用/重算最终提示词，分离 OneAPI Prompt 客户端与 OneAPI/ComfyUI 图像客户端，并编排版本化 Style DNA、画幅及非阻塞归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，向浏览器公开脱敏已上架 Prompt 版本目录与附件策略，仅在服务端精确读取所选正文，首轮接收无业务数量上限的 PNG/JPEG/WebP/GIF/PDF 并支持仅附件触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-attachment.mjs: Style DNA 多模态附件安全边界，在通用图片校验之上增加 PDF 文件签名、MIME、真实字节、单文件/合计容量与可选数量校验，并输出 Responses 图片/文件附件
reference-image.mjs: 参考图安全边界，保留生成链路默认最多 4 张并允许调用方配置格式、容量及可选数量上限，统一校验 MIME/真实字节并附加可信图片宽高
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

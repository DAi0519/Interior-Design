# src/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护服务端业务模块清单
model-config.mjs: 模型参数真源，维护三个可运行 OneAPI 模型与默认使用 9B FP8/7 steps 的 Flux2 Klein ComfyUI 工作流、Provider、参考图能力、Flux 不限长正向 Prompt、默认/自定义负向 Prompt、含全 OneAPI 2:1 的合法尺寸及 Flux 原图比例约 1MP/4MP 且不超面积的 1K/2K 请求契约
generation-batch.mjs: 单模型多张/多模型生成批次契约，严格校验最多四张结果的共同批次 ID、总数与序号
generation-jobs.mjs: 日常生图后台任务层，提供最多两路并发的保序批执行、部分失败保留、进程内任务查询、领域阶段快照透传及有界结果保留
generation-job-api.mjs: 日常生图后台任务 HTTP 适配层，保留原 `/api/generation-jobs` 入队与查询合同，并让根服务入口维持单文件规模约束
generation-service.mjs: 日常生图应用服务，统一自由生图、效果图美化、精模、白模/空房的 Provider/工作流路由、Flux 负向 Prompt 归档、记录同步与脱离 HTTP 的单模型执行
beta-base.mjs: Beta跑图独立飞书持久化边界，以 `批量跑图 Benchmark` 的样本集→样本→跑图明细三表管理复用资产和一行一结果归档，分列上传样本/输入/风格/结果附件、回写版本/费用/时延/错误，并回读成功状态与非空结果附件裁决完成
beta-runner.mjs: Beta跑图应用服务，提供样本集目录/读取/创建 API，复用正式生成服务执行五功能，接收去重图片资产、不设样本与结果数量上限并保持两路并发排队，分别上报已生成与已同步进度，对失败最多执行三次新 Attempt，且整批仅在全部结果已同步时成功
effect-render-enhancement-prompt.mjs: 效果图美化 Prompt 资产边界，读取独立飞书表中当前已上架 JSON 源文、向浏览器公开脱敏名称/版本状态，严格校验 `BASE/DEFAULT/CONTRACT/TIME/WEATHER` 固定 Schema 并渲染可读旧标题；默认拼接基础→默认，任一环境选择改为基础→契约→时段→天气
effect-render-enhancement-workflow.mjs: 效果图美化应用服务，以单张效果图和天气/时段枚举编排双 Provider 出图、批次元数据与飞书归档
empty-room-type.mjs: 空房房间类型领域真源，维护十个客户可选值、“其他”详情 40 字上限，并向公开目录、工作流校验与飞书同步提供同一归一化合同
image-dimensions.mjs: 无解码图片尺寸探测器，从 PNG IHDR、JPEG SOF 与 WebP VP8X/VP8L/VP8 图片头读取可信宽高
agent-model-config.mjs: Prompt Agent 模型真源，维护十个候选 ID（含 Doubao Seed 2.0 Lite）、图片输入能力与接口可用性组合，不纳入 Opus
oneapi-client.mjs: 可由外部 AbortSignal 主动取消的 OneAPI HTTP 客户端，Prompt Agent 支持白模单图或白模+风格参考双图 Responses；Claude 双图 AI 评审按规则源走 Chat Completions，其余分析、Style DNA 多轮反推与图生图走 Responses，统一归一化请求、费用与脱敏错误
ai-texture-workflow.mjs: Flux2 Klein ComfyUI 执行图，默认使用原版 9B FP8/7 steps、原图比例 1K/2K 推理及输出尺寸、Base64 参考图、正向 Prompt 原样注入、空值回退默认/非空值整段覆盖的负向 Prompt、运行时 Seed 及版本元数据
comfyui-client.mjs: 支持外部取消信号的 ComfyUI HTTP 客户端，将 Base64 参考图、正向/负向 Prompt、1K/2K 目标宽高与所选档位工作流原子提交、只对网关读取抖动做安全重试、明确区分服务不可用、保留节点校验详情、轮询 History、恢复多实例间暂不可见的输出并归一为 data URL 与排队/执行/负向模式元数据
lark-cli.mjs: 飞书 CLI 基础设施，优先解析项目内固定版 1.0.77、首次调用校验最低版本，移除 OneAPI Key 后统一子进程环境、执行、JSON 解析、超时和错误归一化
lark-setup.mjs: 运营首次运行边界，检查固定版本 CLI、应用配置、用户 Token、字段读取/记录读写/附件上传最小 Scope 与 Base 可读性，并编排非阻塞 Device Flow 和临时二维码
local-settings.mjs: 本机设置边界，保留未知环境项并原子写入或删除 .env.local 中的 OneAPI Key
lark-sync.mjs: 飞书生成记录同步边界，按实时 Schema 准入全部功能选项，投影含效果图美化的功能、空房空间类型/其他空间类型、设计方式、Agent 编码/版本、风格选择、最终出图模型、融合基模与 Prompt，同时保留完整天气/时段工作流 JSON，并将主参考图、结果图与可选风格参考图分列上传
image-artifact.mjs: 图片产物基础设施，依赖 sharp 统一生成结果 data URL 解码、受限远程下载、输出扩展名与不修改原件的模型请求 JPEG 降质/缩放压缩
image-download.mjs: 生成结果下载边界，复用受限图片读取并生成跨域安全的字节、MIME、文件名与附件响应头
benchmark-base-schema.mjs: Benchmark Base Schema 适配层，维护五张运行表投影字段，按实时字段存在性/可写类型/单选选项校验全部普通回填，并以稳定编码解析冻结配置展示名、剥离默认 medium 后缀、阻止未建模质量档
benchmark-base-config.mjs: Benchmark Base 连接/响应协议层，解析五表环境配置、必填项、分页 envelope 与单选字段值
benchmark-base.mjs: Benchmark 飞书持久化边界，分页读取五张运行表，在统一写入口按实时 Schema 校验字段/类型/单选值并隔离系统与附件字段，录入完整样本标签、批量同步样本集名称、读写附件，幂等回填配置、Prompt、逐 Run、三维评分/细则/时间、费用、重试链和展示宽表，并筛选三类实验视图
benchmark-identifiers.mjs: Benchmark 标识基础设施，兼容历史模型横评并支持任意提示阶段候选维度的稳定 Prompt/Run/重试 ID、SHA-256 与 Provider 归一化
benchmark-experiment-config.mjs: Benchmark 实验配置领域层，把 `variableKey + variantValues` 规范化为八类质量配置的单变量候选与稳定配置 ID，并推导提示/出图阶段及校验 Provider 输出能力
benchmark-model-access.mjs: Benchmark Provider 准入层，统一检查 OneAPI 模型权限与 ComfyUI 等外部图像服务健康状态
benchmark-plan-input.mjs: Benchmark 计划输入边界，集中维护资源 ID/版本/正整数/同组一致性校验、有效样本筛选与显式 ID 集合归一化
benchmark-runner.mjs: 可主动取消的通用单变量横评应用服务，按因子阶段决定候选间共享或隔离冻结 Prompt，并映射飞书“模型横评/Prompt 横评”实验类型，校验模型权限与输出策略，贯穿费用，逐 Run 留存成功失败和重试、重建持久化进度并同步横评展示
benchmark-review.mjs: Benchmark AI 评审领域层，维护 `white-model-review@v3.1-single-pass` 的单次白模准入与三维 1–5 小数评分、三维证据隔离、完整 JSON 提取/严格契约与单次修复、正式评分 Run 断点筛选、原文留存、MINOR/MAJOR/CRITICAL 本地封顶、40%/30%/30% 加权准入、飞书可读评分细则与浏览器评分目录投影、旧协议隔离、P95 及模型分类分析
benchmark-labeling.mjs: Benchmark 样本 AI 标注领域层，维护 `sample-labeling@v2`、受控空间与空间结构/镜头/软装/材质复杂度/输入质量五个独立低中高维度、人工准入隔离、单图视觉模型协议、严格 JSON 解析、理由和置信度
benchmark-workbench-store.mjs: Benchmark 当前 worktree 本地状态边界，原子持久化样本集、实验、样本分类元数据、评审批次和版本化 AI 评分，并兼容旧状态迁移
benchmark-workbench.mjs: Benchmark 浏览器应用服务，编排样本治理、五维 AI 待审标注、八类单变量零写入计划、确认后配置落库/可取消运行、停止实验 Base 进度重建、v3.1 单次评分与按 Run 断点继续/写回/分析及飞书跳转，并持久化任务阶段、评分失败批次、结构化评分事实与拦截协议漂移
benchmark-jobs.mjs: Benchmark 后台任务注册表，为长耗时批量生成与 AI 评分公开阶段、Base 落库状态、起止时间、进度、主动取消、结果和可诊断失败消息
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: 统一 Prompt 资产边界，维护 `AI 生图` Base 内白模与空房智能默认/平台融合、风格反推配置，以 Agent 编码稳定路由并支持可选展示名，用五分钟进程缓存输出脱敏已上架版本目录、单 Agent 可用性与默认最高/指定版本读取
refined-model-prompt.mjs: 同构版本化 Prompt 读取边界，为精模与效果图美化独立飞书表解析脱敏目录并按版本仅在服务端提供正文
refined-model-workflow.mjs: 精模渲染应用服务，以单张带材质模型图、可选用户要求前置且飞书预设 Prompt 后置的顺序编排双 Provider 出图、批次元数据与原始/最终 Prompt 独立归档
white-model-workflow.mjs: 设计模型渲染应用服务，白模和空房均按智能默认/平台融合稳定编码选 Agent，空房在 Agent 前强制校验客户房间类型及“其他”详情并注入两种 Prompt，仅智能默认允许主图加单张风格参考，平台融合只接收主图与 Style DNA 并拒绝混合风格来源；按含功能/房间类型/详情/Prompt/风格图的完整指纹复用提示词，最终模型仍只接收主图并统一编排双 Provider 出图与归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，向浏览器公开脱敏已上架 Prompt 版本目录与附件策略，仅在服务端精确读取所选正文，首轮接收无业务数量上限的 PNG/JPEG/WebP/GIF/PDF 并支持仅附件触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-attachment.mjs: Style DNA 多模态附件安全边界，在通用图片校验之上增加 PDF 文件签名、MIME、真实字节、单文件/合计容量与可选数量校验，并输出 Responses 图片/文件附件
reference-image.mjs: 参考图安全边界，保留生成链路默认最多 4 张并允许调用方配置格式、容量及可选数量上限，统一校验 MIME/真实字节并附加可信图片宽高
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

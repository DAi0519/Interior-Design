# src/
> L2 | 父级: ../CLAUDE.md

成员清单

image-outpaint-service.mjs: AI 扩图 Flux/Qwen/Sunburst 三引擎应用边界，共享画幅/1K2K4K/位置/scale计划，EXIF后按真实等比缩放适配并记录原尺寸/缩放事实/用户scale，零扩展显式阻断且旧省略scale请求兼容；两款 Flux 候选与Qwen节点分别准入/缓存30秒/执行前复核，非Flux拒绝Flux模型参数；保留各引擎尺寸/Key合同，实际产物校验后复用飞书调度并返回同步身份，底层无调度可独立验证
image-outpaint-archive.mjs: 三引擎共用飞书归档投影与独立模型标签目录，保留实际提交源图/输出/画布/原尺寸/缩放/模型/LoRA/种子/产物指纹/费用/耗时；Qwen固定及Sunburst动态Prompt复用执行真源，Flux Janus正文未返回时留空并记录来源事实，不扩展通用模型目录
image-outpaint-qwen.mjs: 独立 Qwen Image Edit 2511 FP8 mixed 扩图真源，公开固定Prompt供执行与归档共用，对应Lightning4steps/CFG1/euler/simple/shift3.1；原生pad遮罩同时控制latent噪声与最终合成，保留原图中心与32px过渡；固定模型身份/节点能力准入、1K–4K与16px目标合同、请求级产物与实际尺寸/指纹元数据
image-outpaint-workflow.mjs: AI 扩图真实执行图真源，2026-10-15.4 适配 MaaS prod_test 参数 1082 的 18 节点图，输入准入统一放宽至每轴 4096px，受控选择 Flux Fill OneReward FP8/原版 Dev 与各自权重格式，固定 Janus-Pro-1B/20步/guidance30/feathering30，保留 LayerStyle 比例截断后 ceil32 预处理、8px 目标、唯一产物与尺寸/原始来源 SHA-256；643 仅截图线索
image-outpaint-oneapi.mjs: GPT Image 2.5 Sunburst 编辑扩图适配器，按实际输入/四边构造动态Prompt供执行与归档共用，生成透明PNG/外围透明mask，复用模型真源27合法档位/16px对齐/8294400像素上限、固定medium/n1/png、实际尺寸/结果/画布/遮罩SHA-256、placement与真实费用身份
image-tools-api.mjs: 独立图片工具只读配置 API，保留超分健康与目录，公开 Flux/Qwen/Sunburst 三引擎各自合同、动态可用性与准入原因

CLAUDE.md: 本模块地图，维护服务端业务模块清单
app-update.mjs: GitHub 正式 Release 更新检测边界，比较 SemVer、核验标准运行 ZIP 与仓库链接、匿名读取公开仓库及无说明正文的版本页 HEAD 兜底，并提供总超时、并发去重和成功/失败分档缓存
app-update-api.mjs: 共享版本检查与安装 HTTP 边界，按服务端最新正式版回执、安装政策及运行任务状态准入，流式返回安装进度/错误并保护待重启与恢复失败状态
app-installer.mjs: 正式版本安装边界，固定仓库 ZIP/官方 SHA-256 与受信重定向/容量/ZIP 路径准入，无 shell 解压；含 .git 的源码工作区仅安装到持久新目录，无 .git 的 Release 目录原地事务替换发布运行根项、保留配置/依赖/数据并失败回滚；公开 getPolicy/isRestartRequired/isRecoveryRequired，成功后要求重启，恢复失败保留备份与操作指引并阻断再次安装，不自动重启
model-config.mjs: 模型参数真源，维护六个 OneAPI 模型（含 GPT Image 2.5 Sunburst/Flare）与默认 9B FP8/7 steps 的 Flux2 Klein、Provider、参考图能力、Flux 正负 Prompt、原有四模型 2:1 与 2.5 九比例/五质量档、GPT 按比例的 16px/655360–8294400像素/3840边长尺寸映射（1K 16:9 为1536x864）、Seedream 5.0 Pro 仅全景可用的 3040x1520 4K 实验档，以及 Flux 原图比例 1K/2K 原生输出与同图 2K→4K/6K 攸行超分请求契约
generation-batch.mjs: 单模型多张/多模型生成批次契约，严格校验最多四张结果的共同批次 ID、总数与序号
generation-jobs.mjs: 日常生图后台任务层，提供最多两路并发的保序批执行、部分失败保留、进程内任务查询、领域阶段快照透传及有界结果保留；只读 hasActiveJobs 持续守护 running 任务，供原地更新准入使用
generation-job-api.mjs: 日常生成后台任务 HTTP 适配层，需归档生图先校验飞书同步合同，独立图片工具绕过飞书且按所选扩图引擎准入，仅为Flux校验/冻结Fill模型，Flux/Qwen能力或Sunburst当前Key权限未通过不入队，扩图同样需通过飞书Schema，依据Provider公开comfyUi/imageEdit阶段，仅超分豁免归档
generation-service.mjs: 显式功能路由穿透生成输入，含效果图氛围转换与独立效果图美化，阻止空房默认走白模，统一生图与图片工具路由；扩图按所选引擎严格取Flux/Qwen专用ComfyUI或Sunburst编辑客户端、不进通用OneAPI目录、复用飞书调度并透传阶段；超分保持本机结果，保留Flux负向Prompt归档与脱离HTTP单项执行
image-upscale-service.mjs: 图片超分应用服务，校验单图并按源图比例计算 4K/6K/8K 目标，分开 5 分钟排队时限与仅 8K 使用的 15 分钟执行时限，映射带 Prompt ID 的 ComfyUI 阶段并返回真实输出尺寸的本机结果
image-upscale-workflow.mjs: 图片超分工作流真源，以来源 SHA-256 固定三份 SeedVR2 JSON，默认攸行 3B 原图直入并保留两套 7B 预处理差异，提供 4K/6K/8K 长边合同、可独立提交或嵌入 Flux 的 SeedVR2 阶段、最小 ComfyUI 图、唯一产物前缀与元数据
beta-base.mjs: 三表实时 Schema verifier 与含全景美化的七功能映射，组合逐张样本 Store；强度色调/专属美化和全景版本保存到场景/配置 JSON，复用正式投影归档 Prompt/风格/家具/Agent/真实尺寸，回读全部实际写入普通字段及附件 token/字节数，合同错误归一为不可重试 409，确认后返回轻量预览
beta-sample-store.mjs: 草稿样本集显式清空默认可用状态并回读，样本按{id}对象数组写飞书关联并归一化双向回读，单图真实8MB/MIME/尺寸及全景2:1验证、稳定样本ID/内容幂等与附件回读，上传完成才发布；列表只含元数据，原图在执行项读取并再次核验全景比例，预览按需转轻量WebP，不设整集图片容量上限
beta-base-schema.mjs: Beta 三表字段合同真源，实时分页读取并校验全部普通字段类型、功能/状态/房型选项、单多选、附件 ID/名称/类型与关联表目标，不读取旧生成记录或 Benchmark 表
beta-runner.mjs: 七功能草稿创建/逐张上传/完成回读与 ID 批次实时三表 Schema 准入，成员/功能绑定、当前 Key 提示词模型权限与全景模型2:1/明确Prompt版本前置检查；原图只在执行项读取并实际校验8MB/全景2:1，两路并发且重试复用单源图后释放，保留逐样本房型与冻结版本、生成/同步双阶段、完整归档回读、最多三次新Attempt及409不重试；代理 hasActiveJobs，批量生成与飞书同步全部结束后才允许原地更新
effect-render-enhancement-prompt.mjs: 效果图氛围转换/全景图美化 Prompt 资产边界，原效果图表 ID 与 effect-render-enhancement 编码保持兼容，分别公开脱敏可用性/当前上架版本；氛围严格校验 BASE/DEFAULT/CONTRACT/TIME/WEATHER 并按环境拼接，全景接受纯文本/开放 MAIN JSON 与根级尾逗号，禁止跨表回退
effect-render-enhancement-workflow.mjs: 效果图氛围转换/六预设美化/全景图美化共享双 Provider 单图服务，各自独立上架 Prompt；美化按专属版本原样注入且只归档强度色调，全景按panoramaPromptVersion读取冻结资产，氛围继续天气时段，Flux 全景只替换独立 Prompt，其余复用普通工作流与现有负向机制
empty-room-furniture.mjs: 空房家具领域真源，提供线上同名同序目录及独立房型多选推荐、“其他”输入标记及 200 字上限、选择来源归档、仅非空已选需求 Prompt 投影；空条件省略，不推断未选品类为排除项
empty-room-type.mjs: 空房房间类型领域真源，维护十个客户可选值、“其他”详情 40 字上限，并向公开目录、工作流校验与飞书同步提供同一归一化合同
image-dimensions.mjs: 无解码图片尺寸探测器，从 PNG IHDR、JPEG SOF 与 WebP VP8X/VP8L/VP8 图片头读取参考图与生成结果的可信宽高
agent-model-config.mjs: Prompt Agent 模型真源，维护十一个候选 ID（含 DeepSeek V4.1 Flash 与 Doubao Seed 2.0 Lite）、图片输入能力与接口可用性组合，不纳入 Opus
oneapi-client.mjs: 固定 180 秒/外部 AbortSignal 的 OneAPI HTTP 客户端，Prompt Agent/分析/Style DNA/图生图走 Responses、Claude 双图评审走 Chat Completions；editImage 使用 JSON POST `/images/edits` 原样传透明 PNG/mask、不经 JPEG 压缩且不重试收费 POST，保留请求身份/费用与脱敏诊断
ai-texture-workflow-config.mjs: Flux 工作流身份与参数合同真源，集中维护 9B FP8、7-step、节点标识、默认负向 Prompt 与归档元数据
ai-texture-workflow.mjs: Flux2 Klein ComfyUI 执行图，统一使用 9B FP8/7 steps、`euler`、空 Latent 与原图 ReferenceLatent，按原图比例执行 1K/2K 推理；可选直连无 Prompt 攸行 SeedVR2 3B，并以唯一 SaveImage 收口
comfyui-client.mjs: 支持外部取消信号、可独立设置的排队/执行时限与工作流适配器的 ComfyUI HTTP/WebSocket 客户端，将 Base64 单图与工作流原子提交，以请求级唯一产物键隔离多实例同名旧图，通过同 client ID 的事件流区分排队/执行并保留 Prompt ID，WebSocket 丢失执行事件时以实时队列和 History 恢复阶段，即使 `completed=false` 也立即透传节点 OOM/中断，只对网关读取抖动做安全重试、保留节点校验详情、为最终输出提供最长约一分钟的暂不可见恢复，并归一为含真实尺寸/SHA-256 身份的 data URL 与耗时元数据
lark-cli.mjs: 飞书 CLI 基础设施，优先解析项目内固定版 1.0.77、首次调用校验最低版本，移除 OneAPI Key 后统一子进程环境、执行、JSON 解析、超时和错误归一化
lark-setup.mjs: 运营首次运行边界，检查固定版本 CLI、应用配置、用户 Token、字段读取/记录读写/附件上传最小 Scope 与 Base 可读性，并编排非阻塞 Device Flow 和临时二维码
local-settings.mjs: 本机设置边界，保留未知环境项并原子写入或删除 .env.local 中的 OneAPI Key
lark-sync.mjs: 飞书生成记录同步边界，真实结果尺寸、通用及独立扩图模型/Agent真源与实时Schema 409准入全部字段类型/附件ID/单选值，含AI扩图/氛围转换/美化功能，投影房型/家具/设计/Agent/风格/模型/Prompt，完整工作流保留画布/模型/产物/费用或天气色调，参考/结果/风格图片分列上传；最终Prompt缺失时留空并用功能名作标题
image-artifact.mjs: 图片产物基础设施，依赖 sharp 统一生成结果 data URL 解码、受限远程下载、输出扩展名、不修改原件的模型请求 JPEG 降质/缩放压缩与任务快照用轻量 WebP 预览
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
benchmark-jobs.mjs: Benchmark 后台任务注册表，为长耗时批量生成与 AI 评分公开阶段、Base 落库状态、起止时间、进度、主动取消、结果和可诊断失败消息；只读 hasActiveJobs 同时保护 running/cancelling，容量清理不得移除未结算取消任务
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: 统一 Prompt 资产边界，维护 `AI 生图` Base 内白模与空房智能默认/平台融合、风格反推配置，以 Agent 编码稳定路由并支持可选展示名，用五分钟进程缓存输出脱敏已上架版本目录、单 Agent 可用性与默认最高/指定版本读取
refined-model-prompt.mjs: 同构版本化 Prompt 读取边界，为精模、效果图氛围转换、效果图美化与全景图美化独立飞书表解析脱敏目录并按版本仅在服务端提供正文
refined-model-workflow.mjs: 精模渲染应用服务，以单张带材质模型图、可选用户要求前置且飞书预设 Prompt 后置的顺序编排双 Provider 出图、批次元数据与原始/最终 Prompt 独立归档
white-model-workflow.mjs: 设计模型渲染应用服务，白模和空房均按智能默认/平台融合稳定编码选 Agent，空房在 Agent 前校验房间类型、详情与最终家具清单并仅将非空已选需求注入两种 Prompt，仅智能默认允许主图加单张风格参考，平台融合只接收主图与 Style DNA 并拒绝混合风格来源；按含功能/房间类型/详情/家具选择/Prompt/风格图的完整指纹复用提示词，最终模型仍只接收主图并统一编排双 Provider 出图与归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，向浏览器公开脱敏已上架 Prompt 版本目录与附件策略，仅在服务端精确读取所选正文，首轮接收无业务数量上限的 PNG/JPEG/WebP/GIF/PDF 并支持仅附件触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-attachment.mjs: Style DNA 多模态附件安全边界，在通用图片校验之上增加 PDF 文件签名、MIME、真实字节、单文件/合计容量与可选数量校验，并输出 Responses 图片/文件附件
reference-image.mjs: 参考图安全边界，保留生成链路默认最多 4 张并允许调用方配置格式、容量及可选数量上限，统一校验 MIME/真实字节并附加可信图片宽高
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询；只读 hasActiveJobs 在 pending 同步结束前阻断原地更新

generation-config.mjs: 生图与 Beta 共用的脱敏配置聚合器，统一 /api/styles 与 /api/config/refresh 的风格/Agent/精模/氛围转换/独立美化/独立全景真源及主动刷新，隔离各表正文
effect-beautification-prompt.mjs: 独立效果图美化固定 Prompt 真源，读取 effect-render-beautification 上架版本，严格校验 LOW/HIGH × NATURAL/WARM/COOL 六预设，默认 low/natural、拒绝未知值、逐字选择正向正文，公开脱敏目录且禁止跨表回退

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

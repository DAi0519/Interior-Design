# test/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护自动化测试成员清单
custom-select.test.mjs: macOS/浏览器下拉回归测试，验证主指针在 click 前固定目标选项焦点、辅助按键不抢焦点，并阻止内容宽度百分比导致的无效省略
local-settings.test.mjs: .env.local 未知项保留、OneAPI Key 原子写入/覆盖/删除、格式校验与持久化状态测试
lark-setup.test.mjs: CLI 配置 JSON、字段读取必需 Scope 与中文授权能力、共享 Base 状态、非阻塞 Device Flow、二维码与授权过期测试
model-config.test.mjs: 四个 OneAPI 模型与一个默认 9B FP8/7 steps ComfyUI 工作流统一可选、Provider/单图/原图比例约 1MP/4MP 的 1K-2K 契约、16 像素对齐、合法矩阵、Seedream 4.5 路由及请求白名单测试，不发送真实请求
generation-batch.test.mjs: 服务端批次标识、浏览器逐模型尺寸/质量适配与遗留工作流档位剥离、ComfyUI 分段耗时摘要、并发度二、保序和部分失败测试，不发送真实请求
model-multi-select.test.mjs: 同一出图模型入口至少一项、最多四项、取消与顺序纯规则测试
comfyui-client.test.mjs: 根目录 Flux 开发交付 JSON 同步、ComfyUI 健康检查、主动取消、默认 9B FP8/7 steps、1K/2K 推理与输出尺寸、正向 Prompt 原样注入/空输入、固定负向 Prompt、Base64 单图原子提交、网关 502 只读恢复与明确报错、节点错误详情透传、多实例输出 404 恢复、排队轮询、输出 data URL 归一化与参考图边界测试，不提交真实任务
image-dimensions.test.mjs: PNG/JPEG/WebP 图片头真实宽高与无效字节降级测试
image-ratio.test.mjs: 浏览器原图比例标签、缺图默认值与最近合法比例选择纯函数测试
generation-actions.test.mjs: 白模首次单按钮、提示词可复用双按钮、融合输入变化失效、自由生图隔离与忙碌文案纯状态测试
launcher.test.mjs: 跨平台一键启动器的 Node 版本、端口优先级、依赖摘要、本地 CLI PATH 和服务就绪有限轮询测试，不安装依赖、启动服务或打开浏览器
agent-model-config.test.mjs: 十个 Prompt Agent 候选 ID、Doubao Seed 2.0 Lite、图片输入能力与接口可用性回归测试，不发送真实 API 请求
lark-sync.test.mjs: 飞书“参考图”/“风格参考图”分列配置、原始/最终 Prompt、“生图模型”/“Prompt融合”、画幅适配与生成记录字段映射回归测试，不调用 CLI 或写入真实 Base
oneapi-client.test.mjs: OneAPI 主动取消、Prompt Agent 白模/风格参考双图顺序、Responses 单图分析/非 Claude 双图评审、Claude Chat Completions 评审、请求侧压缩、图生图、Style DNA 多轮附件、费用归一化与错误脱敏测试
lark-cli.test.mjs: 项目内固定版 CLI 路径优先、最低版本校验与旧全局 CLI 阻断测试，不调用真实飞书 API
image-artifact.test.mjs: 生成图片扩展名、data URL 解码、空响应与下载体积上限测试
image-download.test.mjs: 生成结果下载文件名、MIME、字节透传、附件响应头与非法输入测试，不访问网络
benchmark-base.test.mjs: Benchmark 五表环境配置、全部普通回填的实时字段存在性/可写类型/单选选项阻断、稳定编码配置映射、系统字段隔离、样本录入、三类实验筛选、快照、Prompt/Run/三维评分/费用/横评关联与附件测试，不读写真实 Base
benchmark-runner.test.mjs: 横评计划规模、提示/出图阶段 Prompt 共享边界与飞书实验类型映射、Case/配置筛选、Provider 路由、主动取消、费用传递、逐 Run 真源进度、失败重试、横评同步与计划阶段零调用的内存集成测试
benchmark-experiment-config.test.mjs: 八类质量配置单变量草稿冻结、阶段推导、稳定配置 ID、双 Provider 智能分辨率与合法参数测试
benchmark-experiment-ui.test.mjs: 实验 ID、智能分辨率、八类因子互斥切换、因子上置、选择器与计数同组、重复候选标题隐藏、收窄固定参数与紧凑候选项测试
benchmark-job-ui.test.mjs: 运行中出图停止准入、停止任务真实进度/继续生成、部分失败任务的完整进度/失败数文案、出图重试准入、评分失败卡剩余数及同实验冻结参数恢复纯函数测试
benchmark-review.test.mjs: seven_evaluate_v3.1 单次 AI 评分、1–5 小数分、三维证据隔离、完整 JSON 提取/严格契约、单次契约修复/原文留存、正式评分 Run 断点筛选、输入准入、问题严重度封顶、40%/30%/30% 加权准入、飞书可读评分细则、旧协议分析隔离、可用图漏斗、模型分类分析与 P95 测试
benchmark-review-ui.test.mjs: AI 评分前端当前样本集成功结果筛选、GPT 默认评分模型、部分完成剩余数/继续动作、每 Run 最新 v3.1 评分选择、旧协议计数、三维/加权摘要及评分任务保持在评分面板的纯函数测试
benchmark-sample-ui.test.mjs: 分次文件累加去重、草稿初始化、已有空间分类保护、未分类采纳 AI 类别、五维字段边界、状态文案、上传交互优先级和单层输入焦点反馈测试
benchmark-labeling.test.mjs: 单图 AI 样本空间与五维标签 JSON 契约、人工准入隔离、独立低中高约束与可注入视觉模型调用测试，不发送真实 API 请求
benchmark-workbench-store.test.mjs: 当前 worktree 本地样本集、实验、分类元数据和评分版本原子写入及稳定 ID 更新测试
benchmark-workbench.test.mjs: Benchmark 样本集迁移/CRUD、空间与五维 Gemini 3.5 Flash 待审标注、人工准入、用户指定可用视觉模型、自动 Case ID、实验计划生成零 Base 写入、正式运行冻结配置失败持久化/停止调用、Base 成功结果实验目录、v3.1 评分写回/按 Run 断点继续/旧协议脱敏逐图评分投影、空评分批次阻断、评分传输失败批次落库、当前集/实验 ID 分析隔离与历史 Run 协议漂移拦截测试
benchmark-jobs.test.mjs: Benchmark 后台任务即时入队、主动取消、阶段、Base 落库状态、进度、成功结果与可诊断失败消息测试
style-dna-reverse.test.mjs: Style DNA 反推脱敏版本目录、所选版本传递、Prompt 正文隔离、客户端覆盖防护、公开附件策略、多轮图片/PDF 与固定 JSON Schema 测试
prompt-agent.test.mjs: 可选 Agent 名称字段、无名称字段时的白模与风格反推展示名派生、行解析、脱敏已上架版本目录、默认最高/指定发布版本、System Prompt 与分页边界测试
refined-model-prompt.test.mjs: 精模固定 Prompt 飞书行解析、草稿测试、发布优先、指定版本、正文脱敏与分页字段边界测试
refined-model-workflow.test.mjs: 精模用户要求前置与预设 Prompt 后置、空输入兼容、长度边界、单图、原图比例、批次元数据、脱敏响应与同步调度内存集成测试
reference-image.test.mjs: 默认及调用方自定义的参考图数量、格式、容量、Base64、MIME、真实字节数与可信宽高策略回归测试
reference-attachment.test.mjs: Style DNA 图片/PDF 附件分流、无数量上限、PDF 文件签名、MIME、真实字节与容量策略回归测试
style-library.test.mjs: 飞书风格行、Style DNA 合法性、版本化唯一编码、历史版本选择、上下架状态、分页边界和前端脱敏回归测试
white-model-workflow.test.mjs: 白模智能默认/固定风格双路由、白模+风格参考双图合同、最终出图单图隔离、风格图缓存失效、版本化 Style DNA、独立 Provider、比例及非阻塞归档测试
white-model-render-mode.test.mjs: 白模前端风格选择单元测试，覆盖智能默认、平台风格扩展/版本去重和失效选择回退
runtime-cache.test.mjs: 异步 TTL 缓存命中、并发去重、过期、主动刷新和失败清理测试
sync-jobs.test.mjs: generationId 幂等入队、非阻塞执行与飞书同步状态测试

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

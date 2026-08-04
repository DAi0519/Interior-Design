# test/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护自动化测试成员清单
custom-select.test.mjs: macOS/浏览器下拉回归测试，验证主指针在 click 前固定目标选项焦点、辅助按键不抢焦点，并阻止内容宽度百分比导致的无效省略
local-settings.test.mjs: .env.local 未知项保留、OneAPI Key 原子写入/覆盖/删除、格式校验与持久化状态测试
lark-setup.test.mjs: CLI 配置 JSON、用户 Scope、共享 Base 状态、非阻塞 Device Flow、二维码与授权过期测试
lark-cli.test.mjs: 项目内固定版 CLI 路径优先、最低版本校验与旧全局 CLI 阻断测试，不调用真实飞书 API
model-config.test.mjs: 模型合法尺寸矩阵、四模型及自由生图首张参考图最近比例、GPT 中等质量默认值与请求白名单回归测试，不发送真实 API 请求
image-dimensions.test.mjs: PNG/JPEG/WebP 图片头真实宽高与无效字节降级测试
image-ratio.test.mjs: 浏览器原图比例标签、缺图默认值与最近合法比例选择纯函数测试
agent-model-config.test.mjs: 九个 Prompt Agent 候选 ID、最新 Doubao、图片输入能力与接口可用性回归测试，不发送真实 API 请求
lark-sync.test.mjs: 飞书原始/最终 Prompt、出图模型/融合基模、画幅适配模式与生成记录字段映射回归测试，不调用 CLI 或写入真实 Base
image-artifact.test.mjs: 生成图片扩展名、data URL 解码、空响应与下载体积上限测试
benchmark-base.test.mjs: Benchmark 五表环境配置、稳定编码到实时单选项的冻结配置映射、未建模质量档前置阻断、阶段化错误上下文、空间与五维标签/人工准入样本录入、样本集批量重命名、横评对比/运行明细/结果报告三类实验筛选链接、快照解析、分页保护、Prompt/Run/横评关联写入与附件上传测试，不读写真实 Base
benchmark-runner.test.mjs: 横评计划规模、Case/配置筛选、停用模型、冻结 Prompt、逐 Run 真源、失败重试、横评同步与预演零调用的内存集成测试
benchmark-experiment-config.test.mjs: 实验草稿共享参数冻结、稳定配置 ID、稳定编码一致性、输出规格解析与跨模型合法参数交集测试
benchmark-experiment-ui.test.mjs: 系统实验 ID 的秒级时间戳/随机后缀/唯一性，以及稳定分区网格、双栏模型卡和响应式降列测试
benchmark-review.test.mjs: 飞书同构 AI 评分 JSON 契约、三维准入、旧协议分析隔离、问题标签、可用图漏斗、模型分类分析与 P95 纯函数测试
benchmark-review-ui.test.mjs: AI 评分前端当前样本集成功结果筛选、每 Run 最新正式评分选择、旧协议计数、摘要指标及评分任务保持在评分面板的纯函数测试
benchmark-labeling.test.mjs: 单图 AI 样本空间与五维标签 JSON 契约、人工准入隔离、独立低中高约束与可注入视觉模型调用测试，不发送真实 API 请求
benchmark-workbench-store.test.mjs: 当前 worktree 本地样本集、实验、分类元数据和评分版本原子写入及稳定 ID 更新测试
benchmark-workbench.test.mjs: Benchmark 样本集迁移/CRUD、空间与五维 Gemini 3.5 Flash 待审标注、人工准入、用户指定可用视觉模型、自动 Case ID、实验草稿零 Base 写入预演、正式运行冻结配置失败持久化/停止调用、Base 成功结果实验目录、正式/旧协议脱敏逐图评分投影、空评分批次阻断、当前集/实验 ID 分析隔离与历史 Run 协议漂移拦截测试
benchmark-jobs.test.mjs: Benchmark 后台任务即时入队、阶段、Base 落库状态、进度、成功结果与可诊断失败消息测试
oneapi-client.test.mjs: OneAPI Responses 单图分析、双图 AI 评审、图生图质量参数、Style DNA 多轮图片/PDF 与纯文字续改请求、input_image/input_file 分流、响应归一化、Prompt 文本与错误脱敏测试
style-dna-reverse.test.mjs: Style DNA 反推脱敏版本目录、所选版本传递、Prompt 正文隔离、客户端覆盖防护、公开附件策略、多轮图片/PDF 与固定 JSON Schema 测试
prompt-agent.test.mjs: 无 Agent 名称字段时的白模与风格反推展示名派生、行解析、脱敏已上架版本目录、默认最高/指定发布版本、System Prompt 与分页边界测试
reference-image.test.mjs: 默认及调用方自定义的参考图数量、格式、容量、Base64、MIME、真实字节数与可信宽高策略回归测试
reference-attachment.test.mjs: Style DNA 图片/PDF 附件分流、无数量上限、PDF 文件签名、MIME、真实字节与容量策略回归测试
style-library.test.mjs: 飞书风格行、Style DNA 合法性、版本化唯一编码、历史版本选择、上下架状态、分页边界和前端脱敏回归测试
white-model-workflow.test.mjs: 版本化 Style DNA 编码、指定场景融合 Agent 版本、融合基模名称、最近合法比例/手动覆盖、GPT 默认质量、出图和非阻塞归档调度的内存集成测试
runtime-cache.test.mjs: 异步 TTL 缓存命中、并发去重、过期、主动刷新和失败清理测试
sync-jobs.test.mjs: generationId 幂等入队、非阻塞执行与飞书同步状态测试

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

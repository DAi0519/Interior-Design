# Canvas Lab - 公司图像模型的本地运营与测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript + sharp 0.35.3 + lark-cli 1.0.77

<directory>
public/ - 浏览器工作台界面（40 个业务文件及 icons/ 图标资产模块：运营连接中心、精模/白模/自由生图、白模智能默认/平台风格紧凑选择、最多四模型批量与结果画廊、Benchmark 五步流程、Style DNA 对话、自定义下拉与 Light Command Center 样式）
src/ - 本机设置、飞书 Setup、图片尺寸/产物/下载、模型与 Agent 配置、OneAPI、Flux2 Klein ComfyUI、精模固定 Prompt/批次契约、Style DNA/白模编排及 Benchmark 运行层（36 个模块）
test/ - Node 原生测试（40 个测试文件，覆盖连接与飞书、双 Provider、精模固定 Prompt、白模渲染方式、多模型批次、图片下载、模型/附件/工作流与 Benchmark 全链路）
scripts/ - 源码发布工具（白名单规则、发布准入、确定性打包、干净安装/启动冒烟、GitHub Release 上传校验及规则测试）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 固定 Node 版本、sharp 请求图片压缩、lark-cli 依赖审批，以及启动、飞书初始化、测试和源码发布脚本
package-lock.json - 固定运营安装依赖树与 lark-cli 平台安装版本
launcher.mjs - Windows/macOS 共享一键启动器，校验 Node 与端口、按 lock 摘要安装依赖、引导飞书 CLI 初始化、向服务注入项目内 CLI 路径并打开浏览器
server.mjs - 本地 HTTP 服务、可选持久化密钥会话、飞书 Setup、生成结果下载、双 Provider 单模型/多模型生成、精模/白模/Style DNA 与 Benchmark API 路由入口
start-macos.command - macOS Finder 双击入口，检查 Node 24 后委托 launcher.mjs
start-windows.cmd - Windows Explorer 双击入口，检查 Node 24 后委托 launcher.mjs
benchmark-runner.mjs - 独立单变量横评命令行入口，默认只读汇总多候选 Agent/Style/融合模型且仅在显式 --execute 后调用模型并写回 Base
benchmark-backfill.mjs - 历史横评数据迁移入口，不调用模型，将宽表附件补齐为一图一行的模型结果真源
.codex/environments/environment.toml - Codex 通过 npm start 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可复制为 .env.local 的 OneAPI、ComfyUI 地址与飞书资源配置模板
README.md - Windows/macOS 运营首次运行、连接中心、安全边界与模型参数说明
RELEASE.md - 维护者版本更新、发布准入、白名单 ZIP、SHA-256、manifest 与 GitHub Release 操作协议
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
design-qa.md - 工作台视觉验收历史，记录 Benchmark 样本集、任务失败、评分与实验配置演进；最新样本区已完成左管理/右列表、管理表头同高同底色、双路径分类与人工保护的真实浏览器对比验收
WHITE_MODEL_BENCHMARK.md - 白模渲染 Benchmark 方法与执行规范，统一实验隔离、数据分层、结构化评分、统计决策与落地流程
.gitignore - 密钥、依赖、发布物、生成物、缓存和私有文档忽略规则
</config>

架构法则：运营依赖由 npm 固定安装，服务优先使用项目内固定版 lark-cli 并在执行前阻断旧版本；飞书登录凭据只由 lark-cli 管理，连接中心检测字段读取、记录读写与附件上传最小 Scope 并以中文能力名引导增量授权；OneAPI Key 默认仅在内存，API Key、ComfyUI 地址/工作流正文、完整 Style DNA 与 Prompt 正文只存在服务端；生图与 Benchmark 复用同一模型真源、自定义下拉和指针焦点时序，但业务链路隔离。

生图法则：精模、白模与自由生图默认 Seedream，白模前端以可扩展紧凑风格选择显式区分独立智能默认 Agent 与已上架 Style DNA + 融合 Agent，智能默认开放 Agent 基模选择，固定风格额外开放融合版本；两路只在 Prompt 阶段分流并复用统一出图，统一出图模型入口允许 1–4 项且每模型各生成一张，公共参数逐模型收敛到合法规格，结果保序并允许部分失败；精模固定 Prompt、智能默认 Prompt 和白模融合 Prompt 正文仅在服务端，白模最终提示词按完整路由输入指纹缓存；每张图片独立返回状态并异步归档 Provider、共同批次、Prompt 版本与工作流元数据。

Benchmark 法则：浏览器评测以样本集、可编辑实验计划、执行、评分和分析为边界，Case ID 与配置 ID 稳定生成；已有空间分类是人工事实，AI 只补五维且不得覆盖，只有未分类批次显式选择后才采纳 AI 空间类型；Style DNA、Prompt 版本、融合基模、出图模型、比例、分辨率、格式和质量档均可成为唯一实验因子，提示阶段因子逐候选冻结 Prompt，出图阶段因子共享 Prompt，采样量不参与质量归因，正式确认后才写入 Base；Prompt 融合固定走 OneAPI，最终出图按模型 Provider 路由 OneAPI/ComfyUI；边缘输入不触发生图，样本准入由人工控制；评分按 `seven_evaluate_v3.1` 在一次请求中完成白模准入和三维评分，评分页默认使用 GPT，Claude 遵循规则源走 Chat Completions，其他评分模型走 Responses，一致性比较两图、风格材质以生成图为主体、渲染质量只看生成图自身，发送前仅把超过限制的请求副本压缩到 4.9MB Base64 内且不改 Base 原件，评分响应保留 4096 输出 token 并允许从附带说明中提取完整 JSON；三项保留 1–5 数值分且允许小数，在本地按问题严重度封顶、按 40%/30%/30% 计算加权分，`>=3.0` 为可用；逐维证据/评价/扣分原因、结构化问题与本地校准同时投影为 Base 可读“评分细则”，运行明细视图不得隐藏评分字段；OneAPI Prompt 与出图费用从 `usage.price` 保留原币并归一 USD，ComfyUI/Flux 不推算；Base 是配置、Prompt、逐 Run 结果、评分、费用与附件的业务真源，所有普通回填必须先按实时 Schema 校验字段存在性、可写类型和单选值，图片/输出参数因子写“模型横评”，提示阶段因子写“Prompt 横评”，系统字段与附件字段不得走普通回填；实验配置按横评组、样本按数据集版本、运行明细与报告按实验 ID 使用原生分组视图，失败重试新增 Run 并支持断点续跑。

任务法则：Benchmark 批量出图允许主动停止；取消信号贯穿任务注册表、Runner 与 Provider 请求，任务进度由 Base 已存在的唯一 Run 槽位重建，已写入的 Prompt/Run/结果保留并可通过“继续生成”沿原实验断点续跑。

发布法则：对外发布先创建 GitHub 草稿 Release 并校验提交及全部制品摘要，转正式后才清理本地制品；已存在 Release 或远端 Tag 的版本禁止覆盖。

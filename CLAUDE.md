# Canvas Lab - 公司图像模型的本地运营与测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS Transitions + JavaScript + Inter Variable 5.3.0 + sharp 0.35.3 + lark-cli 1.0.77

<directory>
.impeccable/ - Impeccable 项目级设计工作流配置（1 个子目录：live）
public/ - 浏览器工作台界面（62 个业务与字体授权文件及 icons/ 图标资产模块：运营连接中心、含可复用飞书样本库、默认 Flux、本机配置恢复、时间追溯 Run ID 与飞书回读结果预览的五功能 Beta跑图、效果图美化当前上架 Prompt 版本及天气/时段选项、精模/白模/空房设计/自由生图、Flux 默认/自定义负向 Prompt、按功能及跨页恢复的后台生成任务、无图标 Smiley Sans 展示字体主动作、空房必填房间类型、设计主图与风格参考双上传及单图拖入替换、智能默认/平台风格选择、单模型 1–4 张向上展开下拉或最多四模型批量与结果画廊、Benchmark 五步流程、Style DNA 对话、自定义下拉、静态首帧加 140ms 导航前双层 transform 的三工作台切换、共享 `#f37021` 标志性盒橙功能色与 Raycast 向近白银灰 Light Command Center 样式）
src/ - 本机设置、飞书 Setup、图片尺寸/产物/下载、模型与 Agent 配置、OneAPI、Flux2 Klein ComfyUI、日常生图后台任务/应用服务、Beta跑图独立新 Base/批量任务、效果图美化飞书 Prompt 模块/工作流、精模固定 Prompt/批次契约、空房房间类型真源、Style DNA/白模/空房设计编排及 Benchmark 运行层（45 个模块）
test/ - Node 原生测试（56 个测试文件，覆盖共享重点色、三工作台导航、Beta跑图独立 Base/样本集/默认 Flux/配置恢复/时间追溯 Run ID/任务/UI、功能/模型选择按钮与生成张数下拉、连接与飞书、双 Provider、可恢复生成任务、Flux 默认/自定义负向 Prompt、效果图美化正向 Prompt 拼接、精模固定 Prompt、空房必填房间类型、白模渲染方式、多模型批次、图片下载、模型/附件/工作流与 Benchmark 全链路）
scripts/ - 源码发布工具（白名单规则、发布准入、确定性打包、干净安装/启动冒烟、GitHub Release 上传校验及规则测试）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 固定 Node 版本、Inter Variable 字体、sharp 请求图片压缩、lark-cli 依赖审批，以及启动、飞书初始化、测试和源码发布脚本
package-lock.json - 固定运营安装依赖树与 lark-cli 平台安装版本
launcher.mjs - Windows/macOS 共享一键启动器，校验 Node 与端口、按 lock 摘要安装依赖、引导飞书 CLI 初始化、向服务注入项目内 CLI 路径并打开浏览器
server.mjs - 本地 HTTP 服务、固定版本 Inter Variable 浏览器资产、可选持久化密钥会话、飞书 Setup、生成结果下载、双 Provider 单模型多张/多模型生成、精模/白模/Style DNA、Beta跑图独立新 Base 与 Benchmark API 路由入口
start-macos.command - macOS Finder 双击入口，检查 Node 24 后委托 launcher.mjs
start-windows.cmd - Windows Explorer 双击入口，检查 Node 24 后委托 launcher.mjs
benchmark-runner.mjs - 独立单变量横评命令行入口，默认只读汇总多候选 Agent/Style/融合模型且仅在显式 --execute 后调用模型并写回 Base
benchmark-backfill.mjs - 历史横评数据迁移入口，不调用模型，将宽表附件补齐为一图一行的模型结果真源
.codex/environments/environment.toml - Codex 通过 npm start 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可复制为 .env.local 的 OneAPI、ComfyUI 地址与飞书资源配置模板
README.md - Windows/macOS 运营首次运行、连接中心、安全边界与模型参数说明
RELEASE.md - 维护者版本更新、发布准入、白名单 ZIP、SHA-256、manifest 与 GitHub Release 操作协议
PRODUCT.md - Canvas Lab 内部能力工厂的用户、目的、定位、运行环境、能力约束与产品原则真源
DESIGN.md - Raycast 向近白银灰 Light Command Center 在高频生图工作台中的视觉、导航前双层 transform 切换与交互契约
design-qa.md - 工作台视觉验收历史，记录 Raycast 向银灰视觉收敛、Benchmark 样本集、任务失败、评分与实验配置演进及真实浏览器对比证据
WHITE_MODEL_BENCHMARK.md - 白模渲染 Benchmark 方法与执行规范，统一实验隔离、数据分层、结构化评分、统计决策与落地流程
.gitignore - 密钥、依赖、发布物、生成物、缓存和私有文档忽略规则
</config>

ComfyUI产物法则：每次提交必须使用请求级唯一产物前缀，并在下载前校验 History 文件名属于本次产物键；多实例错误路由只能得到 404 后安全重试，禁止接受同名旧图；返回元数据必须保留产物文件名与 SHA-256 指纹用于追溯。

Beta结果可见性法则：飞书“跑图明细”仍是结果业务真源；右侧面板只展示在飞书回读到成功状态、结果附件 token 与一致字节数之后生成的轻量 WebP 预览，每张预览必须链接到对应明细记录，禁止把模型原始结果副本保存在浏览器任务状态中。

架构法则：运营依赖由 npm 固定安装，服务优先使用项目内固定版 lark-cli 并在执行前阻断旧版本；飞书登录凭据只由 lark-cli 管理，连接中心检测字段读取、记录读写与附件上传最小 Scope，并按生成记录实时 Schema 准入全部可写字段类型、附件字段 ID 与功能/最终出图模型/Prompt融合等单选值；任何后端模型目录、接口枚举、请求字段或工作流路由的新增、删除、重命名，都必须在同一变更中完成浏览器公开目录/交互映射、飞书实时 Schema/单选选项、同步字段投影和自动化合同测试四方核验，并在新进程上通过页面实机检查与 Base 字段读回，缺任一项即阻断付费生成和发布；效果图美化界面必须回显当前实际生效的已上架 Prompt 名称与版本，但不得下发正文；OneAPI Key 默认仅在内存，API Key、ComfyUI 地址/工作流正文、完整 Style DNA 与 Prompt 正文只存在服务端；生图、Beta跑图与 Benchmark 复用同一模型和 Prompt 真源，但三套业务链路隔离；Beta跑图必须跳过旧生成记录同步并只写独立新 Base，禁止故障时回退双写旧表。

Beta跑图法则：作为与生图工作台、模型评测并列的独立第三工作台，仅覆盖白模、空房、精模、效果图美化与自由生图，不承载 Style DNA 反推或 AI 评分；页面左侧配置样本集与生成设置，右侧分别监控模型生成和飞书同步进度，并只展示飞书附件回读确认后的轻量结果预览；默认从独立 `批量跑图 Benchmark` 的“样本集→样本”选择可复用资产，仅在新建样本集时上传一次；样本集与样本保持一对多数据关系，运营在“样本明细”中按样本集原生分组展开，避免把集合元数据复制到每条样本；按样本×模型展开结果且不设数量上限，以两路并发复用正式 generation-service 持续排队，浏览器对共享图片资产去重传输，服务端逐结果恢复完整输入并先建档、后生成、再上传结果；整批队列总量不得传入正式生成服务的单次 `batchCount`，每个 Run 必须按一张结果独立调用，独立“测试时间”以本地启动时间写入同批全部 Run 并作为人工分组键，最新测试置顶；技术 Run ID 保留批内序号和模型键，重试继续追加 Attempt，但不承担人工定位；模型返回只递增生成进度，只有回读到“成功”状态、结果附件 token 与一致字节数才递增同步进度、公开预览并计入完成；参数、权限与合同类错误保留原始原因并立即失败，含 ComfyUI 已出图但产物暂时读取 404 在内的瞬时故障最多自动执行三次 Attempt，任一结果仍未归档则整批不得假完成；状态、输入/风格/结果附件、冻结配置、Prompt/工作流版本、费用、时延与错误只写“跑图明细”，该表的工作台入口固定打开按测试时间降序分组的明细视图，现有 Benchmark 页面、API 与五表不做业务改造。

生图法则：精模、白模、空房设计与自由生图默认 Flux2 Klein，自由生图正向提示词初始为空且不展示预置文案；精模允许把可选用户要求放在服务端飞书预设 Prompt 前面，并分别归档原始/最终 Prompt；白模与空房前端显式区分智能默认和已上架 Style DNA，两者复用最终单主图出图与批次归档链路，但分别按 `white-model-smart-default`/`white-model-fusion` 与 `empty-room-smart-default`/`empty-room-fusion` 路由；空房必须由客户从十个受控值中显式选择房间类型且不设默认，选择“其他”时还必须填写不超过 40 字的具体空间类型；服务端在 Agent 调用前校验并把 `room_type`/`room_type_detail` 同时纳入两种模式的 Prompt、缓存指纹、响应和生成记录“空间类型”/“其他空间类型”，图片、Style DNA 或补充要求不得改判；风格参考图只可进入智能默认 Agent，空房上传后必须自动切回智能默认并禁选平台风格，平台融合只接收主图、Style DNA 与用户要求；缓存指纹包含功能且不得串用；统一出图入口只暴露可运行的四个 OneAPI 模型与 Flux2 Klein，Seedream 5.0 Pro 使用独立 `doubao-seedream-5.0-pro` 路由和 1K/2K 像素合同，不冒充或覆盖普通 5.0；所有生图功能消费同一模型合法尺寸矩阵，四个 OneAPI 模型均包含 2:1，Flux 按源图动态支持 2:1 并确保 16 像素对齐后不超档位面积，日常生图固定输出 PNG 且不提供格式选择，单模型允许选择生成 1–4 张，多模型允许 1–4 项且每模型各生成一张，Flux 保持原图比例并按约 1MP/4MP 总像素独立开放真实推理/输出 1K、2K 档，选中 Flux 时显示可选负向 Prompt：空值继续使用服务端默认，非空值整段覆盖且不传给 OneAPI 模型；Prompt 正文仅在服务端；每张图片独立返回状态，生成记录把白模/空房/精模输入归档到“参考图”、把风格输入归档到“风格参考图”，并异步保留 Provider、批次、Prompt 版本与工作流元数据。

Benchmark 法则：浏览器评测以样本集、可编辑实验计划、执行、评分和分析为边界，Case ID 与配置 ID 稳定生成；已有空间分类是人工事实，AI 只补五维且不得覆盖，只有未分类批次显式选择后才采纳 AI 空间类型；Style DNA、Prompt 版本、融合基模、出图模型、比例、分辨率、格式和质量档均可成为唯一实验因子，提示阶段因子逐候选冻结 Prompt，出图阶段因子共享 Prompt，采样量不参与质量归因，正式确认后才写入 Base；Prompt 融合固定走 OneAPI，最终出图按模型 Provider 路由 OneAPI/ComfyUI；边缘输入不触发生图，样本准入由人工控制；评分按 `seven_evaluate_v3.1` 在一次请求中完成白模准入和三维评分，评分页默认使用 GPT，Claude 遵循规则源走 Chat Completions，其他评分模型走 Responses，一致性比较两图、风格材质以生成图为主体、渲染质量只看生成图自身，发送前仅把超过限制的请求副本压缩到 4.9MB Base64 内且不改 Base 原件，评分响应保留 4096 输出 token 并允许从附带说明中提取完整 JSON；三项保留 1–5 数值分且允许小数，在本地按问题严重度封顶、按 40%/30%/30% 计算加权分，`>=3.0` 为可用；逐维证据/评价/扣分原因、结构化问题与本地校准同时投影为 Base 可读“评分细则”，运行明细视图不得隐藏评分字段；OneAPI Prompt 与出图费用从 `usage.price` 保留原币并归一 USD，ComfyUI/Flux 不推算；Base 是配置、Prompt、逐 Run 结果、评分、费用与附件的业务真源，所有普通回填必须先按实时 Schema 校验字段存在性、可写类型和单选值，图片/输出参数因子写“模型横评”，提示阶段因子写“Prompt 横评”，系统字段与附件字段不得走普通回填；实验配置按横评组、样本按数据集版本、运行明细与报告按实验 ID 使用原生分组视图，失败重试新增 Run 并支持断点续跑。

任务法则：Benchmark 批量出图允许主动停止；取消信号贯穿任务注册表、Runner 与 Provider 请求，任务进度由 Base 已存在的唯一 Run 槽位重建，已写入的 Prompt/Run/结果保留并可通过“继续生成”沿原实验断点续跑。

归档法则：生成记录的“尺寸”必须从结果图真实字节读取，禁止用请求尺寸冒充实际产物。

发布法则：对外发布先创建 GitHub 草稿 Release 并校验提交及全部制品摘要，转正式后才清理本地制品；已存在 Release 或远端 Tag 的版本禁止覆盖。

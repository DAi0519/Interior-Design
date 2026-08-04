# Canvas Lab - 公司图像模型的本地运营与测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript + lark-cli 1.0.77

<directory>
public/ - 浏览器工作台界面（30 个业务文件及 icons/ 图标资产模块：运营连接中心、双 Provider 生成与能力解释、样本集优先的独立 Benchmark 五步流程、实验配置/运行/评分/分析、Style DNA 对话、自定义下拉与 Light Command Center 样式）
src/ - 本机设置、飞书 Setup、图片尺寸/产物、模型与 Agent 配置、OneAPI、Flux2 Klein ComfyUI 工作流/客户端、Style DNA/白模编排、Benchmark Base Schema/实验冻结/AI 标注/AI 评分/本地状态及后台任务层（30 个模块）
test/ - Node 原生测试（33 个测试文件，覆盖一键启动、连接与飞书、双 Provider 生成、模型/附件/工作流、Benchmark 样本/实验/运行/评分/分析及浏览器交互）
scripts/ - 源码发布工具（白名单规则、发布准入、确定性打包、干净安装/启动冒烟、GitHub Release 上传校验及规则测试）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 固定 Node 版本、lark-cli 依赖审批，以及启动、飞书初始化、测试和源码发布脚本
package-lock.json - 固定运营安装依赖树与 lark-cli 平台安装版本
launcher.mjs - Windows/macOS 共享一键启动器，校验 Node 与端口、按 lock 摘要安装依赖、引导飞书 CLI 初始化、向服务注入项目内 CLI 路径并打开浏览器
server.mjs - 本地 HTTP 服务、可选持久化密钥会话、飞书 Setup、双 Provider 生成、Style DNA/白模与 Benchmark 样本标注/实验运行/AI 评分 API 路由入口
start-macos.command - macOS Finder 双击入口，检查 Node 24 后委托 launcher.mjs
start-windows.cmd - Windows Explorer 双击入口，检查 Node 24 后委托 launcher.mjs
benchmark-runner.mjs - 独立模型横评命令行入口，默认只读预演且仅在显式 --execute 后调用模型并写回 Base
benchmark-backfill.mjs - 历史横评数据迁移入口，不调用模型，将宽表附件补齐为一图一行的模型结果真源
.codex/environments/environment.toml - Codex 通过 npm start 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可复制为 .env.local 的 OneAPI、ComfyUI 地址与飞书资源配置模板
README.md - Windows/macOS 运营首次运行、连接中心、安全边界与模型参数说明
RELEASE.md - 维护者版本更新、发布准入、白名单 ZIP、SHA-256、manifest 与 GitHub Release 操作协议
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
design-qa.md - 工作台视觉验收历史，记录 Benchmark 样本集、同步动作归组、分阶段任务失败、已完成实验直接评分与实验配置稳定网格；最新实验配置已完成元信息/参数/候选模型对齐、零横向溢出和真实浏览器对比验收
WHITE_MODEL_BENCHMARK.md - 白模渲染 Benchmark 方法与执行规范，统一实验隔离、数据分层、结构化评分、统计决策与落地流程
.gitignore - 密钥、依赖、发布物、生成物、缓存和私有文档忽略规则
</config>

架构法则：运营依赖由 npm 固定安装，服务优先使用项目内固定版 lark-cli 并在执行前阻断旧版本；飞书登录凭据只由 lark-cli 管理，连接中心检测字段读取、记录读写与附件上传最小 Scope 并以中文能力名引导增量授权；OneAPI Key 默认仅在内存，API Key、ComfyUI 地址/工作流正文、完整 Style DNA 与 Prompt 正文只存在服务端；生图与 Benchmark 复用同一模型真源、自定义下拉和指针焦点时序，但业务链路隔离。

生图法则：白模与自由生图默认 Seedream，最终目录包含五个 OneAPI 模型和一个 Flux2 Klein ComfyUI 工作流；OneAPI 按首张参考图匹配最近合法比例，ComfyUI 只接受一张参考图并保持原图尺寸；白模最终提示词按融合输入指纹缓存，首次成功后允许复用或显式重新融合；图片完成即返回并异步归档最终出图 Provider、工作流元数据、场景融合 Agent 与融合基模。

Benchmark 法则：浏览器评测以样本集、可编辑实验草稿、预演、执行、评分和分析为边界，Case ID 与配置 ID 稳定生成；实验只允许出图模型作为唯一变量，正式确认后才冻结并写入 Base；边缘输入不触发生图，AI 样本标注只负责空间及五个复杂度/质量维度，样本准入由人工控制；评分固定使用保持一致性、风格与材质、渲染质量三项原始分，历史协议与正式结果隔离；Base 是配置、Prompt、逐 Run 结果与附件的业务真源，本地只保存工作台状态，失败重试新增 Run 并支持断点续跑。

发布法则：对外发布先创建 GitHub 草稿 Release 并校验提交及全部制品摘要，转正式后才清理本地制品；已存在 Release 或远端 Tag 的版本禁止覆盖。

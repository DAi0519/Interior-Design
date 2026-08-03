# Canvas Lab - 公司图像模型的本地运营与测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript + lark-cli 1.0.77

<directory>
public/ - 浏览器工作台界面（19 个业务文件及 icons/ 图标资产模块：运营连接中心、生成动作状态、出图模型展示、飞书授权文案、图片比例适配、场景融合 Agent 版本、Style DNA 对话、自定义配置下拉、Light Command Center 样式与共享工具）
src/ - 本机设置、飞书 Setup、图片尺寸探测、出图参数、风格与 Agent 配置、OneAPI、Style DNA 反推、白模编排、运行时缓存及后台飞书同步层（16 个模块）
test/ - Node 原生测试（18 个测试文件，覆盖一键启动、本机设置、飞书 Setup、图片尺寸/比例、模型参数、生成动作、图片/PDF 附件、风格反推、飞书配置/同步、运行时缓存及白模工作流）
scripts/ - 源码发布工具（白名单规则、发布准入、确定性打包、干净安装/启动冒烟、GitHub Release 上传校验及规则测试）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 固定 Node 版本、lark-cli 依赖审批，以及启动、飞书初始化、测试和源码发布脚本
package-lock.json - 固定运营安装依赖树与 lark-cli 平台安装版本
launcher.mjs - Windows/macOS 共享一键启动器，校验 Node 与端口、按 lock 摘要安装依赖、引导飞书 CLI 初始化、向服务注入项目内 CLI 路径并打开浏览器
server.mjs - 本地 HTTP 服务、可选持久化密钥会话、飞书 Setup、脱敏 Agent 版本目录、配置主动刷新、白模最终提示词缓存、Style DNA 反推与生成 API 路由入口
start-macos.command - macOS Finder 双击入口，检查 Node 24 后委托 launcher.mjs
start-windows.cmd - Windows Explorer 双击入口，检查 Node 24 后委托 launcher.mjs
.codex/environments/environment.toml - Codex 通过 npm start 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可复制为 .env.local 的 OneAPI 与飞书资源配置模板
README.md - Windows/macOS 运营首次运行、连接中心、安全边界与模型参数说明
RELEASE.md - 维护者版本更新、发布准入、白名单 ZIP、SHA-256、manifest 与 GitHub Release 操作协议
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
design-qa.md - 当前 Style DNA 工作台的源图对照、双栏对齐、交互回归与视觉验收记录
.gitignore - 密钥、依赖、发布物、生成物、缓存和私有文档忽略规则
</config>

架构法则：运营依赖由 npm 固定安装，飞书登录凭据只由 lark-cli 管理，连接中心启动时自动检测字段读取、记录读写与附件上传最小 Scope，旧登录缺项时以中文能力名引导增量授权；OneAPI Key 默认只在内存且仅经用户显式选择写入 .env.local；源码发布只能来自版本一致的干净提交，并经运行文件白名单、测试、依赖审计、临时干净安装与启动冒烟后生成确定性 ZIP、SHA-256 和 manifest，GitHub 自动 Source ZIP 不作为运营发布物；API Key、完整已发布 Style DNA、白模融合 Prompt 与风格反推 Prompt 正文只存在服务端；两类 Prompt 由同一 `AI 生图` Base 内的独立数据表管理并复用五分钟配置缓存，Agent 编码作为稳定路由主键，白模场景融合 Agent 可用表内 `Agent 名称` 调整下拉展示名，场景融合 Agent 与风格反推均只向浏览器公开脱敏已上架版本目录，默认最高版本且允许精确选择历史上架版本，下架版本不进入浏览器目录，正文也不可读取或覆盖；白模最终提示词按白模、Style DNA 正文、补充要求、Agent 模型/版本与 System Prompt 指纹在服务端复用一小时，任一融合条件变化即自动重算；首次成功后生成区显示“再次渲染 / 重新融合”双按钮，分别复用最终提示词或显式忽略缓存，API Key 重连、配置刷新或服务重启即清空复用态；风格反推同时公开图片/PDF 附件能力，首轮要求附件且只有附件时由服务端补充最小触发消息，附件数量不设业务上限但受接口容量边界约束，生成草稿后允许基于对话纯文字修正；桌面工作区三种模式统一使用随视口变化的等高双栏，生成模式仅左栏内部滚动，窄屏回退为自然单栏；白模与自由生图初始出图模型默认 Seedream，四个固定最终出图模型统一可选且不暴露内部目录状态，真实生成请求负责最终裁决；Prompt Agent 仍以目录可见性与图片输入能力作为严格门槛；默认由服务端读取首张参考图真实宽高并匹配当前模型最近合法比例，用户显式改选后才使用手动画幅，分辨率始终独立选择；模型尺寸、图片与文件由后端白名单校验；反推只生成未发布草稿，白模工作流由应用服务编排，图片完成即返回且飞书异步归档，生成记录分别保存最终出图模型、场景融合 Agent 版本与白模融合基模。

发布法则：对外发布先创建 GitHub 草稿 Release 并校验提交及全部制品摘要，转正式后才清理本地制品；已存在 Release 或远端 Tag 的版本禁止覆盖。

# Canvas Lab - 公司图像模型的本地运营与测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript + lark-cli 1.0.77

<directory>
public/ - 浏览器工作台界面（14 个业务文件及 icons/ 图标资产模块：运营连接中心、生成控制、图片比例适配、Style DNA 对话、自定义配置下拉、Light Command Center 样式与共享工具）
src/ - 本机设置、飞书 Setup、图片尺寸探测、出图参数、风格与 Agent 配置、OneAPI、Style DNA 反推、白模编排、运行时缓存及后台飞书同步层（16 个模块）
test/ - Node 原生测试（16 个测试文件，覆盖本机设置、飞书 Setup、图片尺寸/比例、模型参数、图片/PDF 附件、风格反推、飞书配置/同步、运行时缓存及白模工作流）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 固定 Node 版本、lark-cli 依赖审批及启动、飞书初始化、测试脚本
package-lock.json - 固定运营安装依赖树与 lark-cli 平台安装版本
server.mjs - 本地 HTTP 服务、可选持久化密钥会话、飞书 Setup、配置主动刷新、Style DNA 反推与生成 API 路由入口
.codex/environments/environment.toml - Codex 通过 npm start 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可复制为 .env.local 的 OneAPI 与飞书资源配置模板
README.md - Windows/macOS 运营首次运行、连接中心、安全边界与模型参数说明
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
design-qa.md - 当前 Style DNA 工作台的源图对照、双栏对齐、交互回归与视觉验收记录
.gitignore - 密钥、依赖、发布物、生成物、缓存和私有文档忽略规则
</config>

架构法则：运营依赖由 npm 固定安装，飞书登录凭据只由 lark-cli 管理，OneAPI Key 默认只在内存且仅经用户显式选择写入 .env.local；API Key、完整已发布 Style DNA、白模融合 Prompt 与风格反推 Prompt 正文只存在服务端；两类 Prompt 由同一 `AI 生图` Base 内的独立数据表管理并复用五分钟缓存，Agent 展示名由稳定编码派生而不在表内重复维护，风格反推向浏览器公开脱敏已上架版本目录，默认最高版本且允许精确选择历史上架版本，但浏览器不可读取或覆盖正文；风格反推同时公开图片/PDF 附件能力，首轮要求附件且只有附件时由服务端补充最小触发消息，附件数量不设业务上限但受接口容量边界约束，生成草稿后允许基于对话纯文字修正；白模默认由服务端读取真实图片宽高并匹配当前模型最近合法比例，用户显式改选后才使用手动画幅，分辨率始终独立选择；模型尺寸、图片与文件由后端白名单校验；反推只生成未发布草稿，白模工作流由应用服务编排，图片完成即返回且飞书异步归档。

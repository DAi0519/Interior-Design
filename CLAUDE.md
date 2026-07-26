# Canvas Lab - 公司图像模型的本地测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript

<directory>
public/ - 浏览器工作台界面（11 个业务文件及 icons/ 图标资产模块：生成控制、Style DNA 对话、自定义配置下拉、Light Command Center 样式与共享工具）
src/ - 出图参数、风格与 Agent 配置、OneAPI、Style DNA 反推、白模编排、运行时缓存及后台飞书同步层（12 个模块）
test/ - Node 原生测试（11 个测试文件，覆盖模型、图片、风格反推、飞书配置/同步、运行时缓存及白模工作流）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 零依赖项目元数据与启动、测试脚本
server.mjs - 本地 HTTP 服务、内存密钥会话、配置主动刷新、Style DNA 反推与生成 API 路由入口
.codex/environments/environment.toml - Codex 通过 npm start 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可选的 ONEAPI_API_KEY 环境变量示例
README.md - 本地启动、安全边界与模型参数说明
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
design-qa.md - 当前 Style DNA 对话输入框改版的源图对照、交互回归与视觉验收记录
.gitignore - 密钥、生成物、缓存和私有文档忽略规则
</config>

架构法则：API Key、完整已发布 Style DNA 与白模融合 System Prompt 只存在服务端；风格反推默认 Prompt 由服务端单一真源公开给本地工作台并允许会话内编辑，首轮要求参考图且只有图片时由服务端补充最小触发消息，生成草稿后允许基于对话纯文字修正；模型尺寸和图片由后端白名单校验；反推只生成未发布草稿，白模工作流由应用服务编排，图片完成即返回且飞书异步归档。

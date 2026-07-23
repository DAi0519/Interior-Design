# Canvas Lab - 公司图像模型的本地测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript

<directory>
public/ - 浏览器工作台界面（8 个业务文件：index.html、styles.css、result.css、theme.css、custom-select.css、app.js、config-refresh.js、custom-select.js）
src/ - 出图参数、风格与 Agent 配置、OneAPI、白模编排、运行时缓存及后台飞书同步层（11 个模块：model-config.mjs、agent-model-config.mjs、oneapi-client.mjs、lark-cli.mjs、lark-sync.mjs、style-library.mjs、prompt-agent.mjs、white-model-workflow.mjs、reference-image.mjs、runtime-cache.mjs、sync-jobs.mjs）
test/ - Node 原生测试（10 个测试文件，覆盖模型、图片、飞书配置/同步、运行时缓存及白模工作流）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 零依赖项目元数据与启动、测试脚本
server.mjs - 本地 HTTP 服务、内存密钥会话、配置主动刷新与 API 路由入口
.codex/environments/environment.toml - Codex 一键后台启动并打开本地工作台的 macOS 动作
.env.example - 可选的 ONEAPI_API_KEY 环境变量示例
README.md - 本地启动、安全边界与模型参数说明
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
.gitignore - 密钥、生成物、缓存和私有文档忽略规则
</config>

架构法则：API Key、完整 Style DNA 与 System Prompt 只存在服务端；模型尺寸和图片由后端白名单校验；白模工作流由应用服务编排，图片完成即返回且飞书异步归档；前端不拼接最终 Prompt 或访问外部服务。

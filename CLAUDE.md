# Canvas Lab - 公司图像模型的本地测试工作台
Node.js 24+ + 原生 HTTP + HTML + CSS + JavaScript

<directory>
public/ - 浏览器工作台界面（5 个业务文件：index.html、styles.css、result.css、theme.css、app.js）
src/ - 模型参数、OneAPI 访问与飞书同步层（4 个模块：model-config.mjs、oneapi-client.mjs、lark-sync.mjs、reference-image.mjs）
test/ - Node 原生测试（4 个测试文件：model-config.test.mjs、oneapi-client.test.mjs、reference-image.test.mjs、lark-sync.test.mjs）
PRD-Outputs/ - 私有产品文档，已由根目录 .gitignore 排除
</directory>

<config>
package.json - 零依赖项目元数据与启动、测试脚本
server.mjs - 本地 HTTP 服务、内存密钥会话与 API 路由入口
.env.example - 可选的 ONEAPI_API_KEY 环境变量示例
README.md - 本地启动、安全边界与模型参数说明
DESIGN.md - Light Command Center 在高频生图工作台中的视觉与交互契约
.gitignore - 密钥、生成物、缓存和私有文档忽略规则
</config>

架构法则：API Key 只存在后端进程内存或环境变量；模型尺寸与参考图由后端白名单校验；生成结果由后端同步飞书附件；前端不自行拼接未知参数或访问外部服务。

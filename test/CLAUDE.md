# test/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护自动化测试成员清单
local-settings.test.mjs: .env.local 未知项保留、OneAPI Key 原子写入/覆盖/删除、格式校验与持久化状态测试
lark-setup.test.mjs: CLI 配置 JSON、用户 Scope、共享 Base 状态、非阻塞 Device Flow、二维码与授权过期测试
model-config.test.mjs: 模型合法尺寸矩阵、四模型及自由生图首张参考图最近比例、GPT 中等质量默认值与请求白名单回归测试，不发送真实 API 请求
image-dimensions.test.mjs: PNG/JPEG/WebP 图片头真实宽高与无效字节降级测试
image-ratio.test.mjs: 浏览器原图比例标签、缺图默认值与最近合法比例选择纯函数测试
agent-model-config.test.mjs: 九个 Prompt Agent 候选 ID、最新 Doubao、图片输入能力与接口可用性回归测试，不发送真实 API 请求
lark-sync.test.mjs: 飞书原始/最终 Prompt、出图模型/融合基模、画幅适配模式与生成记录字段映射回归测试，不调用 CLI 或写入真实 Base
oneapi-client.test.mjs: OneAPI Responses 图生图质量参数、Style DNA 多轮图片/PDF 与纯文字续改请求、input_image/input_file 分流、响应归一化、Prompt 文本与错误脱敏测试
style-dna-reverse.test.mjs: Style DNA 反推脱敏版本目录、所选版本传递、Prompt 正文隔离、客户端覆盖防护、公开附件策略、多轮图片/PDF 与固定 JSON Schema 测试
prompt-agent.test.mjs: 无 Agent 名称字段时的白模与风格反推展示名派生、行解析、脱敏已上架版本目录、默认最高/指定发布版本、System Prompt 与分页边界测试
reference-image.test.mjs: 默认及调用方自定义的参考图数量、格式、容量、Base64、MIME、真实字节数与可信宽高策略回归测试
reference-attachment.test.mjs: Style DNA 图片/PDF 附件分流、无数量上限、PDF 文件签名、MIME、真实字节与容量策略回归测试
style-library.test.mjs: 飞书风格行、Style DNA 合法性、版本化唯一编码、历史版本选择、上下架状态、分页边界和前端脱敏回归测试
white-model-workflow.test.mjs: 版本化 Style DNA 编码、指定场景融合 Agent 版本、融合基模名称、最近合法比例/手动覆盖、GPT 默认质量、出图和非阻塞归档调度的内存集成测试
runtime-cache.test.mjs: 异步 TTL 缓存命中、并发去重、过期、主动刷新和失败清理测试
sync-jobs.test.mjs: generationId 幂等入队、非阻塞执行与飞书同步状态测试

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

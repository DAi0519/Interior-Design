# test/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护自动化测试成员清单
model-config.test.mjs: 模型尺寸矩阵与请求白名单回归测试，不发送真实 API 请求
agent-model-config.test.mjs: Prompt Agent 候选 ID、图片输入能力与接口可用性回归测试，不发送真实 API 请求
lark-sync.test.mjs: 飞书原始/最终 Prompt 与生成记录字段映射回归测试，不调用 CLI 或写入真实 Base
oneapi-client.test.mjs: OneAPI Responses 图生图请求、响应归一化、Prompt 文本与错误脱敏测试
prompt-agent.test.mjs: 飞书 Prompt Agent 行解析、同编码最高发布版本、System Prompt 与分页边界测试
reference-image.test.mjs: 多参考图数量、MIME、Base64、真实字节数与上传策略回归测试
style-library.test.mjs: 飞书风格行、Style DNA 合法性、版本化唯一编码、历史版本选择、上下架状态、分页边界和前端脱敏回归测试
white-model-workflow.test.mjs: 版本化 Style DNA 编码、Prompt Agent、缓存模型目录、出图和非阻塞归档调度的内存集成测试
runtime-cache.test.mjs: 异步 TTL 缓存命中、并发去重、过期、主动刷新和失败清理测试
sync-jobs.test.mjs: generationId 幂等入队、非阻塞执行与飞书同步状态测试

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

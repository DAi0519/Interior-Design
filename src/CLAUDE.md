# src/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护服务端业务模块清单
model-config.mjs: 模型参数真源，维护模型 ID、尺寸矩阵、格式与请求白名单
agent-model-config.mjs: Prompt Agent 模型真源，维护七个候选 ID、图片输入能力与接口可用性组合
oneapi-client.mjs: OneAPI HTTP 客户端，Prompt Agent 与图生图走 Responses，纯文生图走 Images API，并统一脱敏错误
lark-cli.mjs: 飞书 CLI 基础设施，统一子进程执行、JSON 解析、超时和错误归一化
lark-sync.mjs: 飞书生成记录同步边界，归档最终 Prompt、工作流元数据、结果图与参考图附件
style-library.mjs: Style DNA 风格目录边界，向前端脱敏并向服务端执行链提供已上架完整 DNA
prompt-agent.mjs: Prompt Agent 配置边界，从飞书读取已上架白模 System Prompt 与版本
white-model-workflow.mjs: 白模渲染应用服务，编排 Style DNA、Prompt Agent、Responses 图生图与飞书同步
reference-image.mjs: 参考图安全边界，校验最多 4 张、单张 8MB、合计 20MB、MIME 与真实字节数

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

# src/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护服务端业务模块清单
model-config.mjs: 模型参数真源，维护模型 ID、尺寸矩阵、格式与请求白名单
oneapi-client.mjs: OneAPI HTTP 客户端，封装鉴权、超时、错误与 URL/Base64 图片响应归一化
lark-sync.mjs: 飞书同步边界，通过批量创建取得记录 ID、转存结果图和多参考图附件并清理临时文件
reference-image.mjs: 参考图安全边界，校验最多 4 张、单张 8MB、合计 20MB、MIME 与真实字节数

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

# sunburst-outpaint/
> L2 | 父级: ../CLAUDE.md

成员清单

input.png: 用户当日 Downloads 夜景客厅扩图成品的等比 1024×768 测试副本，原文件未修改
canvas.png: 1536×1024 透明 PNG 请求画布，原图放置在 left=256/top=128 的矩形
mask.png: 与画布同尺寸的请求 mask，原图矩形不透明、外围透明；不保证上游锁定原图区
raw-output.png: 本次 OneAPI 编辑请求返回的原始结果图
result.png: 本次真实请求的本机结果副本，用于尺寸与原图区差异核验
validation.json: 时间/实际宽高/结果与 canvas/mask SHA-256/placement/费用及原图区通道差记录
response-summary.json: 本次上游响应与费用的摘要记录
ui-desktop.jpg: 双引擎选择、Sunburst 权限与 1536×1024 手输画布的桌面界面验证，不代表通过界面再次生成
ui-narrow.jpg: 390px 窄屏扩图配置、画布位置与完整提示的界面验证
tests.log: 本次最终 Node 自动化回归记录，474 项全部通过，不发送真实生图请求
CLAUDE.md: 本次真实验证来源地图与验收边界

2026-10-12 仅执行一次 Sunburst 真实请求，耗时 34.120 秒，真实费用 USD 0.01868。`validation.json` 的 `passed` 表示接口、唯一结果与 1536×1024 实际尺寸通过；原图区平均绝对通道差 26.824/255、最大差 214、`pixelIdentical=false`，不能将此记录称为严格保真或完整质量验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

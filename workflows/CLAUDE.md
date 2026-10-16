# workflows/
> L2 | 父级: ../CLAUDE.md

成员清单

Qwen-Image-Edit-2511-Outpaint.json: 可拖入 ComfyUI 的原生节点画布，Qwen 2511 + 专用 Lightning 4 步、等比预处理与遮罩扩图/中心合成
Qwen-Image-Edit-2511-Outpaint.api.json: 同一导出图的 API 版本，上传图片后替换 input.inputs.image 并提交；无内嵌图片、地址或密钥
README.md: 模型依赖、独立工作台与原生画布的尺寸区别、重新导出方式和实际验证边界
CLAUDE.md: 本模块地图；两份 JSON 由 scripts/export-qwen-outpaint.mjs 从运行真源生成，禁止手工改出漂移

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

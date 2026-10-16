# workflows/
> L2 | 父级: ../CLAUDE.md

成员清单

Qwen-Image-Edit-2511-Outpaint.json: 可拖入 ComfyUI 的原生节点画布，Qwen 2511 + 专用 Lightning 4 步、等比预处理与遮罩扩图/中心合成
Qwen-Image-Edit-2511-Outpaint.api.json: 同一导出图的 API 版本，上传图片后替换 input.inputs.image 并提交；无内嵌图片、地址或密钥
SeedVR2-7B-独立超分.json: 普通任意比例图片的独立 ComfyUI 7B 超分画布，原图直入、原生短边目标/长边上限控制，5 节点并保存 PNG
SeedVR2-7B-独立超分说明.md: 普通图片超分的模型依赖、原生尺寸控件、拆分边界和静态验证状态
KS-超分.json: 用户 KS 附件的节点/连线/参数语义归档，保留 0.75MP 与原图短边两倍规则；原字节 SHA-256 存在 extra.canvasLabSource，运行参数由 src 工厂适配
README.md: 模型依赖、独立工作台与原生画布的尺寸区别、重新导出方式和实际验证边界
CLAUDE.md: 本模块地图；Qwen 两份 JSON 由 scripts/export-qwen-outpaint.mjs 从运行真源生成，SeedVR2 独立图以附件 SHA-256 追溯

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

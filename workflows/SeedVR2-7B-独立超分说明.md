# SeedVR2 7B 普通图片独立超分

> L2 | 父级: ../CLAUDE.md；成员: SeedVR2-7B-独立超分.json

将 `SeedVR2-7B-独立超分.json` 拖入 ComfyUI，在「上传普通图片」节点选图后运行。支持横图、竖图、方图等任意比例，图片直接进入 SeedVR2，不需要提示词。

执行链只有「上传图片 → SeedVR2 7B → 保存 PNG」，另有 DiT/VAE 两个模型加载节点，共 5 个节点、4 条连线。已去除全景专用的左右补边、居中裁剪、2:1 尺寸计算，以及额外模糊处理。

在 SeedVR2 节点中调整：

- `resolution`：目标短边，默认 2048。
- `max_resolution`：长边上限，默认 4096。长边超限时优先受此上限限制，因此并非所有图片的短边都会达到 2048，也不是固定输出 4K。
- 尺寸交由 SeedVR2 原生处理，按原图比例适配，实际尺寸以生成结果为准。

依赖原附件中的 SeedVR2 VideoUpscaler 节点与以下模型：

- DiT: `seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors`；保留 cuda:0、32 blocks swap、CPU offload、cache=false、sdpa。
- VAE: `ema_vae_fp16.safetensors`；保留编码/解码分块、tile=1024、overlap=128、CPU offload、cache=false。

除上述输出尺寸设置与输入输出适配外，保留原 SeedVR2 的种子、randomize、batch_size=1、lab 色彩校正、零噪声等参数。原附件未修改，来源 SHA-256 与 INPUT/OUTPUT/POS 契约保存在 JSON 的 extra 中；JSON 不使用非法注释。

静态验证覆盖节点连线、无环、原图直入、原模型参数保留、原生尺寸控件恢复与输出可达。未提交 GPU 任务，实际模型可用性、显存表现和输出质量尚未实跑验证。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

<!--
[INPUT]: 依赖KS-超分.json原附件参数、KS-原图直入2倍.json独立画布及SeedVR2/MaaS尺寸校验/Easy-Use/Essentials节点
[OUTPUT]: 对外提供KS原图直入2倍的导入、输入限制、动态尺寸与同图对照说明
[POS]: workflows的KS无预缩放实验使用说明，与原KS归档及运行工厂对应
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# KS版 · 原图直入2倍

将 `KS-原图直入2倍.json` 通过 ComfyUI 的 `Ctrl+O` 打开，或把实际 JSON 文件拖入画布，在「上传原图」节点选图后运行。工作台对应名称为「KS版 · 原图直入2倍」，简称「KS直入 · 2倍」，工作流键为 `ks_seedvr2_2x_direct`。

这是原 KS 的独立对照流：只去掉模型输入前的 `ImageScaleToTotalPixels` 0.75MP 预缩放。原图经过尺寸校验后直接进入 SeedVR2，没有先缩小或放大到固定像素数，也不需要提示词。原 KS 画布及工作台「KS版 · 2倍」保持原有路径，便于对照。

执行链为「上传原图 → 尺寸校验 → SeedVR2 7B → 保存 PNG」；尺寸分支读取同一张原图的宽高，计算 `min(宽,高) × 2` 并连接 SeedVR2 的 `resolution`。`max_resolution=0`，目标为原图宽、高各 2 倍；例如 1600×900 的目标为 3200×1800。图中 `resolution` 的数值控件只是已连接端口的占位值，不是固定输出短边。SeedVR2 原生对齐或运行环境是否影响最终尺寸，应读取实际结果验证。

保留原 KS 每轴 **384–3200px** 的输入限制，由 `MaaSCheckImageSize` 在运行前检查。该节点只校验图片尺寸，不调整像素，也不访问外部业务接口；画布不包含 MaaS URL 加载、输入参数或图片上报节点。共 9 个节点、10 条连线。

需要已安装以下节点：

- SeedVR2 VideoUpscaler：`SeedVR2LoadDiTModel`、`SeedVR2LoadVAEModel`、`SeedVR2VideoUpscaler`。
- 原 KS 的 `MaaSCheckImageSize`、ComfyUI-Easy-Use 的 `easy imageSize`、ComfyUI Essentials 的 `SimpleMath+`。
- ComfyUI 原生 `LoadImage` 与 `SaveImage`。

模型及推理配置沿用原 KS：

- DiT：`seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors`；`cuda:0`、32 块交换、`swap_io_components=false`、CPU offload、`cache_model=false`、`sdpa`。
- VAE：`ema_vae_fp16.safetensors`；FP16，编码与解码均分块，tile=1024、overlap=128，CPU offload、`cache_model=false`。
- SeedVR2：源种子 `2627526869`、`randomize`、batch_size=1、lab 色彩校正、temporal_overlap=0、prepend_frames=0、输入及 latent 噪声均为0、CPU offload、debug=false。

做对照时使用同一张原图、相同种子及相同输出尺寸，分别运行原 KS 与本流；若手动运行，要将两份图中的种子控制都改为 `fixed` 并填相同数值。去掉预缩放可能保留更多输入纹理，同时可能增加推理用时或显存占用；是否更清晰不能仅凭节点配置判断，需比较实际产物。

来源原附件 SHA-256 为 `8db4d3de7194d117756e19fdd5d64b50e9c0664146dde82312bb4071a44458c4`，记录在 JSON 的 `extra.canvasLabSource.sha256`；衍生文件路径另存于 `derivedFile`。JSON 中的 INPUT/OUTPUT/POS/PROTOCOL 契约位于 `extra.contract`。

静态验证覆盖 JSON 解析、节点/连线双向一致性、无环、输入校验、模型原图直入、动态短边×2、原 KS 模型/色彩/噪声参数保留和保存节点可达。未提交 GPU 任务；当前不宣称实际画质、耗时、显存或最终输出尺寸已通过实跑验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

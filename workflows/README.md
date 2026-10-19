<!--
[INPUT]: 依赖src/image-outpaint-qwen.mjs运行真源、独立导出图及真实生成证据
[OUTPUT]: 对外提供Qwen扩图模型依赖、共同尺度推理与输出恢复、独立导入与工作台的使用区别及验证边界
[POS]: workflows的Qwen扩图使用说明，与执行真源和导出器保持一致
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Qwen Image Edit 2511 扩图

拖入 `Qwen-Image-Edit-2511-Outpaint.json`，在「上传原图」节点选图后运行。API 版先向自己的 ComfyUI 上传图片，再替换 `input.inputs.image` 为上传回执中的文件名。

当前工作流版本为 `2026-10-19.1`。旧版让完整 2K/4K 画布直接进入图像 latent，而 Qwen 参考编码内部适配到约 1MP，可能造成扩展区与回贴原图区的尺度错位。新版先统一推理尺度，再恢复目标尺寸后合成；输出文件尺寸与内部采样尺寸分别记录。

使用当前环境已经核实存在的模型：

- diffusion_models：`qwen_image_edit_2511_fp8mixed.safetensors`，UNET dtype=`default`，尊重混合精度文件。
- text_encoders：`qwen_2.5_vl_7b_fp8_scaled.safetensors`，type=`qwen_image`。
- vae：`qwen_image_vae.safetensors`。
- loras：`Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors`，强度 1。

采用官方 2511 Lightning 模板的 4 步、CFG 1、Euler/simple、shift 3.1。节点链为：

1. 原图等比预处理并扩边，保留目标画布与原始遮罩。
2. 扩边画布通过 `ImageScaleToTotalPixels` 统一到 1.0MP、8px 对齐；此处 ComfyUI 的 1.0MP 是 `1024 × 1024` 像素。
3. `GetImageSize` 读取实际工作宽高，遮罩按同一宽高缩放；正负参考编码、VAE 图像编码和 latent noise mask 使用同一工作尺度。
4. 采样解码后，由另一个 `GetImageSize` 读取扩边目标的实际宽高，Lanczos 恢复到精确目标尺寸，再按原始遮罩回贴原图。

扩展区重绘，原图内侧 32px 为接缝带，其余中心保留。恢复尺寸使用 Lanczos 重采样，没有增加超分模型；2K/4K 是最终输出尺寸，不代表原生 2K/4K 采样。未依赖作者工作流中缺失的「孤海」/「lrzjason」节点和两份未安装 LoRA。

Canvas Lab 的「AI编辑 → AI扩图 → Qwen Image Edit 2511」直接选择比例、1K/2K/4K 分辨率并拖动原图；服务端依据真实图片重新计算目标尺寸，输入最大 4096px，必要时等比缩放原图，并验证真实输出尺寸。工作台生成前核验飞书合同，完成后自动归档源图、结果图和工作流参数，并显示记录链接；独立 ComfyUI 导入图只负责出图。4K 的尺寸准入、真实 GPU 生成和画质验收应分别判断。

独立 ComfyUI 画布采用原生 `LoadImage`，默认先等比适配到约 0.39MP、宽高 16px 对齐，再各扩展 128px；最终尺寸是适配后宽高各增加 256px。工作图遮罩尺寸与最终目标尺寸均从节点图动态读取，不写死示例图片的 1024 × 768，换图或修改扩边后仍沿用实际目标。工作台会直接注入已经适配的源图与精确扩边值。独立画布不提供工作台的目标分辨率自动计算。

执行 `node scripts/export-qwen-outpaint.mjs` 可从 `src/image-outpaint-qwen.mjs` 重新生成两份 JSON。导出器只额外替换上传和等比预处理节点，模型、Prompt、统一推理尺度、采样、动态恢复与原遮罩合成参数均来自执行图真源。画布中的动态宽高以已链接的 INT 控件端口保存，API 与可拖入画布的连接保持一致。

参数依据：[ComfyUI 官方 2511 示例](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511)、[LightX2V 2511 Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning)。早期实跑见 `.impeccable/review/qwen-outpaint/`；2026-10-19 同源3:4/2K修复实跑见 `.impeccable/review/qwen-outpaint-alignment/validation.json`，输出1536×2048，接缝外932×1301原图中心逐像素相同，该样本矩形错位消失；未新增4K或多场景验收；模型目录准入、真实生成和画质评测应分别判断。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

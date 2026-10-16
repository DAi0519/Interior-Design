# Qwen Image Edit 2511 扩图

拖入 `Qwen-Image-Edit-2511-Outpaint.json`，在「上传原图」节点选图后运行。API 版先向自己的 ComfyUI 上传图片，再替换 `input.inputs.image` 为上传回执中的文件名。

使用当前环境已经核实存在的模型：

- diffusion_models：`qwen_image_edit_2511_fp8mixed.safetensors`，UNET dtype=`default`，尊重混合精度文件。
- text_encoders：`qwen_2.5_vl_7b_fp8_scaled.safetensors`，type=`qwen_image`。
- vae：`qwen_image_vae.safetensors`。
- loras：`Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors`，强度 1。

采用官方 2511 Lightning 模板的 4 步、CFG 1、Euler/simple、shift 3.1。原生扩边遮罩进入 latent noise mask，最终用同一遮罩合成：扩展区重绘，原图内侧 32px 为接缝带，其余中心保留。未依赖作者工作流中缺失的「孤海」/「lrzjason」节点和两份未安装 LoRA。

Canvas Lab 的「AI创作 → AI扩图 → Qwen Image Edit 2511」直接选择比例、1K/2K/4K 分辨率并拖动原图；服务端依据真实图片重新计算目标尺寸，输入最大 4096px，必要时等比缩小原图，并验证真实输出尺寸。工作台生成前核验飞书合同，完成后自动归档源图、结果图和工作流参数，并显示记录链接；独立ComfyUI导入图只负责出图。4K 的尺寸准入不等于 4K GPU 性能已验证。

独立 ComfyUI 画布采用原生 `LoadImage`，默认先等比适配到约 0.39MP、宽高 16px 对齐，再各扩展 128px；最终尺寸是适配后宽高各增加 256px。这个导出版本便于独立加载和调整；工作台会直接注入已经适配的源图与精确扩边值。独立画布不提供工作台的目标分辨率自动计算。

执行 `node scripts/export-qwen-outpaint.mjs` 可从 `src/image-outpaint-qwen.mjs` 重新生成两份 JSON。导出器只额外替换上传和等比预处理节点，模型、Prompt、采样、遮罩及合成参数来自执行图真源。

参数依据：[ComfyUI 官方 2511 示例](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511)、[LightX2V 2511 Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning)。实跑结果见 `.impeccable/review/qwen-outpaint/` 的验证记录；模型目录准入、真实生成和画质评测应分别判断。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

<!--
[INPUT]: 依赖src/image-outpaint-workflow.mjs、共享Janus配置、当前服务object_info节点接口及OneReward独立画布
[OUTPUT]: 对外提供OneReward扩图的导入、模型/节点依赖、手工尺寸与验证边界说明
[POS]: workflows的Flux Fill OneReward独立导出使用说明，与运行图及画布extra.contract对应
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Flux Fill OneReward（FP8）扩图

在 ComfyUI 使用「打开工作流」选择 `Flux-Fill-OneReward-Outpaint.json`，或把实体 JSON 文件拖入画布，再在「上传原图」节点选择图片。聊天里的文件链接需要先保存为本地文件。

本图来自 Canvas Lab 当前 `2026-10-19.1` 扩图执行图，共19节点、26连线。只将 Base64 传输改为原生 `LoadImage`，将示例扩边设为四边各128px，并使用本地输出文件前缀；模型、Janus问题/种子/采样、LayerStyle预处理、遮罩条件及Flux采样沿用执行真源。不包含MaaS URL加载、图片上报、API地址、密钥或内嵌图片。

## 使用参数

- 输入图片宽高均须为32–4096px；LayerStyle按原比例处理并将宽高向上对齐32px。
- 在「四边扩图像素」节点修改 left/top/right/bottom，单位是预处理后的像素，默认各128px；至少一边大于0，建议以8px为步长修改。
- 最终宽高为预处理后宽高加上对应两边扩展量，目标宽高须为8的倍数。此独立手工画布不自动执行工作台的固定2K构图计算。
- Janus读取未扩边图片，自动生成英文提示词，并经 `SaveText` 原文透传至正向编码；输出PNG及本次实际提示词TXT。
- Flux采样20步、CFG=1、Euler/normal、denoise=1、guidance=30、feathering=30；采样示例种子4和Janus固定种子均设为fixed，手动需要变化时可调整。

## 所需模型

- diffusion_models：`flux1-fill-dev-OneReward-fp8.safetensors`，weight_dtype=`fp8_e4m3fn`。
- text_encoders：`t5xxl_fp8_e4m3fn.safetensors`、`clip_l.safetensors`。
- vae：`ae.sft`。
- Janus：`deepseek-ai/Janus-Pro-1B`。

## 所需节点

- ComfyUI-Janus-Pro：`JanusModelLoader`、`JanusImageUnderstanding`。
- ComfyUI_LayerStyle：`LayerUtility: ImageScaleByAspectRatio V2`。
- ComfyUI-KJNodes：`ImagePadForOutpaintMasked`。
- 当前环境的MaaS自定义节点：`MaaSCheckImageSize`，用于图片尺寸检查。
- ComfyUI原生Flux条件/采样/编解码/上传/保存节点，以及可保存并透传STRING的 `SaveText`。

其他服务器如缺少上述自定义节点，导入时会标红，需要先安装对应节点。模型文件名也须与目标服务器目录一致。

## 验证记录

2026-10-21导出时已读取当前ComfyUI服务的 `object_info`，据其接口构造端口和控件，并检查模型枚举。静态验证检查JSON、双向连线、端口类型、无环、画布到API还原及与执行真源的一致性。本次不提交GPU任务；不新增画质、显存或速度验收结论。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

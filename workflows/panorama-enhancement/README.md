# R5_4 全景图美化执行图

`R5_4_workflow.api.json` 是用户提供的原始 ComfyUI API 执行图，SHA-256 为 `1390e507c446a82d45e9fec795358d4df7b29f52e6625cd988c53e6150e16b2a`。它是节点执行图；文件本身不声明 MaaS 平台发布策略 ID。

运行工厂位于 `src/panorama-workflow.mjs`，传输适配器位于 `src/panorama-client.mjs`。仅将节点 1 的本地文件输入改成请求内 Base64，向节点 4/5 注入正负提示词、节点 7 注入随机种子，并用本次唯一产物前缀替换节点 46 的保存名。其他节点、连线和固定参数保持原图语义。

原图必须为真实 2:1 的 PNG、JPEG 或 WebP。工作流从原图提取 20 个 1536×1536、FOV 90° 的透视视角，使用四步 Euler、CFG 1 与原图手工 sigma 序列；每步执行球面 Gather/Scatter 共享状态，最后融合回原图尺寸。工作台输出档为 `original`，不执行普通 Flux 的 1K/2K 缩放或 SeedVR2 超分。默认负向为空，用户自定义负向会整段注入节点 5。原图固定 CFG 1；按 ComfyUI 标准 CFG 实现，负向分支不参与最终引导，因此本轮光影测试使用正向模板与用户要求，不将负向词作为有效控制变量。

模型依赖为 `flux-2-klein-9b-fp8.safetensors`、`qwen_3_8b_fp8mixed.safetensors`、`flux2-vae.safetensors`。除常规 Flux 节点外，执行环境须具备 `AIRenderSphereSetup`、`AIRenderPanoramaPerspective`、`AIRenderSphereGather`、`AIRenderFlowStateConvert`、`AIRenderSphereScatterMean`、`AIRenderPerspectivePanoramaMerge`、`VOIDWarpedNoiseSource` 和 `easy loadImageBase64`。客户端提交前核对实时节点必填项、模型枚举与连线类型。

传输默认给全景单独的二十分钟执行窗口，排队等待沿用共享客户端策略，并保留取消与阶段追踪。每次只提交一次生成，产物下载前校验请求级文件名前缀，下载后核验真实尺寸与 SHA-256；归档保留工作流 ID/版本、来源 SHA、视角数、采样参数与实际产物身份。

静态和内存传输测试覆盖源图语义、节点缺失前置阻断、正负词与种子注入、输出尺寸与身份；这些检查不代表真实出图的氛围迁移能力、球面接缝或画质已验收。

# FLUX.2 遮罩填充 MaaS 兼容版

版本：2026-10-21.1。原始附件保持不变；本目录交付独立导入图，工作台集成与飞书归档见 `docs/image-mask-fill.md`，不修改 MaaS 生产参数/策略。

可导入文件：

- `FLUX.2_遮罩提示词填充_MaaS兼容.json`：24 节点、32 连线，遮罩区域按提示词编辑。
- `FLUX.2_遮罩参考图填充_MaaS兼容.json`：33 节点、47 连线，保留参考物体分割、裁剪和双参考。
- 两份 `.api.json` 是对应 API 执行图；API 调用前须上传图片并替换 `input.inputs.image`，参考版另替换 `reference.inputs.image`。

两个原图都是 47 节点、47 连线；简化来自删除 Get/Set 转接、比较器、常量包装和提示词版未使用的参考分支，核心 Painter 则展开为可审计的原生节点。

## 实机核对

2026-10-21 对照中卫与鄂尔多斯两套 MaaS prod_test ComfyUI：两套均为 ComfyUI 0.39.2、3192 个服务端节点类型。检查入口来自当前项目的 ComfyUI 配置及既有公司测试实例，不代表所有 MaaS 生产集群。

- 中卫：`maas-workflow-app-50-prodtestzwapp50.k8s-zhongwei.qunhequnhe.com`
- 鄂尔多斯：`maas-workflow-app-50-prodtesteedsapp50.k8s-eerduosi-new.qunhequnhe.com`

`GetNode` / `SetNode` 不在 `/object_info` 中，但两实例均发布了 `ComfyUI-KJNodes/js/setgetnodes.js`，源码注册这两个虚拟节点。因此不能把这两个节点当成已证实缺失的服务端插件。兼容版改为直接连线，避免依赖前端转接处理。

确认缺失的服务端节点是以下六类：

| 原节点 | 本版处理 | 保留内容 / 边界 |
| --- | --- | --- |
| `PainterFluxImageEdit` | `CLIPTextEncode` + `VAEEncode` + 串联 `ReferenceLatent` + `SetLatentNoiseMask` | 图1 latent 为采样起点，正负条件均保留参考顺序，保留原作者 imageN 文本前缀；没有换为空 latent |
| `Text` | 提示词直接写入正向 `CLIPTextEncode` | 参考版保留原提示词；提示词版将原默认“去除冰箱”改为实测通过的英文移除及补背景指令 |
| `MaskFillHoles` | 独立 `GrowMaskWithBlur(expand=0, blur=0, fill_holes=true)` | 维持先填孔再扩张顺序；按 >0 二值化，软遮罩边缘可能与原插件不同 |
| `ImageBatchToList` | 原生 `RebatchImages(batch_size=1)` | 两张结果逐张交给 Stitch，避免批次与单个 stitcher 不匹配 |
| `LayerMask: LoadBiRefNetModelV2` | `LoadRembgByBiRefNetModel` | 使用现机可选 `General.safetensors` / AUTO / use_weight=false |
| `LayerMask: BiRefNetUltraV2` | `RembgByBiRefNet` | 仅用前景白 MASK 输出；原参考图仍直接进入缩放/裁剪，原附件 process_detail=false |

`InpaintCropImproved`、`InpaintStitchImproved`、`Flux2Scheduler`、`GrowMaskWithBlur`、LayerUtility 缩放/裁剪及原三份模型都在两套实机目录中。兼容版没有新增服务器插件。

## 保留的参数

| 项目 | 提示词版 | 参考图版 |
| --- | --- | --- |
| 底模 | `flux-2-klein-9b.safetensors` / default | 同左 |
| 文本编码器 | `qwen_3_8b.safetensors` / flux2 / default | 同左 |
| VAE | `flux2-vae.safetensors` | 同左 |
| 采样 | 4 步 / Euler Ancestral / CFG 1 | 同左 |
| 每次张数 | 2 | 2 |
| 遮罩扩张 | 10px | 80px |
| 膨胀后模糊 | 4 | 4 |
| 推理裁剪目标 | 1536×1536 | 1536×1536 |
| 上下文倍率 / 融合宽度 | 1.2 / 32px | 同左 |

原图中 Repeat 节点显示的 1、Grow 节点残留的 -184 都被外部连线覆盖；本版使用真正生效的 2 张与 10/80px。

参考物体保留四边 128px 裁剪，并如原 Painter 一样 Lanczos 中心裁剪到主图的实际推理宽高。没有悄悄换成另一种参考图比例处理。裁剪节点显式补齐当前接口的 `device_mode=cpu (compatible)`。

## 导入与使用

1. ComfyUI 用 Ctrl+O 打开非 `.api.json` 文件，或把实体 JSON 文件拖入画布。
2. 在“上传原图”节点重新选择图片，右键打开遮罩编辑器涂抹编辑区域。白色遮罩参与重绘，黑色遮罩保留。
3. 参考图版另外上传参考物体图；其自动分割的白色前景用于裁剪物体。
4. 修改正向文本编码节点末尾的编辑指令，保留前面的作者前缀即可。提示词版默认用明确的英文移除冰箱及补背景指令；针对其他输入，应把物体和背景描述一起改成目标内容。默认两张结果；需要单张时将 RepeatLatentBatch amount 改为 1。
5. 模型下拉已按实机文件名填写。默认执行仍为原 1536 推理参数。

原附件只有旧服务器文件名、clipspace 路径和比较器缓存，没有原图/参考图的像素；兼容版必须重新上传。全部旧预览链接及其鉴权查询串均已清除。

## 验证与差异

`validation.json` 记录原文件 SHA-256 与静态节点合同检查；`validation/runs.json` 记录合成样本实跑状态、Prompt ID、参数覆盖及真实产物尺寸/指纹。以回执里的状态为准。

- 两套测试实例的节点类型和模型枚举均已检查，两个 API 图的 required 输入、类型、枚举、数值范围、无环性和画布连线索引通过核验。
- 冒烟使用 512px 合成原图/遮罩与花瓶参考图，将 Crop 的预缩放最小宽高和目标宽高改成 512，其余底模、编码器、4 步、CFG、批次2保持原值。该测试验证节点链执行，不代表原 1536px 性能、显存或室内样本质量验收。
- 原“去除冰箱”短指令的两张合成输出都仍保留冰箱；同种子改用明确的英文移除及补背景指令后，两张均移除冰箱并补齐墙地背景，已将该英文指令写入提示词版默认值。参考图版两张合成输出均换为花瓶。三次任务均 execution_success，六张实际 PNG 均为 512×512，已下载并记录 SHA-256；视觉判断仅适用于这个合成样本。
- 原 Painter 把 mask 硬缩到 width/8，本版交给原生采样器匹配真实 Flux2 latent 尺寸；这是有意移除的尺寸假设，边缘数值不承诺完全相同。
- BiRefNet 包与文件切换可能改变参考前景边缘；填孔插件原版本不明，软遮罩不能认定像素等价。
- 原裁剪链开启 preresize 且最小宽高1536，兼容版保留。小图可能先被放大；即便有 Stitch，也不能承诺结果与最初上传图的未编辑区逐像素一致。
- 浏览器自动化连接超时，尚未完成前端导入回读；API 实跑和静态画布结构验证分别记录，不混同。

当前交付属于 MaaS 测试实例的兼容工作流，不构成生产发布。

## 实现依据

- [Painter 原作者实现](https://github.com/princepainter/Comfyui-PainterFluxImageEdit/blob/main/PainterFluxImageEdit.py)：原有条件、参考顺序、首图 latent 与噪声遮罩。
- [ComfyUI ReferenceLatent](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_edit_model.py)：串联追加参考潜空间。
- [ComfyUI 原生节点](https://github.com/Comfy-Org/ComfyUI/blob/master/nodes.py)：VAEEncode 与 SetLatentNoiseMask。
- [KJNodes 遮罩实现](https://github.com/kijai/ComfyUI-KJNodes/blob/main/nodes/mask_nodes.py)：填孔及膨胀语义。
- [LL BiRefNet 匹配现机接口的实现](https://github.com/lldacing/ComfyUI_BiRefNet_ll/blob/172e873e926a909d7dc65acd0910071487119ca9/birefnetNode.py)：safetensors 加载与前景 mask；原作者代码可能晚于现机版本，具体执行以回执为准。

构建命令：`node build.mjs 提示词原文件.json 参考图原文件.json object_info.json`。构建只读附件并写本目录，不发起任务。

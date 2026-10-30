<!--
[INPUT]: 依赖用户双图编辑原件、Flux2 Klein/Qwen3编码器/VAE与飞书reference迁移v4
[OUTPUT]: 说明1K/2K双图画布、节点和Prompt真源、尺寸/来源及验证边界
[POS]: workflows的精模Flux参考图交付说明，与src/refined-flux-reference.mjs运行适配器对应
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->
# Flux2 Klein 精模双图

将对应JSON拖入ComfyUI，图1载入精模底图，图2载入光影氛围参考图。选择预设时图2为飞书卡片原始附件；自行上传时图2为该上传原件。

- [1K画布](Flux2-Klein-精模双图-1K.json)：图1原比例，长边1024。
- [2K画布](Flux2-Klein-精模双图-2K.json)：图1原比例，长边2048。

短边16px对齐，允许微小比例舍入；不裁切画幅。图2保留自身比例独立缩放；图1缩放后的宽高同时驱动scheduler和空latent，图2不改变输出尺寸。两图各自VAEEncode后按图1→图2依次追加到正/负ReferenceLatent链；4步、CFG1、Euler、单张原生PNG，无超分/声音/对比器。CFG1不提供自定义负向。

## 模型和节点

模型：`flux-2-klein-9b-fp8.safetensors`，编码器：`qwen_3_8b_fp8mixed.safetensors`（flux2），VAE：`flux2-vae.safetensors`。精度沿用原附件default。

手工画布保留原附件的ComfyUI LayerStyle `LayerUtility: ImageScaleByAspectRatio V2`和原生LoadImage；需要支持Flux2/ReferenceLatent的ComfyUI。`scale_to_side=longest`、`scale_to_length=1024/2048`，位置及命名两套widget值一致。工作台运行时复用现有`easy loadImageBase64`和`ImageResize+`节点，CPU先计算相同比例的16px对齐尺寸，将双图字节和执行图一次提交，保持图序与采样骨架。

## 提示词和隔离

画布文本为当前飞书`lighting-reference-transfer` v4的静态快照，替换原附件中的入户门替换/均匀提亮内容；图1保持设计与材质，图2定义主题基调、光源主次和色温曝光。画布不自动同步飞书。正式工作台仍从飞书读取已上架v4并冻结SHA，两种参考入口只用该规则＋可选补充，不拼基础或卡片反推词。纯词Flux和其他功能继续原单图规则/分辨率；默认精模模型仍Banana 2.1。

原附件未改，SHA256：`3b425d6e90486a6ba3422c2c14cf4fd4479941d0201bbd3c69a8417a9411aeca`。工作台版本`refined-flux-reference@2026-10-28.1`；模型目录沿用Flux2 Klein原键，不新增飞书字段或选项。运行元数据保留原件SHA、两图角色/SHA、Prompt身份、计划与实际输出尺寸，拒绝错尺寸且不自动重复收费提交。

## 验证边界

真实ComfyUI只读节点目录已核对模型枚举和17类端口；离线集成覆盖实际双图字节/图序、1K/2K、正式编译/归档、缺节点零提交、错尺寸不重提及两份画布连线/控件。未执行真实GPU生成，光影迁移、材质和结构保持需要同底图同种子实测。节点兼容通过不代表成图质量通过。

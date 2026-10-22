# MAAS重建替换版检查与隔离对照

结论：暂不建议直接替换工作台。新版核心EditUtils节点在两套MaaS均存在，但附件仍需补兼容处理，默认尺寸配置也有不一致；受控小样本未表现出明确改善。本次没有替换工作台、改原附件、写飞书或发布MaaS生产策略。

## 文件与实机兼容

附件SHA-256：`22ca02d92db5ec6754100a723da9892a9529c4542d8d92a3f05c6f410a397389`。27节点、36连线，双向索引一致，所有节点都通向保存节点，无环或错槽。

| 项目 | 中卫 | 鄂尔多斯 | 说明 |
| --- | --- | --- | --- |
| Flux2KleinEditTextEncode_EditUtils | 已注册 | 已注册 | 不需要仅为此节点安装新插件；部署提交版本未知 |
| Text、ImageBatchToList | 未注册 | 未注册 | API需分别内联文本、改用RebatchImages；对照图已采用此适配 |
| BiRefNet-General/model.safetensors | 枚举可选 | 不可选 | 只有可选性证据，原附件选中权重没有在本轮实际加载；对照统一用两边均有的General.safetensors |
| 原作者的两张输入图片 | 不在输入枚举 | 不在输入枚举 | 必须重新上传；本轮用原有合成测试fixture |

link1258残留`BIREFNET_MODEL`，实际两端是`BiRefNetMODEL`；SaveImage保留两个未使用的输出端口，而实机只有一个。这是画布序列化元数据问题，不能直接当成服务端张量报错。image3是可选输入，未接线不构成错误。

## 实质差异

| 项目 | 当前原生条件链 | 新附件EditUtils链 |
| --- | --- | --- |
| 采样初始latent | 主图VAE编码 | 作者源码同样取image1的VAE latent，并非空latent |
| 参考图几何 | 参考图再中心裁成主crop宽高 | 主图/参考图各自按比例缩长边并补齐，能保留不同参考比例 |
| 文本 | 手工image1/image2视觉标记、默认编码模板 | Flux2分支原始prompt、自定义system template，不自动拼同样视觉标记 |
| 负向 | 空文本编码并挂参考latent | 正向ZeroOut、参考metadata保留；CFG=1通常跳过负向扩散分支，不应视为主要效果来源 |
| 默认推理尺度 | 当前工作台2K/4K/原图，记录实际crop | 附件crop1536²、EditUtils内部1024²、Scheduler仍按1536²；会改变sigma时间表，不一定报shape错误 |
| 遮罩填孔 | 独立填孔后膨胀 | 单个Grow节点膨胀后填孔，不能称像素等价 |
| 实际扩展与张数 | 工作台80px/1张 | 80px/2张；外连ImpactInt覆盖面板残留的−184与1 |

原作者Stitch实现允许把较小解码结果插值后回贴。1024解码图插值回1536，不代表1536原生细节。作者公开实现与MaaS安装提交是否完全一致尚未知；以下推理尺度已另用实际History核验。

## 实际GPU对照

只比较条件链：同一512px合成房间/冰箱、同一黑白mask、同一蓝花瓶参考图、同一中文指令、同一批种子432271050087470；两边统一1024crop/1024调度、General.safetensors、80px扩展、4步Euler Ancestral/CFG1、batch2，输出512×512。每批第二张是同一随机批次的另一结果，不是新增独立种子。

这不是原附件1536默认配置的原样执行，也不是当前工作台各档位的性能评测。统一了当前填孔/参考预处理与输出，主要保留编辑编码节点及其文本模板/参考几何的差别。

- native：Prompt ID c814b984-8726-4899-97a6-67bafd049303；2张、512×512；crop History=1024×1024；含提交/轮询/下载约67.8秒，不能据此比较模型纯GPU速度。
- editutils：Prompt ID 16b7e39f-2daf-47a9-87d6-d277510a6a37；2张、512×512；crop History=1024×1024，EditUtils主图History=1024×1024；含提交/轮询/下载约67.7秒，不能据此比较模型纯GPU速度。

| 当前原生条件链 | 新版EditUtils条件链 |
| --- | --- |
| ![原生第1张](rebuild-native-1.png) | ![EditUtils第1张](rebuild-editutils-1.png) |
| ![原生第2张](rebuild-native-2.png) | ![EditUtils第2张](rebuild-editutils-2.png) |

- native第1张：蓝花瓶叠在原冰箱中央，门线和把手仍清楚可见，未完成干净替换。
- native第2张：花瓶和投影已出现，冰箱轮廓、门线及把手保留，未完成干净替换。
- editutils第1张：冰箱基本保留，未见参考花瓶。
- editutils第2张：花瓶明显偏大并前置，冰箱上部及右侧把手仍可见，未完成干净替换。

样本只有一个合成场景，每条链两张，只能说明这次冒烟效果。两边均未完整去除冰箱；不能推广到真实家具、材质或人物替换，也不能据此判断底模质量。现阶段保留工作台，后续先修附件兼容与尺寸来源，再用真实样本验证。

## 证据与源码

- [实机与拓扑审计](rebuild-audit.json)、[运行回执与SHA-256](rebuild-comparison-runs.json)、[独立执行工具](rebuild-comparison.mjs)。生成图和输入摘要都保存在同目录，原附件未修改。
- [EditUtils作者源码，固定提交fd87e4c](https://github.com/lrzjason/ComfyUI-EditUtils/blob/fd87e4c5fdb36032ff129c9d78ee5c1cd6ff30d9/nodes.py#L1247-L1486)：缩放、文本编码及初始latent；wrapper见L3353-L3407。
- [ComfyUI v0.39.2 Scheduler](https://github.com/Comfy-Org/ComfyUI/blob/v0.39.2/comfy_extras/nodes_flux.py#L184-L234)。
- [ComfyUI v0.39.2 CFG逻辑](https://github.com/Comfy-Org/ComfyUI/blob/v0.39.2/comfy/samplers.py#L591-L632)。
- [CropAndStitch作者回贴实现](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch/blob/main/inpaint_cropandstitch.py#L239-L262)。

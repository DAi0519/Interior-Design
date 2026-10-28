<!--
[INPUT]: 依赖src/image-outpaint-qwen.mjs及共享Janus提示词运行真源、独立导出图及真实生成证据，以及原KS归档和原图直入2倍对照画布
[OUTPUT]: 对外提供Qwen扩图模型/Janus依赖、动态原文直通且无固定前缀/Scene continuation、运行25/独立26节点及实际提示词捕获、共同尺度推理与整图恢复且不回贴原图、工作台原比例/固定2K准入与独立手工图尺寸区别及分版本验证边界，以及KS无预缩放独立对照入口
[POS]: workflows的独立画布使用说明，与执行真源、导出器及KS来源归档保持一致
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Qwen Image Edit 2511 扩图

建议在 ComfyUI 按 `Ctrl+O`（或菜单“打开工作流”），选择本机的 `Qwen-Image-Edit-2511-Outpaint.json`。也可从 Finder/资源管理器把实际 JSON 文件拖到空白画布；聊天中的文件链接或文本不等于本地文件，可能被前端静默忽略。导入后在「上传原图」节点选图，再手动运行。API 版先向自己的 ComfyUI 上传图片，再替换 `input.inputs.image` 为上传回执中的文件名。

当前工作流版本为 `2026-10-20.1`。Janus动态提示词原文直连`SaveText.text`，其输出再进入正向编码`positive.prompt`；不拼固定前缀或`Scene continuation`，不再包含`QWEN_OUTPAINT_PROMPT`与`StringConcatenate`。既有Qwen专用Janus question和采样配置不变；约1MP统一推理、遮罩采样、整图恢复且不回贴原图的策略继续保留。此变更不作为灰块、接缝或多场景画质修复结论。

**历史实现（2026-10-19.3，保留当时记录）：** 当前工作流版本为 `2026-10-19.3`，增加 Janus-Pro-1B 原图分析，将场景提示词与固定 Qwen 扩图约束拼接后送入正向编码，并保存本次实际使用的完整正文。早期让完整 2K/4K 画布直接进入图像 latent，而 Qwen 参考编码内部适配到约 1MP，可能造成尺度错位；2026-10-19.1统一推理尺度后仍因回贴原图出现亮度缝，2026-10-19.2取消最后回贴。当前继续保留遮罩采样，完整解码图恢复目标尺寸后直接保存；输出文件尺寸与内部采样尺寸分别记录。

独立导入版使用以下模型（2026-10-19在当前浏览器所用服务器核对目录）：

- diffusion_models：`qwen_image_edit_2511_fp8mixed.safetensors`，UNET dtype=`default`，尊重混合精度文件。
- text_encoders：`qwen_2.5_vl_7b_fp8_scaled.safetensors`，type=`qwen_image`。
- vae：`qwen_image_vae.safetensors`。
- loras：`Qwen-Image-Edit-2511-Lightning-4steps-V1.0-fp32.safetensors`，强度 1。独立导入环境没有原BF16文件名，因此使用已安装的同版FP32；Canvas Lab工作台执行合同仍为BF16，不随独立导出图改变。切换服务器时需重新核对各文件名。
- Janus 模型：`deepseek-ai/Janus-Pro-1B`，沿用 Flux 扩图环境已有的 `JanusModelLoader` / `JanusImageUnderstanding` 节点；当前只使用原生`SaveText`保存并透传Janus动态原文，不再依赖`StringConcatenate`。

采用官方 2511 Lightning 模板的 4 步、CFG 1、Euler/simple、shift 3.1。节点链为：

1. Janus 读取未扩边源图，生成英文场景续写提示词；独立图直接分析 `LoadImage` 的上传原图，不分析补灰画布。复用 Flux 的固定 seed `298596445848600`、temperature `0.1`、top_p `0.95`、max_new_tokens `999`，沿用既有Qwen扩图分析问题，本次question不变。
2. Janus描述输出原文直连`SaveText.text`，再连接正向编码的`prompt`；不再加入固定前缀或`Scene continuation`，不设`StringConcatenate`。用户请求字段不能覆盖这套模型或分析参数。
3. 原图等比预处理并扩边，保留目标画布与原始遮罩；扩边画布通过 `ImageScaleToTotalPixels` 统一到 1.0MP、8px 对齐，此处 ComfyUI 的 1.0MP 是 `1024 × 1024` 像素。
4. `GetImageSize` 读取实际工作宽高，遮罩按同一宽高缩放；正负参考编码、VAE 图像编码和 latent noise mask 使用同一工作尺度。
5. 采样解码后，由另一个 `GetImageSize` 读取扩边目标的实际宽高，整图 Lanczos 恢复到精确目标尺寸并直接保存，不再与原图重新合成。

**历史固定段链路（2026-10-19.3，非当前执行）：** 2. `StringConcatenate` 先放固定 `QWEN_OUTPAINT_PROMPT` 扩图约束，再追加 Janus 场景描述；`SaveText` 保存并透传完整正文，连接正向编码的 `prompt`。用户请求字段不能覆盖这套模型或分析参数。

扩展区与原图内侧32px目标像素接缝带参与采样，其余原图latent受噪声遮罩约束。完整画面均经过VAE编解码与重采样，原图区域可能有少量颜色、纹理变化及细节损失，不能承诺像素一致。恢复尺寸使用Lanczos，没有增加超分模型；工作台2K是最终输出尺寸，不代表原生2K采样。未依赖作者工作流中缺失的「孤海」/「lrzjason」节点和两份未安装LoRA。

Canvas Lab 的「AI编辑 → AI扩图 → Qwen Image Edit 2511」默认跟随原图比例，也可选择五个预设并拖动、缩放原图，输出固定2K，不提供1K或4K分辨率选项；Flux和Sunburst扩图也采用同一产品限制。服务端依据真实图片重新计算目标尺寸：Qwen与Flux目标长边为2048px，Sunburst预设使用其自身2K画幅矩阵，原比例采用长边2048/16px对齐且原图比例不超过3:1的尺寸。原图输入限值保持Qwen/Flux最长边4096px、Sunburst最长边3840px，输入4K与输出固定2K相互独立，必要时等比缩放原图，并验证真实输出尺寸。工作台生成前核验飞书合同，完成后自动归档源图、结果图和工作流参数，并显示记录链接；独立 ComfyUI 导入图保存结果图片和本次提示词文本，不负责飞书同步。

工作台服务对`outpaintCanvas.resolution`省略时补`2K`，显式`1K`或`4K`在收费调用前拒绝。旧`expansion`请求只兼容实际输出为2K的几何：Flux/Qwen长边2048px，Sunburst尺寸属于其模型2K矩阵或满足原比例2K尺寸合同；非2K请求不静默改尺寸。历史任务和结果保留实际档位与尺寸，不按新版回写。

Qwen当前`2026-10-20.1`与Flux均只归档同次History中实际捕获的`SaveText`原文；Qwen不再拼入固定前缀或`Scene continuation`。正文缺失、空白或格式不合法时留空并标`finalPromptCaptured=false`，不补造历史Prompt。

**历史归档链路（保留当时实现）：** Qwen 从 `2026-10-19.3`、Flux 从 `2026-10-19.1` 开始读取同次 ComfyUI History 的 `SaveText` 实际正文，写入飞书「最终 Prompt」。Flux 只增加正文保存与透传，沿用原来的 Janus 问题和采样配置；Qwen 保存的是固定约束与 Janus 场景描述合成后的全文。文本缺失、空白或格式不合法时留空，并记录 `finalPromptCaptured=false`，不能用固定约束或用户输入冒充执行正文，也不为历史产物补造提示词。

独立 ComfyUI 画布采用原生 `LoadImage`，默认先等比适配到约 0.39MP、宽高 16px 对齐，再各扩展 128px；最终尺寸是适配后宽高各增加 256px。工作图遮罩尺寸与最终目标尺寸均从节点图动态读取，不写死示例图片的 1024 × 768，换图或修改扩边后仍沿用实际目标。这是底层手工工作流，默认示例尺寸不属于工作台产品档位，也不会自动锁定2K。工作台固定2K由服务执行，并直接注入已经适配的源图与精确扩边值；独立画布不提供这套目标分辨率自动计算。

执行 `node scripts/export-qwen-outpaint.mjs` 可从 `src/image-outpaint-qwen.mjs` 重新生成两份 JSON，当前运行图25个节点、独立图26个节点，版本为`2026-10-20.1`，不包含固定Prompt或拼接节点。导出器额外替换上传和等比预处理节点，将独立LoRA文件名匹配到当前导入环境的同版FP32，并显式设置AuraFlow sampling=flow；其他模型、Janus提示词链、统一推理尺度、遮罩采样与整图动态恢复参数来自执行图真源。SaveImage保留当前前端的images输出端口。画布中的动态宽高以已链接的INT控件端口保存，控件值为数值占位 `0`；已链接的STRING控件使用空字符串占位，`SaveText.text` 为强制输入端口而非文本控件，Janus seed 控件保持 `fixed`。API与可拖入画布的连接保持一致。

参数依据：[ComfyUI 官方 2511 示例](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511)、[LightX2V 2511 Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning)。早期实跑见 `.impeccable/review/qwen-outpaint/`；2026-10-19.1同源3:4/2K实跑见 `.impeccable/review/qwen-outpaint-alignment/validation.json`，证明1536×2048尺寸及尺度错位修复，用户复核仍有亮度缝，不作为无缝验收；当前策略取消回贴。未新增4K或多场景验收；模型目录准入、真实生成和画质评测应分别判断。

## 历史验证（按当时版本保留）

2026-10-19.2去回贴策略的同源同种子2K实跑与同采样32px/160px诊断对照见 `.impeccable/review/qwen-outpaint-seam/`。取消回贴后矩形色差明显减轻，仍可能有模型生成的软色带；原图区域有少量重建变化。该版本两份JSON已重导，789项自动化回归通过，不替代多场景画质验收。

2026-10-19.3的Janus接入和实际正文捕获已通过812项自动化回归，覆盖原图分析来源、拼接顺序、节点准入、STRING/INT导出连线以及History正文到飞书字段的内存联通。两引擎各真实GPU执行1次，Qwen输出1536×2048及1353字符Prompt，Flux输出1024×768及422字符Prompt；新记录的飞书最终Prompt已用用户身份回读，与同次History正文逐字一致。证据在 `.impeccable/review/janus-outpaint/`；未验证4K或多场景稳定性。

2026-10-19扩图固定2K收敛已通过817项全量自动化回归。重启后的三引擎配置均返回2K，六个1K/4K请求均在入队前返回400；浏览器上传样图并切换三个引擎，16:9预览均为2048×1152且无分辨率选项。证据见 `.impeccable/review/CLAUDE.md`。本轮未触发新增GPU任务、飞书写入或发布，不新增画质验收结论。

2026-10-19原比例补齐：首次进入默认原比例，六个比例按钮按两行三列展示；原比例换图后重新计算，用户手选预设后换图不清空选择。823项全量测试通过；实际浏览器上传864×1184样图，Flux预览1496×2048，Qwen/Sunburst预览1488×2048，均保持原比例意图及无分辨率控件。证据见 `.impeccable/review/CLAUDE.md`。长边2048的既有输出口径本轮不变；未触发GPU、Sunburst收费请求或飞书写入，不宣称网关自定义尺寸已实跑。Sunburst原比例依照[官方图像尺寸合同](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)实现，并保留实际产物尺寸核验。

2026-10-19独立导入复核：在用户当前ComfyUI通过Ctrl+O真实打开原文件成功，未复现整张JSON拒绝；用户拖拽静默的具体来源仍未确认。该服务器缺少BF16命名、已安装同版FP32 LoRA，独立导出图改为FP32并保存显式flow和SaveImage图片输出后再次实际载入，模型缺失提示消失，仅剩LoadImage待选择原图。824项回归通过，未点击运行、未新增GPU任务或飞书记录；证据在 `.impeccable/review/CLAUDE.md`。

## KS 原图直入2倍对照流

`KS-原图直入2倍.json` 可独立导入 ComfyUI：普通图片上传后校验每轴384–3200px，原图直接进入7B模型，动态读取原图短边×2作为输出目标，`max_resolution=0`。与原「KS版 · 2倍」相比，只移除0.75MP预缩放；7B/FP16 VAE、32块交换、CPU卸载、色彩和零噪声配置保留。原KS来源画布不变，详见 `KS-原图直入2倍说明.md`。已完成静态连线与参数核验，未实跑GPU；画质、性能和实际结果尺寸待同图同种子测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

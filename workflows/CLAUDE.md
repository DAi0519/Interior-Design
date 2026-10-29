# workflows/
> L2 | 父级: ../CLAUDE.md

成员清单
panorama-enhancement/ - R5_4原始执行图与来源SHA、20视角球面链路/原尺寸/输入保存适配和纯词光影说明
Flux2-Klein-精模双图-1K.json: 用户双图骨架的独立可导入画布，图1保设计/图2光影；源比例长边1024、16px对齐、4步CFG1Euler与referenceRule4静态快照
Flux2-Klein-精模双图-2K.json: 同合同长边2048画布，普通Flux及原附件不改，无SeedVR2后置超分
Flux2-Klein-精模双图说明.md: 双图角色、模型/节点依赖、尺寸和Prompt运行真源、原附件SHA及未实跑画质边界
KS-固定4K推理-4K交付.MaaS.json: KS直入27.1固定4096推理直接交付4096的10节点14线画布，现有数学节点按原图比例计算宽高，无后置放大
KS-固定4K推理-4K交付.MaaS.api.json: 独立4K执行图，仅input_img原图URL与result_img原始PNG；平台调用ID待发布，不传尺寸、不新增插件
KS-固定5K推理-6K交付.MaaS.json: KS直入27.1固定5120推理/6144交付的12节点19线整理画布，唯一input_img、result_img原始PNG，现有节点且无新增插件
KS-固定5K推理-6K交付.MaaS.api.json: 同正式固定值执行图，只适配URL输入与PNG报告；不含密钥/原图字节或生产调用ID，待平台发布联调

effect-beautification/ - CF效果图美化六份原始画布及参数/旁路/来源说明、借鉴氛围v13的六段Prompt v3本地候选与静态校验；运行时src单图工厂，含1920推理与输出档区别
flux2-mask-fill/ - 两份用户Flux2遮罩填充工作流的独立MaaS兼容版，原生条件/参考潜空间/噪声遮罩替代Painter，现有BiRefNet替代参考分割，含构建器、API/画布与验证证据
Flux-Fill-OneReward-Outpaint.json: 当前2026-10-19.1执行图导出的19节点/26连线独立ComfyUI画布，原生上传、每轴32–4096px/32对齐、默认四边各128px、Janus自动英文提示词与SaveText透传，OneReward FP8/20步/CFG1/guidance30；无地址、密钥或内嵌图片
Flux-Fill-OneReward-Outpaint说明.md: OneReward扩图导入方式、模型与自定义节点依赖、默认扩边/手工尺寸规则和导出核验边界
Qwen-Image-Edit-2511-Outpaint.json: 2026-10-20.1可拖入ComfyUI的26节点画布（运行图25节点），Janus question不变、未扩边原图描述原文直连SaveText/positive，不拼固定前缀/Scene continuation且无StringConcatenate、2511专用Lightning4步、约1MP共同尺度/遮罩/整图动态恢复且不回贴，含原生上传/等比预处理、当前导入环境同版FP32 LoRA、显式flow及STRING空/INT零占位
Qwen-Image-Edit-2511-Outpaint.api.json: 同一2026-10-20.1独立26节点图的API版本，上传后替换input.inputs.image，Janus直接分析上传图并将原文经SaveText传入positive，GetImageSize驱动mask与输出恢复，不硬编码独立输入宽高；独立同版FP32 LoRA/显式flow，无内嵌图片、地址或密钥
SeedVR2-7B-独立超分.json: 普通任意比例图片的独立 ComfyUI 7B 超分画布，原图直入、原生短边目标/长边上限控制，5 节点并保存 PNG
SeedVR2-7B-独立超分说明.md: 普通图片超分的模型依赖、原生尺寸控件、拆分边界和静态验证状态
KS-超分.json: 用户 KS 附件的节点/连线/参数语义归档，保留 0.75MP 与原图短边两倍规则；原字节 SHA-256 存在 extra.canvasLabSource，运行参数由 src 工厂适配
KS-原图直入2倍.json: 原 KS 移除0.75MP预缩放的独立9节点/10连线对照画布，上传原图每轴384–3200px，原图直入7B/FP16 VAE、动态短边×2与max_resolution=0，保留原KS推理参数及来源SHA-256
KS-原图直入2倍说明.md: KS原图直入2倍的导入、节点/模型依赖、动态尺寸合同、同图同种子对照与静态验证边界
README.md: Qwen/Janus模型与节点依赖、动态正文直通/无固定前缀与实际原文捕获和缺失事实、Ctrl+O/实体文件导入与模型目录差异、工作台原比例/固定2K/旧请求准入与原生手工画布的尺寸区别、运行25/独立26节点重新导出方式及保留历史固定段记录的分版本验证边界
CLAUDE.md: 本模块地图；OneReward画布按当前object_info从Flux执行真源投影，Qwen两份JSON由scripts/export-qwen-outpaint.mjs生成，SeedVR2独立图以附件SHA-256追溯

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

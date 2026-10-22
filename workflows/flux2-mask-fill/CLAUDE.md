# flux2-mask-fill/
> L2 | 父级: ../CLAUDE.md

成员清单

validation/ - 合成样本节点执行与飞书回读证据，含新重建附件只读审计/独立1024条件链对照，保留Prompt ID/真实输出/实际尺寸与指纹，不替代完整质量验收
build.mjs: Node 原生导出器，从两份附件的采样/遮罩/裁剪参数与实机 object_info 构造原生条件链，将原默认移除冰箱短指令改为实测英文指令，生成画布/API 图并验证端口、枚举和连线；不执行 GPU 任务
FLUX.2_遮罩提示词填充_MaaS兼容.json: 提示词遮罩填充的独立 ComfyUI 画布，原生条件/参考潜空间/噪声遮罩替代 Painter，保留裁剪回贴
FLUX.2_遮罩提示词填充_MaaS兼容.api.json: 同一提示词工作流的 API 图，input.inputs.image 为待上传图片名
FLUX.2_遮罩参考图填充_MaaS兼容.json: 参考图遮罩填充画布，已安装的 LL BiRefNet 替代 LayerMask 抠图节点，保留参考图裁剪与统一尺寸
FLUX.2_遮罩参考图填充_MaaS兼容.api.json: 同一参考图工作流的 API 图，额外 reference.inputs.image 为参考图片名
validation.json: 两份原附件 SHA-256、缺失类型、生成图结构与实机节点合同验证回执，不等于 GPU 成功或质量验收
README.md: 节点替换依据、模型与采样参数、输入方式、行为差异和实测边界

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

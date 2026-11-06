# upscale-trials/
> L2 | 父级: ../CLAUDE.md

成员清单
supir.mjs: SUPIR Q＋Juggernaut XL v9的独立双分支实验图，共享一次随机VAE编码、同seed/参数，仅正向词不同；当前加载器环境不兼容
tile.mjs: 原生SDXL＋TTPlanet v2的低去噪图生图超分实验，复用两版提示词、单编码和相同采样条件
trial.test.mjs: 两路线单次编码共享、唯一正向变量、32对齐与请求级产物身份检查，不提交GPU
run.mjs: 复用ComfyUI客户端和节点准入的supir/tile单次实验，保存原件/实际输入/双PNG/Prompt及SHA；默认仅准备，提交账本禁止自动重跑
README.md: 实验命令、1024输入到2K推理与补边裁切、两路线参数、SUPIR兼容故障、上游来源和验收边界

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

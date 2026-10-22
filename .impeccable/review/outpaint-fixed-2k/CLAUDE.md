# outpaint-fixed-2k/
> L2 | 父级: ../CLAUDE.md

成员清单

desktop.png: 独立浏览器上传原样图后的固定2K扩图预览，分辨率控件已移除，不触发模型生成
validation.json: 三引擎运行态固定2K、非2K请求拒绝、上传与构图DOM、测试及验证边界
tests.log: 本轮817项全量自动化回归记录，不代表新增GPU画质验收
CLAUDE.md: 扩图收敛为固定2K的合同与浏览器证据地图

上传原图上限与输出档位分开；Flux/Qwen保留4096px上传并适配2K，Sunburst沿用3840px输入与模型自身2K矩阵。没有新增GPU任务或飞书记录，历史结果与独立ComfyUI底层图不因产品档位改变而改写。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

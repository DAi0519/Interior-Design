# docs/
> L2 | 父级: ../CLAUDE.md

成员清单
oneapi-image-edit-call.http: sunburst.10固定1K/medium完整调用模板，蓝色圈选Responses异步提交/GET轮询及涂抹Images edits同步两条路径、鉴权占位/完整Prompt，不含真实密钥
oneapi-image-edit-box-request.json: 蓝色圈选加参考图的Responses完整后台JSON请求体，background/input/tools、完整固定Prompt及用户指令占位，3:2原图的1K/medium示例，不传mask
oneapi-image-edit-mask-request.json: 涂抹加参考图的OneAPI完整JSON请求体，独立alpha遮罩和完整Prompt，3:2原图的1K/medium示例，不混入业务字段
gpt-image-edit-handoff.html: sunburst.10固定1K/medium单文件交接表，业务输入/矩形与自由圈选坐标/异步提交查询JSON及透明mask同步分流/完整PNG返回、圈选与涂抹区别、统一Prompt及一个完整例子、简明输入像素文件限制，离线转发打印
gpt-image-mask-fill-contract.md: GPT局部重绘尺寸容量/默认1K-medium，sunburst.10无mask原生异步/透明mask同步、600秒总等待/即时任务ID和未完成腾讯真实出图证据边界、画笔/矩形/自由闭合圈选并存、多边形归一化与像素合同/能力准入、形状中立Prompt与实际送模蓝线PNG独立归档、完整原生字节直出及历史证据
image-mask-fill.md: 无mask后台任务/透明mask同步及Tencent真实路由待验；三模型双模式入口/版本错配排查、分模型档位、GPT画笔/矩形/自由闭合圈选三历史互斥提交、推荐占位与异常提示、实际遮罩/五附件归档及测试发布证据边界
image-upscale-output-size.md: KS26.3整图严格20MP补齐预算、等比偶数推理尺寸与插值交付、主/Beta同源准入、15分钟及20.1/21.1/26.1/26.2旧结果恢复
room-renovation.md: 空房Agent v34柜体实体体积/原墙面/落地及壁挂分类规则、旧房改造两阶段范围、主工作台使用、API包装参数、三图恢复/失败保留、两条飞书关联记录及真实效果验收边界

ui-selects.md: 共享下拉组件库入口、普通/搜索/多选变体与示例、含4px选项行距的唯一视觉真源、模态内挂载、键盘与动态销毁合同

image-outpaint-interactive-canvas.md: AI扩图默认原比例/五预设及固定2K；Beta跨功能图片样本复用/新建归属与四工作流多选、同样本共用居中画幅/倍率、独立普通参数与飞书归档；Sunburst原比例16px/3:1补边、16384px原图保护/3840px实际输入等比适配与追溯、原图输入/旧请求准入、Qwen2026-10-20.1的Janus原文直通/不拼固定前缀或Scene continuation与实际SaveText原文归档、连续主画布/四角缩放及整数提交、Qwen同尺度推理/整图恢复无回贴、运行25/独立26节点导出与历史实现边界，区分合同测试和真实生成/画质证据

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

# public/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护浏览器界面成员清单
config-refresh.js: 飞书配置刷新交互控制器，让 Style DNA 与场景融合 Agent 双入口共享互斥状态，串行触发两类配置强制刷新并分发脱敏版本目录
connection-center.js: 运营首次运行控制器，管理 OneAPI 本机记忆、评测页 `?connect=api` 直达、CLI/用户/中文授权能力/Base 状态、飞书 Device Flow 与焦点圈闭/归还
connection-center.css: 连接中心视觉层，提供 OneAPI/飞书无套框双分区、统一中性 32px 动作按钮、状态行、本机记忆控件、授权二维码与窄屏布局
generation-actions.js: 白模生成动作状态控制器，以融合输入指纹管理首次单按钮、可复用双按钮、忙碌状态与强制重新融合回调，并导出纯状态推导
generation-actions.css: 白模生成动作视觉层，提供无固定数量胶囊的居中主按钮，以及 65/35 同高度、同字号、同图标尺度及同投影的深色/中性双按钮布局与交互反馈
final-model-availability.js: 最终出图模型展示解释器，五个 OneAPI 模型与一个 ComfyUI 工作流统一可选且不暴露内部目录状态，由真实生成请求裁决
model-capabilities.js: 双 Provider 模型能力解释器，以纯函数推导单图/多图文案、数量上限、合法比例/分辨率选项与原图尺寸摘要
lark-permission-labels.js: 飞书授权文案解释器，把最小 Scope 编码映射为连接中心可理解的中文能力名称并保留未知项诊断
custom-select.js: 原生 select 渐进增强层，提供 Style DNA、场景融合 Agent、出图模型、参数及 Benchmark 的自定义列表框，在 pointerdown 固定目标焦点后以 click 提交选择并保留完整键盘操作
custom-select.css: Light Command Center 自定义下拉视觉，提供配置区、参数区及 Benchmark 的原生控件隐藏、38px 对齐触发器、先完整利用真实剩余宽度且仅在不足时截断的文案、深色选中态、焦点与低动效规则
product-navigation.css: 生图工作台与模型评测共享的三段式顶栏视觉真源，固定品牌在左、产品切换居中、连接状态在右，并统一 Logo 锁定、选中态与窄屏收敛
prompt-agent-version-select.js: 场景融合 Agent 版本选择控制器，只渲染服务端脱敏已上架目录、默认最高版本并在当前标签页记忆选择
style-dna-chat.css: Style DNA 反推预览视觉，提供图片缩略图/PDF 文件卡、与左栏共用起始线且在大屏等高的无顶部分隔线对话面板、独立滚动消息流、未发布 JSON 草稿卡片与自适应多行输入框
index.html: 精简工作台语义骨架，提供运营连接中心、顶部居中的生图/评测切换、默认白模渲染、场景融合 Agent/融合基模/出图模型下拉、隔离的反推模型与脱敏 Prompt 版本选择、支持仅附件发送的图片/PDF 对话输入框、生成结果及飞书记录入口
benchmark.html: 继承 Canvas Lab 工作台语义、共享三段式顶栏、生图自定义选择器及用户 OneAPI 模型目录的独立评测页，以单层横向五步流程条串联样本集、实验配置、批量运行、AI 评分和数据分析，并把“同步”并入当前样本集管理动作组
benchmark.css: 继承 Light Command Center 暖灰画布、近黑主动作/浅色管理动作、低圆角与单层面板规则的评测基础视觉层，提供上方横向流程条、下方填满剩余视口的完整工作面板、实验分析筛选/飞书跳转、表单、计划、指标漏斗与表格
benchmark-responsive.css: Benchmark 响应式覆盖层，提供共享产品顶栏下的流程条收敛、内容双栏降级、窄屏单栏动作重排与低动效规则
benchmark-dataset.css: Benchmark 样本集管理增量视觉层，提供同层工具栏、行内新建/重命名编辑器、单一职责的 AI 模型选择、空间与五维逐图 AI 标签审核、人工准入控制、空态与窄屏排列
benchmark-experiment.css: Benchmark 实验配置增量视觉层，提供系统实验 ID 组合控件、12 栏实验元信息、三层参数网格、双栏候选模型、单变量锁提示、模型不可用状态和窄屏重排
benchmark-run.css: Benchmark 运行与评分任务增量视觉层，提供任务阶段、Base 落库状态、用户影响/下一步/折叠技术详情、评分实验摘要、按任务归属安放的进度卡、任务 ID 与窄屏重排
benchmark-review.css: Benchmark AI 评分结果视觉层，提供五项摘要、逐图三维分数、可用结论、问题标签、长原因、横向表格与响应式降列
benchmark-experiment.js: Benchmark 实验草稿控制器，生成带秒级时间戳和随机后缀的系统实验 ID，复用生图资源目录载入模板并计算候选模型合法画幅/分辨率/格式/质量档交集，输出冻结配置输入
benchmark-app.js: 评测工作台浏览器编排器，以样本集为 CRUD 和筛选边界，复用全局连接状态并从用户 OneAPI 可用视觉模型中选择和记忆打标模型，批量参考图逐图调用 `sample-labeling@v2` 生成空间与五维标签、保持样本准入人工控制并按选择顺序生成 Case ID，file 预览仅禁用服务动作，编排系统实验 ID/草稿预演、已完成实验直接评分/结果载入、任务归属面板、当前集按实验 ID 分析及分流到横评对比/运行明细/结果报告的飞书筛选跳转
benchmark-job-ui.js: Benchmark 任务呈现组件，统一生成/评分任务的阶段、进度、Base 落库状态、失败影响与可执行恢复建议
benchmark-review-ui.js: Benchmark AI 评分控制器，从 Base 成功结果目录筛选当前样本集可评分实验，默认最近完成实验，按 Run 仅选择最新正式三维评分并渲染五项摘要/结论/问题/原因，对旧协议显示隔离提示，维护评分模型与提交输入，并确保评分任务留在 AI 评分面板
styles.css: 紧凑输入控制、轻量配置刷新、多参考图列表、弹层与响应式结构规则
result.css: 与左栏标题对齐的精简结果工具栏、无内框无投影且不会挤出面板的结果图、空态、加载态、图片态与错误态结构视觉
theme.css: 生图工作台浅色设计令牌、供共享导航复用的磨砂顶栏基底、桌面视口等高双栏、左栏独立滚动、紧凑下拉、低圆角控件与业务区最终主题覆盖层
app.js: 生成状态控制器，以白模和 Seedream 5.0 初始化，消费 model-capabilities.js 协调双 Provider 模型、连接边界、提示词复用、即时结果及后台飞书状态轮询
image-ratio.js: 无状态画幅适配工具，通过浏览器解码读取上传图宽高、格式化原图比例并从当前模型矩阵选择最近合法比例
style-dna-chat.js: Style DNA 反推浏览器控制器，读取脱敏已上架 Prompt 版本目录与图片/PDF 附件策略，只提交版本号而不接收正文，并提供版本刷新、上传边界、首轮附件、后续纯文字修正、多轮消息、草稿渲染、复制与新对话
workbench-utils.js: 无状态浏览器基础设施，统一同源 JSON API、图片地址/文件读取、字节与生成结果摘要格式化及原生下拉填充
icons/: 外部图标资产模块，提供 Heroicons 加号与上箭头 SVG，详见 icons/CLAUDE.md

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

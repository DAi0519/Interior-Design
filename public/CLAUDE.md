# public/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护浏览器界面成员清单
config-refresh.js: 飞书配置刷新交互控制器，让 Style DNA、场景融合 Agent 与精模 Prompt 入口共享互斥状态并分发三类脱敏目录
connection-center.js: 运营首次运行控制器，管理 OneAPI 本机记忆、评测页 `?connect=api` 直达、CLI/用户/中文授权能力/Base 状态、飞书 Device Flow 与焦点圈闭/归还
connection-center.css: 连接中心视觉层，提供 OneAPI/飞书无套框双分区、统一中性 32px 动作按钮、状态行、本机记忆控件、授权二维码与窄屏布局
generation-actions.js: 白模生成动作状态控制器，以融合输入指纹管理首次单按钮、可复用双按钮、忙碌状态与强制重新融合回调，并导出纯状态推导
generation-actions.css: 白模生成动作视觉层，提供无固定数量胶囊的居中主按钮，以及 65/35 同高度、同字号、同图标尺度及同投影的深色/中性双按钮布局与交互反馈
final-model-availability.js: 最终出图模型展示解释器，五个 OneAPI 模型与一个 ComfyUI 工作流统一可选且不暴露内部目录状态，由真实生成请求裁决
model-capabilities.js: 双 Provider 模型能力解释器，以纯函数推导单图/多图文案、数量上限、合法比例/分辨率选项与原图尺寸摘要
model-multi-select.js: 出图模型多选控制器，提供至少一项、最多四项的纯选择规则与紧凑按钮组
generation-batch.js: 多模型生成领域层，逐模型适配合法参数并以并发度二保序执行最多四项、保留部分失败
generation-results.js: 多模型结果呈现层，渲染单图/两列画廊、原位失败卡、逐图直接下载及独立飞书同步状态
lark-permission-labels.js: 飞书授权文案解释器，把最小 Scope 编码映射为连接中心可理解的中文能力名称并保留未知项诊断
custom-select.js: 原生 select 渐进增强层，提供 Style DNA、场景融合 Agent、出图模型、参数及 Benchmark 的自定义列表框，在 pointerdown 固定目标焦点后以 click 提交选择并保留完整键盘操作
custom-select.css: Light Command Center 自定义下拉视觉，提供配置区、参数区及 Benchmark 的原生控件隐藏、38px 对齐触发器、先完整利用真实剩余宽度且仅在不足时截断的文案、深色选中态、焦点与低动效规则
product-navigation.css: 生图工作台与模型评测共享的三段式顶栏视觉真源，固定品牌在左、产品切换居中、连接状态在右，并统一 Logo 锁定、选中态与窄屏收敛
prompt-agent-version-select.js: 场景融合 Agent 版本选择控制器，只渲染服务端脱敏已上架目录、默认最高版本并在当前标签页记忆选择
refined-prompt-version-select.js: 精模固定 Prompt 版本控制器，消费脱敏目录、标记内部测试草稿并在当前标签页记忆选择
style-dna-chat.css: Style DNA 反推预览视觉，提供图片/PDF 附件卡、等高对话面板、独立滚动消息流与未发布 JSON 草稿卡片
index.html: 精简工作台语义骨架，提供精模/白模/自由生图/风格反推、最多四模型按钮组、脱敏版本配置、多结果画廊与飞书记录入口
benchmark.html: 继承 Canvas Lab 工作台语义的独立评测页，以横向五步流程串联左侧紧凑管理录入/右侧列表的样本工作区、可分次累加的已有分类/AI 分类双路径样本治理、因子优先的八类质量配置单变量实验、停止/继续出图与失败重试、seven_evaluate_v3.1 单次/断点继续 1–5 小数 AI 评分和数据分析
benchmark.css: 继承 Light Command Center 暖灰画布、近黑主动作/浅色管理动作、低圆角与单层面板规则的评测基础视觉层，提供与生图页同构的单层输入焦点反馈、上方横向流程条、下方填满剩余视口的完整工作面板、实验分析筛选/飞书跳转、表单、指标漏斗与表格
benchmark-responsive.css: Benchmark 响应式覆盖层，提供共享产品顶栏下的流程条收敛、内容双栏降级、窄屏单栏动作重排与低动效规则
benchmark-dataset.css: Benchmark 样本集管理增量视觉层，提供左侧紧凑样本集工具栏与录入/右侧样本列表、同高同暖灰底的管理/表头带、行内新建/重命名编辑器、空间类型来源双路径、AI 标签模型、逐图标签审核、人工准入控制、空态与窄屏排列
benchmark-experiment.css: Benchmark 实验配置增量视觉层，提供上置实验因子、选择器与计数同组、隐藏重复候选标题、紧凑候选项、四列 220px 固定参数栅格、不可用状态和窄屏重排
benchmark-run.css: Benchmark 运行与评分任务增量视觉层，提供任务阶段、Base 落库状态、停止/继续出图与失败出图重试动作、用户影响/下一步/折叠技术详情、评分实验摘要、按任务归属安放的进度卡、任务 ID 与窄屏重排
benchmark-review.css: Benchmark AI 评分视觉层，移除独立协议说明卡，提供单栏横向配置、轻量三维提示、六项摘要、逐图三维/加权分、结构化问题与响应式表格
benchmark-experiment.js: Benchmark 通用实验因子控制器，用注册表管理八类因子的字段、候选源和互斥展示，联动模型输出能力并输出 `variableKey + variantValues` 草稿
benchmark-app.js: 评测工作台浏览器编排器，负责左右样本工作区空态、分次累加文件队列/稳定缩略图、已有空间分类保护/未分类 AI 识别、五维打标、通用单变量计划、停止/继续出图、失败 Run 重试、评分断点继续、横评跳转、评分分析与任务轮询
benchmark-sample-ui.js: Benchmark 样本纯交互规则层，集中维护文件去重/草稿初始化、分类/五维选项、分类来源动态文案、AI 回填合并和草稿状态，阻止重复图片和模型覆盖已有人工空间分类
benchmark-job-ui.js: Benchmark 任务呈现组件，统一生成/评分任务的阶段、Base 真源进度、停止/继续出图状态、失败出图重试输入、评分失败卡断点继续动作、持久化实验任务投影、失败影响与可执行恢复建议
benchmark-review-ui.js: Benchmark AI 评分控制器，从 Base 成功结果目录筛选当前样本集可评分实验，默认最近完成实验和 GPT 评分模型，部分完成时按剩余 Run 显示继续评分，按 Run 仅选择最新 v3.1 评分并渲染六项摘要/三维加权分/结论/结构化问题/本地校准原因，对旧协议显示隔离提示，并确保评分任务留在 AI 评分面板
styles.css: 紧凑输入控制、轻量配置刷新、多参考图列表、弹层与响应式结构规则
result.css: 结果工具栏、空态/加载态/错误态、单图/四图画廊与逐图下载动作视觉
theme.css: 生图工作台浅色设计令牌、桌面等高双栏、紧凑配置、独立卡片式功能入口与出图模型按钮组最终主题覆盖层
app.js: 生成状态编排器，以白模和 Seedream 5.0 初始化，协调精模/白模/自由生图、最多四模型批量、连接边界与提示词复用
image-ratio.js: 无状态画幅适配工具，通过浏览器解码读取上传图宽高、格式化原图比例并从当前模型矩阵选择最近合法比例
style-dna-chat.js: Style DNA 反推浏览器控制器，读取脱敏已上架 Prompt 版本目录与图片/PDF 附件策略，只提交版本号而不接收正文，并提供版本刷新、上传边界、首轮附件、后续纯文字修正、多轮消息、草稿渲染、复制与新对话
workbench-utils.js: 无状态浏览器基础设施，统一同源 JSON API、图片地址/文件读取、字节与生成结果摘要格式化及原生下拉填充
icons/: 外部图标资产模块，提供 Heroicons 加号与上箭头 SVG，详见 icons/CLAUDE.md

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

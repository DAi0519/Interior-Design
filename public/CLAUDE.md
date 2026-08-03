# public/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护浏览器界面成员清单
config-refresh.js: 飞书配置刷新交互控制器，让 Style DNA 与场景融合 Agent 双入口共享互斥状态，串行触发两类配置强制刷新并分发脱敏版本目录
connection-center.js: 运营首次运行控制器，管理 OneAPI 本机记忆、CLI/用户/中文授权能力/Base 状态、飞书 Device Flow 与焦点圈闭/归还
connection-center.css: 连接中心视觉层，提供 OneAPI/飞书无套框双分区、统一中性 32px 动作按钮、状态行、本机记忆控件、授权二维码与窄屏布局
generation-actions.js: 白模生成动作状态控制器，以融合输入指纹管理首次单按钮、可复用双按钮、忙碌状态与强制重新融合回调，并导出纯状态推导
generation-actions.css: 白模生成动作视觉层，提供无固定数量胶囊的居中主按钮，以及 65/35 同高度、同字号、同图标尺度及同投影的深色/中性双按钮布局与交互反馈
final-model-availability.js: 最终出图模型展示解释器，四个固定模型统一可选且不向使用者暴露内部目录状态，由真实生成请求裁决
lark-permission-labels.js: 飞书授权文案解释器，把最小 Scope 编码映射为连接中心可理解的中文能力名称并保留未知项诊断
custom-select.js: 原生 select 渐进增强层，提供 Style DNA、场景融合 Agent、出图模型、参数与反推模型的自定义列表框、详情同步、稳定指针选择和键盘操作
custom-select.css: Light Command Center 自定义下拉视觉，提供配置区与参数区原生控件隐藏、触发器版本反馈、深色选中态、单行辅助信息、焦点与低动效规则
prompt-agent-version-select.js: 场景融合 Agent 版本选择控制器，只渲染服务端脱敏已上架目录、默认最高版本并在当前标签页记忆选择
style-dna-chat.css: Style DNA 反推预览视觉，提供图片缩略图/PDF 文件卡、与左栏共用起始线且在大屏等高的无顶部分隔线对话面板、独立滚动消息流、未发布 JSON 草稿卡片与自适应多行输入框
index.html: 精简工作台语义骨架，提供运营连接中心、默认白模渲染、模型下拉、无虚假生成张数的同构图标双按钮、反推对话、生成结果及飞书记录入口
styles.css: 紧凑输入控制、轻量配置刷新、多参考图列表、弹层与响应式结构规则
result.css: 与左栏标题对齐的精简结果工具栏、无内框无投影且不会挤出面板的结果图、空态、加载态、图片态与错误态结构视觉
theme.css: 浅色设计令牌、磨砂液态玻璃顶栏、桌面视口等高双栏、紧凑下拉、低圆角控件与最终主题覆盖层
app.js: 生成状态控制器，以白模和 Seedream 初始化，并协调目录提示型出图模型选择、原图比例、融合输入指纹、提示词复用/强制重算、即时结果及后台飞书状态轮询
image-ratio.js: 无状态画幅适配工具，通过浏览器解码读取上传图宽高、格式化原图比例并从当前模型矩阵选择最近合法比例
style-dna-chat.js: Style DNA 反推浏览器控制器，读取脱敏已上架 Prompt 版本目录与图片/PDF 附件策略，只提交版本号而不接收正文，并提供版本刷新、上传边界、首轮附件、后续纯文字修正、多轮消息、草稿渲染、复制与新对话
workbench-utils.js: 无状态浏览器基础设施，统一同源 JSON API、HTTPS 图片地址与原生下拉填充
icons/: 外部图标资产模块，提供 Heroicons 加号与上箭头 SVG，详见 icons/CLAUDE.md

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

# public/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护浏览器界面成员清单
config-refresh.js: 飞书配置刷新交互控制器，让 Style DNA 与 Prompt Agent 双入口共享互斥状态，串行触发两类配置强制刷新并渲染版本反馈
connection-center.js: 运营首次运行控制器，管理 OneAPI 本机记忆、CLI/用户/Scope/Base 状态、飞书 Device Flow 与焦点圈闭/归还
connection-center.css: 连接中心视觉层，提供 OneAPI/飞书无套框双分区、统一中性 32px 动作按钮、状态行、本机记忆控件、授权二维码与窄屏布局
custom-select.js: 原生 select 渐进增强层，提供 Style DNA、融合 Agent 与反推模型的自定义列表框、详情同步、稳定指针选择和键盘操作
custom-select.css: Light Command Center 自定义下拉视觉，提供无横向溢出的原生控件隐藏、触发器版本反馈、深色选中态、单行辅助信息、焦点与低动效规则
style-dna-chat.css: Style DNA 反推预览视觉，提供图片缩略图/PDF 文件卡、与左栏共用起始线且在大屏等高的无顶部分隔线对话面板、独立滚动消息流、未发布 JSON 草稿卡片与自适应多行输入框
index.html: 精简工作台语义骨架，提供运营连接中心、默认白模渲染、隔离的反推模型与脱敏 Prompt 版本选择、支持仅附件发送的图片/PDF 对话输入框、生成结果及飞书记录入口
styles.css: 紧凑输入控制、轻量配置刷新、多参考图列表、弹层与响应式结构规则
result.css: 与左栏标题对齐的精简结果工具栏、无内框无投影结果画布、空态、加载态、图片态与错误态结构视觉
theme.css: 浅色设计令牌、磨砂液态玻璃顶栏、无伪缝模型卡、轻量配置刷新、低圆角控件、无图片投影结果区与最终主题覆盖层
app.js: 生成状态控制器，以白模渲染初始化并协调最近合法比例/手动覆盖、连接中心、风格反推隔离、配置刷新、图片上传、即时结果及后台飞书状态轮询
image-ratio.js: 无状态画幅适配工具，通过浏览器解码读取上传图宽高、格式化原图比例并从当前模型矩阵选择最近合法比例
style-dna-chat.js: Style DNA 反推浏览器控制器，读取脱敏已上架 Prompt 版本目录与图片/PDF 附件策略，只提交版本号而不接收正文，并提供版本刷新、上传边界、首轮附件、后续纯文字修正、多轮消息、草稿渲染、复制与新对话
workbench-utils.js: 无状态浏览器基础设施，统一同源 JSON API、HTTPS 图片地址与原生下拉填充
icons/: 外部图标资产模块，提供 Heroicons 加号与上箭头 SVG，详见 icons/CLAUDE.md

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

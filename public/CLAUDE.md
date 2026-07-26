# public/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护浏览器界面成员清单
config-refresh.js: 飞书配置刷新交互控制器，让 Style DNA 与 Prompt Agent 双入口共享互斥状态，串行触发两类配置强制刷新并渲染版本反馈
custom-select.js: 原生 select 渐进增强层，提供 Style DNA、融合 Agent 与反推模型的自定义列表框、详情同步、稳定指针选择和键盘操作
custom-select.css: Light Command Center 自定义下拉视觉，提供无横向溢出的原生控件隐藏、触发器版本反馈、深色选中态、单行辅助信息、焦点与低动效规则
style-dna-chat.css: Style DNA 反推预览视觉，提供撑满左栏且不可拖拽的 Prompt 编辑器、顶部恢复入口、视口内定高对话面板、独立滚动消息流、未发布 JSON 草稿卡片与工具栏不覆盖内容的自适应多行 Codex 式输入框
index.html: 精简工作台语义骨架，以白模渲染为默认功能，并提供隔离的反推模型、撑满左栏的 Prompt 配置、支持仅图片发送的对话输入框、生成结果及飞书记录入口
styles.css: 紧凑输入控制、轻量配置刷新、多参考图列表、弹层与响应式结构规则
result.css: 与左栏标题对齐的精简结果工具栏、无内框无投影结果画布、空态、加载态、图片态与错误态结构视觉
theme.css: 浅色设计令牌、磨砂液态玻璃顶栏、轻量配置刷新、低圆角控件、无图片投影结果区与最终主题覆盖层
app.js: 生成状态控制器，以白模渲染初始化并协调风格反推模式隔离，驱动配置刷新、版本化风格编码、图片上传、即时结果及后台飞书状态轮询
style-dna-chat.js: Style DNA 反推浏览器控制器，读取并编辑服务端默认 Prompt，管理输入框逐行增高与上限滚动、首轮仅图片或图片加要求、后续纯文字修正、附件逐轮清理、多轮消息、草稿渲染、复制与新对话
workbench-utils.js: 无状态浏览器基础设施，统一同源 JSON API、HTTPS 图片地址与原生下拉填充
icons/: 外部图标资产模块，提供 Heroicons 加号与上箭头 SVG，详见 icons/CLAUDE.md

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

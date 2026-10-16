# test/
> L2 | 父级: ../CLAUDE.md

成员清单

beta-base-schema.test.mjs: live Store verifier 的实时三表读取、字段/类型/功能与状态房型选项/单多选/附件/关联漂移在入队和样本保存前阻断、晚遇 CLI 合同错误不再次调用模型的内存集成测试
beta-id-flow.test.mjs: ID 批次成员/功能绑定、超过20MB整集零原图入队、两并发按需取图、实际单图8MB/MIME保护、草稿显式空状态及逐张幂等保存/完成回读测试，使用内存CLI/模型替身
beta-sample-library.test.mjs: 浏览器样本库24MB逐张读取/上传、稳定ID、部分失败后只重试剩余项、全景 2:1 源图准入与拒绝后释放预览、保存忙碌守卫与完成回读后ready、元数据无原图测试，使用假DOM/假API

effect-beautification-ui.test.mjs: 效果图美化浏览器合同，六组合与失效缺省、独立单图主题、脱敏版本/就绪无常驻说明/失败原因及不携带环境控件的挂载语义骨架，使用纯函数/静态源码不触发真实生成

image-outpaint.test.mjs: AI扩图EXIF/真实4K输入与原字节合同、旧四边与保护上限、OneReward FP8/Flux Fill dev候选独立文件/dtype能力探测及失败不缓存、执行前实时模型复核与身份透传、HTTP未知400/不可用409零入队及专用客户端/OneAPI隔离、扩图飞书Schema入队阻断与pending归档测试，不提交GPU任务
image-outpaint-workflow.test.mjs: AI扩图1082来源/643线索、4K输入/32与8对齐、OneReward FP8默认与原版Flux Fill UNET/dtype唯一变化及metadata身份、Janus/采样参数与18节点闭合保真、传输适配/请求隔离及实际尺寸追溯测试，不提交GPU任务
image-outpaint-oneapi.test.mjs: Sunburst 与 Flux 4K 独立的3840输入边界、原尺寸/透明画布/不透明原图矩形 mask、27档位的16px/像素/边长/比例边界、实际产物/身份/费用、错尺寸/多图拒绝且不重复收费调用、当前 Key 权限隔离、专用客户端与 imageEdit 入队合同测试，使用假客户端
image-outpaint-canvas.test.mjs: 目标画布共享规划的五比例/1K–4K双引擎映射、源图按需适配/同尺寸留白/定位总和、非法参数400、服务端真实解码/EXIF后重算与实际resize提交字节、Sunburst透明画布/遮罩一致性及旧四边严格兼容测试，不提交GPU或付费任务
image-outpaint-scale.test.mjs: 三引擎固定目标下显式scale/动态32px下限/非法范围、真实Sharp等比重采样与EXIF、零扩展提交阻断、scale/实际源图字节归档测试，缺省旧合同保持兼容
image-outpaint-fixture.mjs: 扩图控制器共享内存DOM/冒泡与捕获事件/可控RAF/写入统计及transform视觉矩形夹具，供缩放/性能/连续轨迹测试复用
image-outpaint-performance.test.mjs: 高频输入合帧/末坐标提交/失效帧取消与局部绘制隔离测试，覆盖30/60/120Hz输入和60Hz帧调度，不访问网络或GPU
image-outpaint-continuous.test.mjs: 三引擎100帧0.1/0.2px真实绑定轨迹与旧网格冻结对照、四角固定对角/原图比例、松手及重绘无回弹、4K仅transform无源图布局写入、提交仍满足整数模型网格与误差界限测试，不访问网络或GPU
image-outpaint-transform.test.mjs: 四角锚点与边界、鼠标/触屏/键盘缩放和取消、倍率预设/range连续端点/自定义/提示、浮层重排关闭及移动与缩放互斥的DOM交互测试，不调用网络或GPU
image-outpaint-workspace.test.mjs: 主画布DOM节点/事件保留、四种任务阶段与页签选择保持、键盘焦点、原结果/飞书链接保留、隐藏构图时关闭浮层、上传默认预览/旧任务恢复与完成不覆盖新构图、新任务身份及跨功能ARIA恢复的内存交互测试，不调用模型或网络
image-outpaint-ui.test.mjs: Flux/Qwen/Sunburst三引擎切换、双Flux模型下拉/服务默认值/失效保持并阻断/空目录禁止提交、Qwen与Sunburst隐藏并剥离Flux模型参数、比例/1K–4K固定目标与Qwen原尺寸16px合同、鼠标/触摸/键盘构图及只恢复位置的居中、默认1.5倍和带scale请求、引擎/换图状态重置、权限刷新保留构图与单份原图请求测试
image-outpaint-qwen.test.mjs: 独立2511/专属4步LoRA隔离、遮罩采样与最终同遮罩原图合成、16对齐/源图扩边闭合/输入投影、实时节点端口与输出槽位漂移阻断、PNG实测尺寸/摘要及跨请求旧产物零下载测试，不访问远端或GPU
image-outpaint-archive.test.mjs: 三引擎四模型的Prompt/实际源图/画布/模型/产物/费用投影、EXIF适配字节、错尺寸或失败零同步、已完成产物无GPU补写合同与超分本机路径回归
image-outpaint-qwen-export.test.mjs: Qwen画布/API保存产物与真源一致、原生上传/16对齐等比预处理差异、双向端口/类型/槽位/无环、KSampler随机策略控件防错位及无图片凭据地址的离线交付验证
image-outpaint-qwen-service.test.mjs: Qwen 原尺寸与EXIF/五比例16px目标/按需适配字节、独立能力失败恢复与成功缓存、执行前409零GPU/真实模型身份/错尺寸拒绝、专用客户端与OneAPI隔离、飞书归档及HTTP comfyUi阶段合同测试，不提交GPU任务
image-outpaint-drag.test.mjs: 保留旧扩图预处理与四边求和纯函数的兼容、位移换算及非负边界测试，真实交互由image-outpaint-ui.test.mjs覆盖
image-outpaint-drag-integration.test.mjs: 保留旧固定画布的拖动几何公式、边界夹紧与预处理尺寸不变测试，真实绑定拖动保留目标比例由image-outpaint-ui.test.mjs覆盖

CLAUDE.md: 本模块地图，维护自动化测试成员清单

app-update.test.mjs: GitHub 正式 Release 与 SemVer/标准 ZIP 准入、匿名查询、HEAD 兜底不伪造说明、失败降级、超时、缓存与并发去重测试，不访问外部网络
app-update-api.test.mjs: 最新正式版回执绑定、安装政策/安装前与替换前任务空闲、非法 URL/版本/不可检查/并发、待重启/恢复失败保护与 NDJSON 成功失败合同的内存 HTTP 测试
app-installer.test.mjs: 注入 Response 的真实临时 ZIP 安装测试，覆盖官方摘要、Git 源码保护/持久新目录、Release 原地同路径版本更新/旧模块删除/配置数据保留/事务失败回滚与恢复失败备份/人工恢复指引/重复安装阻断、目录竞态/ZIP 路径/重定向/截断/并发合同，不访问网络或启动服务
app-update-ui.test.mjs: 无外链的单一下载安装/按需检查/原位失败重试、发布模板亮点提取/非模板保留/空说明隐藏、完整安装终态/错误码/互斥、两模式确认/指导与未知模式回退、待重启/恢复失败回归，不下载或安装新版
custom-select.test.mjs: macOS/浏览器下拉回归测试，验证主指针在 click 前固定目标选项焦点、辅助按键不抢焦点、声明式向上菜单、Enter/Space 确认，并阻止内容宽度百分比导致的无效省略
choice-controls.test.mjs: 生图页功能、风格与出图模型三类按钮选择回归测试，验证共享高度、圆角、内距、字重、阴影、纯黑白字选中态与完整交互状态
generation-count.test.mjs: 单模型生成张数下拉回归测试，验证 1–4 张归一化、原生 select 渐进增强结构及向上菜单定位
product-navigation.test.mjs: 共享顶栏字体与全局动效回归测试，验证三页预加载同源 Inter Variable、Raycast OpenType 特性、全部 CSS 禁止 transition all/布局属性补间、三页静态首帧激活层、140ms 导航前双层 transform、反复点击重定向、原生链接降级与 reduced-motion 瞬时切换
raycast-accent.test.mjs: 跨工作台最终颜色层回归测试，验证冷白银灰顶栏、纯黑白字选中态、中性浅色普通按钮、含 Beta 全宽 START 的唯一 `#f37021` 标志性盒橙关键动作/保色 RUNNING/小面积状态回声、pointer-down 即时反馈、减少动态/透明度与增强对比度系统偏好、三页最终加载顺序、中性焦点及同源近距阴影的含下载安装的中性弹层动作
local-settings.test.mjs: .env.local 未知项保留、OneAPI Key 原子写入/覆盖/删除、格式校验与持久化状态测试
lark-setup.test.mjs: CLI 配置 JSON、字段读取必需 Scope 与中文授权能力、共享 Base 状态、非阻塞 Device Flow、二维码与授权过期测试
model-config.test.mjs: 六个 OneAPI 模型（含 GPT Image 2/2.5 全档位 16 对齐/像素与边长边界、原图 1K 16:9 请求与浏览器摘要、2.5 双模型九比例与五质量档）与默认 9B FP8/7 steps Flux 工作流统一可选、Provider、单图、Pro 通用 1K/2K 与仅全景可用的 3040x1520 4K 实验档、Flux Prompt、原图比例 1K/2K 推理及同图 2K→4K/6K 攸行超分、其他接口尺寸不变、全景 2:1 准入及请求白名单测试，不发送真实请求
generation-batch.test.mjs: 服务端最多四张批次标识、浏览器逐模型及功能尺寸/质量适配、Seedream 5.0 Pro 全景 4K 保留、白模/空房/精模格式限制与遗留工作流档位剥离、ComfyUI 分段耗时摘要、并发度二、保序和部分失败测试，不发送真实请求
generation-jobs.test.mjs: 日常生图付费执行前飞书同步合同阻断、任务即时入队、查询恢复、领域阶段快照透传、最多两路并发、保序与部分失败测试，不调用真实生图服务；deferred 测试确保成功/失败终态前始终忙碌
beta-base.test.mjs: Beta 三表隔离、创建null填默认可用后必须upsert清空并草稿回读、{id}对象数组关联、七功能映射、最终Prompt/多选Tag捕获；逐字段验证场景/配置快照、版本、真实尺寸、时延/费用漂移与附件token/字节数回读，合同不一致不可误报成功；使用CLI替身，不读写真实Base
beta-page-state.test.mjs: Beta跑图本机持久配置状态纯函数测试，覆盖首次默认 Flux、七功能/样本集引用/最多四模型/表单参数往返、全景 2:1 锁定与 4K 恢复、非法质量回退、非法存储降级与不复制图片边界
beta-run-id.test.mjs: Beta跑图人工分组时间、技术 Run ID 本地日期时间主体、批内唯一序号、模型定位与非法输入拒绝纯函数测试
beta-runner.test.mjs: 含效果图氛围转换/美化/全景美化的七功能样本准入、空房逐样本房型、当前 Key Agent 权限前置阻断和 409 不重试、测试时间、无限结果、去重资产、两路并发、单 Run 单图隔离、生成/同步双阶段、飞书回读后预览、瞬时故障三次 Attempt 与全量归档门槛；模型已完成但飞书同步 pending 期间的更新守卫测试
beta-panorama.test.mjs: 全景样本真实2:1/伪尺寸/8MB保护、ID元数据零原图入队、执行时原图比例校验、GPT2.5零入队阻断、独立冻结Prompt版本归档及Seedream全景4K/普通Flux工作流的内存合同测试
beta-ui.test.mjs: 根容器 clip 与配置区定位边界回归， Beta跑图独立第三工作台、默认 Flux 与当前标签页配置恢复接线、飞书样本集选择/逐张保存及完成回读、无整批容量限制、按样本ID入队与free/style共用图片资产、独立测试时间、同选项键帽近距阴影的38px中性保存与右侧飞书结果按钮、七功能无反推、多模型、配置/监控双栏、START/RETRY、生成/飞书同步双进度和轻量预览的静态合同测试
generation-task-state.test.mjs: 当前标签页按功能保留生成任务 ID、按图片计数及 ComfyUI/API 编辑阶段消息推导生成中状态、结果与过期/原始错误纯状态测试，不访问真实浏览器存储
generation-task-request.test.mjs: 日常生图前台生图及扩图飞书实时 Schema 就绪阻断与仅图片超分豁免、空白默认正向提示词、Flux2 Klein 默认选择、固定 PNG 且无格式 UI、单模型 1–4 张展开、美化六组合/指定版本穿透与氛围转换/全景美化分功能加载文案、后台任务参数适配与图片载荷只传一份测试，不发送真实生图请求
image-upscale.test.mjs: 图片超分专项测试，覆盖三份 SeedVR2 映射与哈希、默认攸行 3B 原图直入/GPU 缓存、可独立或嵌入 Flux 的阶段、两套 7B 预处理、4K/6K/8K 比例参数、时限、Prompt ID、真实像素、本机结果及 OneAPI/飞书豁免，不提交真实 GPU 任务
effect-render-enhancement.test.mjs: 效果图氛围转换旧编码/新展示名、环境模块与全景纯文本/开放 MAIN JSON和指定冻结版本、Seedream 全景 4K、普通 Flux 工作流、单图/原比例、脱敏响应与归档元数据内存集成测试
model-multi-select.test.mjs: 同一出图模型入口至少一项、最多四项、取消与顺序纯规则测试
comfyui-client.test.mjs: ComfyUI 健康、取消、Base64 原子提交、WebSocket 阶段、队列兜底、超时、`completed=false` OOM 即时报错、网关恢复、节点详情、唯一产物、旧图拒绝、404 恢复、输出指纹与参考图边界测试，不提交真实任务
comfyui-workflow.test.mjs: Flux 9B FP8/7 steps、1K/2K、4K/6K 同图无 Prompt 攸行超分、全景复用普通 `euler` 与空 Latent 工作流、废弃全景采样字段隔离和 Prompt 注入的工作流图合同测试
flux-negative-prompt.test.mjs: Flux 负向 Prompt 默认不变、自定义整段覆盖、仅 Flux 显示/消费、长度边界、追溯元数据与结果标记测试，不提交真实任务
image-dimensions.test.mjs: PNG/JPEG/WebP 图片头真实宽高与无效字节降级测试
image-ratio.test.mjs: 浏览器原图比例标签、缺图默认值与最近合法比例选择纯函数测试
generation-actions.test.mjs: 白模/空房生成动作状态与静态视觉合同测试，覆盖提示词复用、START/RUNNING… 中文语义与忙碌态、内嵌 Smiley Sans、精密键帽反馈、761px 起独立配置滚动区、不遮挡控件的底部动作栏及窄屏自然流布局
generation-comparison.test.mjs: 生成结果原图/结果图滑动对比专项测试，覆盖默认关闭、按需开启后的 50% 轻量分界、无箭头及无聚焦外圈抓手、拖动态、原生 range 键盘语义、四图画廊完整图片高度、纯结果切换、无原图降级、扩图异画幅对比隔离、带版本的入口与页面内存边界，不提交真实生图任务
feature-directory.test.mjs: 生图工作台信息架构静态合同测试，覆盖 AI设计/AI渲染/AI创作内嵌目录、十功能唯一入口/AI扩图位于AI创作末位、黑色粗体分类、144px 目录与 11/12px 可读字号、各生成功能图片上传置顶、双面板桌面布局及窄屏三列降级
empty-room-furniture.test.mjs: 空房家具跨层合同测试，覆盖线上目录推荐合法性、剥离“其他”入口、已选正向需求、未选及空条件省略、明确排除原文保留、其他家具/非法输入、浏览器请求、两条 Agent 路由、缓存隔离和飞书可读归档
empty-room-type.test.mjs: 空房房间类型前后端合同测试，验证十项受控目录、客户无默认选择、“其他”详情条件必填/空白归一化/40 字上限与非法值拒绝
launcher.test.mjs: 跨平台一键启动器的 Node 版本、端口优先级、依赖摘要、本地 CLI PATH 和服务就绪有限轮询测试，不安装依赖、启动服务或打开浏览器
agent-model-config.test.mjs: 十一个 Prompt Agent 候选 ID、DeepSeek V4.1 Flash、Doubao Seed 2.0 Lite、图片输入能力与接口可用性回归测试，不发送真实 API 请求
lark-sync.test.mjs: 全部可写字段类型/单选值/附件 ID 的 409 阻断、真实产物尺寸与模型目录、独立效果图氛围转换/美化功能、房型/家具/设计/Agent/风格、原始/最终 Prompt、模型与融合及完整天气时段工作流映射；不调用 CLI 或写入真实 Base
oneapi-client.test.mjs: OneAPI 主动取消、Prompt Agent 单/双图顺序、Responses 与 Claude Chat Completions 评审、图生图压缩/脱敏、Images edits 透明 PNG/mask 字节原样传输/真实费用/空响应/上游错误与收费 POST 不重试、Style DNA 多轮附件及费用归一化测试
lark-cli.test.mjs: 项目内固定版 CLI 路径优先、最低版本校验与旧全局 CLI 阻断测试，不调用真实飞书 API
image-artifact.test.mjs: 生成图片扩展名、data URL 解码、任务快照 WebP 预览、空响应与下载体积上限测试
image-download.test.mjs: 内嵌大图浏览器本地 Blob、远程图片同源代理、文件名一致性、MIME、字节透传、附件响应头与非法输入测试，不访问网络
panorama-viewer.test.mjs: 全景图美化专属 360° 预览边界、功能上下文传递、dialog 结构、本地 Pannellum 资产及 Light Command Center 视觉令牌接入回归测试，不加载真实图片或启动 WebGL
benchmark-base.test.mjs: Benchmark 五表环境配置、全部普通回填的实时字段存在性/可写类型/单选选项阻断、稳定编码配置映射、系统字段隔离、样本录入、三类实验筛选、快照、Prompt/Run/三维评分/费用/横评关联与附件测试，不读写真实 Base
benchmark-runner.test.mjs: 横评计划规模、提示/出图阶段 Prompt 共享边界与飞书实验类型映射、Case/配置筛选、Provider 路由、主动取消、费用传递、逐 Run 真源进度、失败重试、横评同步与计划阶段零调用的内存集成测试
benchmark-experiment-config.test.mjs: 八类质量配置单变量草稿冻结、阶段推导、稳定配置 ID、双 Provider 智能分辨率与合法参数测试
benchmark-experiment-ui.test.mjs: 实验 ID、智能分辨率、八类因子互斥切换、因子上置、选择器与计数同组、重复候选标题隐藏、收窄固定参数与紧凑候选项测试
benchmark-job-ui.test.mjs: 运行中出图停止准入、停止任务真实进度/继续生成、部分失败任务的完整进度/失败数文案、出图重试准入、评分失败卡剩余数及同实验冻结参数恢复纯函数测试
benchmark-review.test.mjs: seven_evaluate_v3.1 单次 AI 评分、1–5 小数分、三维证据隔离、完整 JSON 提取/严格契约、单次契约修复/原文留存、正式评分 Run 断点筛选、输入准入、问题严重度封顶、40%/30%/30% 加权准入、飞书可读评分细则、旧协议分析隔离、可用图漏斗、模型分类分析与 P95 测试
benchmark-review-ui.test.mjs: AI 评分前端当前样本集成功结果筛选、GPT 默认评分模型、部分完成剩余数/继续动作、每 Run 最新 v3.1 评分选择、旧协议计数、三维/加权摘要及评分任务保持在评分面板的纯函数测试
benchmark-sample-ui.test.mjs: 分次文件累加去重、草稿初始化、已有空间分类保护、未分类采纳 AI 类别、五维字段边界、状态文案、上传交互优先级和单层输入焦点反馈测试
benchmark-labeling.test.mjs: 单图 AI 样本空间与五维标签 JSON 契约、人工准入隔离、独立低中高约束与可注入视觉模型调用测试，不发送真实 API 请求
benchmark-workbench-store.test.mjs: 当前 worktree 本地样本集、实验、分类元数据和评分版本原子写入及稳定 ID 更新测试
benchmark-workbench.test.mjs: Benchmark 样本集迁移/CRUD、空间与五维 Gemini 3.5 Flash 待审标注、人工准入、用户指定可用视觉模型、自动 Case ID、实验计划生成零 Base 写入、正式运行冻结配置失败持久化/停止调用、Base 成功结果实验目录、v3.1 评分写回/按 Run 断点继续/旧协议脱敏逐图评分投影、空评分批次阻断、评分传输失败批次落库、当前集/实验 ID 分析隔离与历史 Run 协议漂移拦截测试
benchmark-jobs.test.mjs: Benchmark 后台任务即时入队、主动取消、阶段、Base 落库状态、进度、成功结果与可诊断失败消息测试；取消真正结算前仍忙碌、容量清理保护 cancelling 的 deferred 测试
style-dna-reverse.test.mjs: Style DNA 反推脱敏版本目录、所选版本传递、Prompt 正文隔离、客户端覆盖防护、公开附件策略、多轮图片/PDF 与固定 JSON Schema 测试
prompt-agent.test.mjs: 可选 Agent 名称字段、无名称字段时的白模/空房双模式与风格反推展示名派生、行解析、脱敏已上架版本目录、空房智能默认/融合配置、默认最高/指定发布版本、System Prompt 与分页边界测试
refined-model-prompt.test.mjs: 精模固定 Prompt 飞书行解析、草稿测试、发布优先、指定版本、正文脱敏与分页字段边界测试
refined-model-workflow.test.mjs: 精模用户要求前置与预设 Prompt 后置、空输入兼容、长度边界、单图、原图比例、批次元数据、脱敏响应与同步调度内存集成测试
reference-image.test.mjs: 默认及调用方自定义的参考图数量、格式、容量、Base64、MIME、真实字节数与可信宽高策略回归测试
reference-attachment.test.mjs: Style DNA 图片/PDF 附件分流、无数量上限、PDF 文件签名、MIME、真实字节与容量策略回归测试
style-library.test.mjs: 飞书风格行、Style DNA 合法性、版本化唯一编码、历史版本选择、上下架状态、分页边界和前端脱敏回归测试
white-model-workflow.test.mjs: 显式功能路由穿透生成输入，阻止空房默认走白模， 白模与空房智能默认/固定风格稳定 Agent 路由、空房房间类型及“其他”详情必填/白名单/Prompt 注入/缓存隔离、独立 Prompt 表、仅智能默认可用的主图+风格参考双图合同、平台融合混合输入拒绝、最终出图单图隔离、风格图缓存失效、版本化 Style DNA、独立 Provider、比例及非阻塞归档测试
white-model-render-mode.test.mjs: 白模/空房前端风格选择单元测试，覆盖可切换智能默认说明、平台风格扩展/版本去重、风格图触发禁选和失效选择回退
runtime-cache.test.mjs: 异步 TTL 缓存命中、并发去重、过期、主动刷新和失败清理测试
sync-jobs.test.mjs: generationId 幂等入队、非阻塞执行与飞书同步状态测试；成功/失败同步完成前的 pending 更新守卫

effect-beautification.test.mjs: 去除 LoRA 触发词后的六预设正文原样投递、默认/非法值/单图准入、独立版本来源与正文短句脱敏、双 Provider 现有负向行为、正式/Beta 标签和完整元信息、后台任务目录与统一配置刷新；全部使用内存替身，不生成或写入真实数据

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

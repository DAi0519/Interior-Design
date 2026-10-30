# public/
> L2 | 父级: ../CLAUDE.md

成员清单
model-render-latency-report/: 本机中台速度反馈简报，链接outputs/model-render-latency；report.html恢复上一版简报，diagnostics.html独立保存分段诊断，原始样例折叠，report.css适配4192严格CSP
refined-lighting-seedream-report/: 本机ignored的Seedream三模式90槽位专报入口，链接outputs/refined-lighting-third-mode/seedream/http-preview；进度与暂挂保留
lighting-transfer-controls.js: AI渲染效果图光影转换，复用图卡但固定参考迁移/隐藏上传及执行方式，独立Prompt版本/补充要求/草稿与准入
generation-size-controls.js: 共享模型尺寸规则的DOM适配，刷新比例/分辨率/结果区尺寸，供app.js与光影转换选择变更消费
refined-lighting-third-mode-report/: 本机ignored三模式420项报告入口，链接outputs/refined-lighting-third-mode/http-preview，与旧300入口隔离
refined-lighting-report/: 本机ignored报告入口，链接outputs/refined-lighting-final/http-preview，以同源CSS/JS适配4192严格CSP；离线单文件仍为comparison-report.html
panorama-lighting-controls.js: Main/Beta全景共享小勾/紧凑单行数量与标题行清空，连续多选/取消、稳定DOM/焦点/预览、独立要求和草稿，按ID/版本/SHA呈现有效勾并保留失效阻断
refined-flux-reference.js: 光影转换与精模共用双图能力和原比例1K/2K；共享精模三种预设执行方式/Prompt来源与双图判定与Flux专用1K2K长边规则，普通Flux仍单图，供尺寸控件/后端准入复用
ks-report/: 本机ignored静态入口，指向outputs/ks-final的最终评测、原始PNG和双档工作流下载，复用4192
ks-5k-to-6k-report/: 旧书签兼容别名，统一指向ks-final最终报告
ks-direct-ab-report/: 旧书签兼容别名，统一指向ks-final最终报告
panel-copy.css: Main/Beta共享参数面板文案展示规则，移除普通说明与维护入口，保留全景光影控件/.error/历史恢复异常、标题计数及上传限制
config-refresh-button.css: Main/Beta显式加载的共享配置刷新唯一视觉源，操作行/12px描边SVG/悬停按压禁用反馈，不依赖整套主工作台主题
refined-lighting-controls.js: 渲染方式为正常字重/选中小勾且无标题计数；Main/Beta与光影转换共享小勾/纯名称和紧凑数量入口，预览复用/有限重试，精模多光影×三方式独立身份和上传整组互斥/草稿恢复；其他宿主单选收起，原件和Prompt留服务端
refined-lighting-controls.css: 三种渲染方式小勾/正常字重/无标题计数；精模/全景/光影转换统一12px入口/44px缩略图/11px正常名称/16px小勾，三列及共享窄屏两列，标题行清空、键盘焦点、失败预览和上传锁定，无整卡选中框
refined-render-presets.js: 旧精模模板/时段/天气/色调目录与严格归一化，供历史API/批次和旧结果摘要兼容；新界面不产生旧三字段
refined-render-controls.js: 历史精模三下拉兼容控制器，保留来源/可用性/安全表链接与旧合同测试，不再挂接新主/Beta光影选择
refined-model-controls.js: 主/Beta精模模型默认策略及主工作台Prompt/必选光影控制器，主工作台显式启用多光影，纯词使用基础Prompt、迁移/上传用迁移规则、氛围词双图用独立图序前置词，基础版本独立记忆/各路独立准入及requestFields/selections/usesReference、Banana2.1默认/手动选择/跨功能恢复，不随执行方式静默换模型
refined-render.css: 精模氛围三下拉与共享表单、11px深色下划线飞书正文入口及焦点、错误状态及配置容器和手机断点布局；精模Prompt版本、状态与刷新直接显示
beta-refined-render.js: Beta共享精模适配器，显式启用光影乘模式多选，纯词使用基础Prompt，迁移/上传及氛围词双图各显示只读专用版本/独立准入，迁移版本不覆盖basePromptVersion/restorePromptVersion基础记忆；光影与方式独立计数摘要，单项settings剥离聚合草稿/展示名、保留单双图能力阻断/轻量草稿且上传图片不落盘
image-relight-presets.js: 五重打光效果/自定义与三旧方案恢复目录、界面默认明亮漫射，旧省略模板仍custom的严格准入与标签查询，无Prompt正文
image-relight-geometry.js: 整体原灯keep/darken/turnOff严格规范化/能力目录及新增光源/单灯减弱关闭/历史保护与点线面合同，动作标记目录/优先级，新增方向与两灯具模式、原灯amount，12条/64点/6MiB/4096px及GPT尺寸规划
image-relight-canvas.js: 按CSS尺寸×DPR独立高清重绘/窗口与换屏监听的可选点线面光源编辑，独立editing锁定非编辑状态的指针/键盘/增删撤销，新增补光方向/绘制前原灯减弱关灯与历史保护、稳定编号和移动/嵌套/触屏取消
image-relight.js: 五模板直接生成/custom直接编辑的GPT控制器，脱敏Prompt版本/表链接/刷新和请求SHA冻结，无编辑/生成设置折叠，草稿私有隔离与换源清除、旧模板标注显式恢复/非默认参数摘要，自定义整体原灯三选无需标注/可选新增与单灯精修、整体参数与标记草稿隔离/恢复/深冻结及能力门禁、三类几何/两灯具模式与共享下拉同步
image-relight.css: 五效果加自定义两列模板、轻量Prompt版本/链接/刷新与custom原灯三选/可选新增与单灯精修，模板态隐藏工具栏/footer，原比例预览/窄屏收缩/限高滚动/共享控件与焦点
room-renovation.js: 旧房/空房共享模式判定，旧房入口复用空房输入/单次出图及结果链路，Agent配置与版本独立
choice-select.js: 共享下拉组件库唯一渲染器，普通/搜索单选和多选、原生Popover同宽4px定位与最近模态内挂载、38px选项、指针/方向键/Home/End/Enter/Space/Escape、禁用/搜索/销毁生命周期
choice-select.css: 全站下拉视觉真源，黑底白字选中、橙勾、浅灰悬停、不透明菜单、4px选项行距与不收缩列表、共享尺寸/阴影/焦点/单行截断和窄屏令牌
workspace-panel.js: 含质感增强紧凑标签的主工作台配置栏控制器，80–620px分隔线拖动、目录先收/参数实际伸缩、304px以上任意中间宽持久化、实际参数宽与展开基准分离、80px隐藏执行区、预览最小360px及旧偏好迁移，900px以下同DOM原生抽屉/功能下拉/焦点管理
workspace-panel.css: 主工作台连续伸缩/80px纯目录/900px下同DOM抽屉布局；全部16功能右面板共用44px标题带，普通结果/工具页签/风格反推与左侧同12px字体及1.3行高，文字和分割线同时对齐，反推说明独立下一行
workspace-panel-responsive.css: 主工作台参数容器响应层，按280/250px实际宽度重排字段/标题/上传信息/共享下拉/房型家具/模型/镜头控件，保持原字体和38px操作区

camera-sphere-scene.js: 摄影机球纯Canvas2D绘制，分别缓存前后半球经纬网并夹住球心原图、带光照的机身/镜筒/LCD原图贴图、视锥和相机前后遮挡；不管理输入
camera-sphere.js: 主工作台/试跑页共享交互控制器，RAF拖动与最短弧260ms预设过渡、低动效即时降级、指针捕获/键盘5度微调与Shift加速、九宫格/三档景别/机位记忆，委托scene绘制
image-multi-angle.js: AI编辑多角度控件与Qwen/Banana2.1/Sunburst逐项权限选择，Sunburst五档质量下拉/默认medium/sessionStorage独立记忆，模型/质量和机位冻结、20MB上传/实际尺寸、统一任务与飞书同步状态/记录入口
image-multi-angle.css: 银灰机位编辑区与Sunburst共享质量下拉、统一SVG/定制滑杆/九宫格与景别状态、真实原图自适应比例/前后网间的轻量球心卡与虚线空态、预览读数/输出说明及完整焦点/触屏/窄屏/低动效规则
image-multi-angle-geometry.js: 浏览器与后端共用20MB/6400万像素/单边16384准入和长边最高2048、8px对齐、不放大小图的尺寸真源
image-mask-fill-geometry.js: 独立maskFillOperation=remove及removalPromptVersion共享合同/前端选区必填，三模型/6MiB/4096准入、GPT参考模式可空指令及物品/材质用途默认与合法性共享策略、矩形与自由多边形归一化/深拷贝/非零面积和2048点上限、共享蓝线常量、Flux/Qwen必填遮罩/GPT可选mask或editRegion互斥请求，GPT按目录注入的1K/2K/4K输出规划与默认1K
image-mask-fill-canvas.js: 原图等尺寸白色遮罩、GPT蓝色矩形/自由闭合圈选，setTool与工具按钮共用模型准入及切换路径，选区按钮始终显示且非GPT禁用并提示切换模型，鼠标/触屏指针捕获/取消丢弃未完成轮廓/长轨迹简化；三份独立历史与当前工具撤销清空，换原图共同清除，只有涂抹导出mask
image-mask-fill.js: 三模型双模式控制器及局部消除独立Prompt操作/旧后端版本门禁，默认GPT+框选/真实可编辑消除词/必选区域/三份独立草稿，自动词随框选与涂抹适配且不覆盖手写，仍提交prompt模式并显式传maskFillOperation=remove；GPT画笔/矩形/自由圈选并存，当前工具提交mask或归一化矩形/多边形，独立supportsBoxSelection/supportsLassoSelection旧服务阻断保留状态；GPT参考模式换物品/换材质切换与可空补充指令/用途占位及其他模型原推荐、手写保留、仅异常提示、三档五质量默认1K/medium、实际尺寸摘要与任务飞书入口
image-mask-fill.css: 遮罩设置分组20px/组内8px节奏、输出/质量共享字段栅格、38px模式/用途/绘制工具按钮、等比例主画布及触屏画笔/不透明蓝色圈选/窄屏样式

effect-beautification-controls.js: 效果图美化主/Beta复用的单选输入层，低/高与自然/暖/冷缺省归一化、value/restore、焦点和方向键/Home/End；disabled键盘/指针守卫拒绝禁用选项，不共用Prompt资产或接收正文
effect-beautification.css: 美化强度两列/色调三列视觉层，复用 38px 共享选择控件及品牌键面/黑白选中/键盘焦点/低动效令牌，保留错误提示对比并让氛围版本/刷新整体换行

image-outpaint-geometry.js: 浏览器/服务端共享扩图纯几何真源，固定2K档位/长边真源与显式非2K拒绝、可信源图原比例及预设画幅/引擎尺寸合同、Sunburst原比例16px对齐及3:1最小短边补边/适配事实、原图16384px与API适配图3840px独立边界、动态等比缩放边界/真实适配与预处理、归一化位置及四边整数分配，拖动不改变最终画布
image-outpaint.js: AI 扩图 Flux/Qwen/Sunburst 三引擎控制器，服务端目录驱动且隔离的 Flux Fill 模型下拉/失效阻断、独立引擎结果身份、默认原比例及五预设画幅与共享固定2K输出；换源沿原比例重新计算且保留用户预设、换模型不改画幅；Sunburst按maxSourceEdge验证上传原图、prepared仍守API输入边界，固定图片基准尺寸只用transform连续移动/缩放，预览与提交整数规划分离，合帧/结束提交/换源取消旧帧、倍率/居中/新源通知及带scale的单图请求，保留旧几何导出兼容；配置就绪时清空辅助说明，不可用时仅保留.error原因
image-outpaint-transform.js: 独立于模型整数网格的outpaintVisualPlan浮点视觉规划、四角固定对角等比缩放与解析边界、合帧队列/提交flush与取消、1.5/2/3倍及连续大小原生popover、自定义/上下限提示，将scale和位置交回主控制器
image-outpaint.css: AI扩图无选中框文字页签/柔和棋盘格/无嵌套底色画布、原图transform直接跟手且无完整外框、固定四角手柄/边界提示、单行尺寸/原图大小/居中栏及固定2K的引擎/模型/含原比例的两行三列画幅控件，复用银灰令牌并适配窄屏
image-outpaint-workspace.js: 可配置打光/二次编辑/多角度/扩图主画布布局与任务视图组合层，在控制器绑定后移动原预览/尺寸/工具DOM并保留事件，以预览/生成结果键盘标签切换保留原结果及飞书链接，有效新源默认回预览并按任务身份隔离旧结果，新START正常显示状态/结果，隐藏构图时关闭缩放浮层
image-tools.js: GPT光照模板/可选光源编辑与原图/结果共享工作区，组合遮罩、多角度、超分与扩图控制器，按功能切换任务/新源并刷新连接能力

CLAUDE.md: 本模块地图，维护浏览器界面成员清单

app-update.js: 三工作台共享版本与更新交互，正常新版仅关闭/下载安装、无发布页跳转、失败原位检查及重试；发布模板只呈现版本亮点、无正文隐藏说明、单弹层显示进度/错误/结果；按 installMode 区分源码新目录和运行包原地更新，保留确认、NDJSON 终态、待重启/恢复失败及安装互斥
app-update.css: 共享更新入口与紧凑银灰弹层视觉层，360px 状态标题/精简版本/按需亮点、同排32px等高动作，下载安装使用统一中性键帽和中性进度条；外壳/遮罩/提交键面由 raycast-accent.css 统一
config-refresh.js: 独立光影转换Prompt目录刷新与失败分派；含质感增强固定Prompt版本/上架和共享刷新、失败显式回调；主工作台飞书配置刷新分发，精模光影库分派独立可用性/版本摘要，保持各功能来源/刷新隔离和失败恢复；正常说明不显示，配置失败以.error恢复显示
connection-center.js: 运营首次运行控制器，管理 OneAPI 本机记忆、评测页 `?connect=api` 直达、CLI/用户/中文授权能力/Base 实时同步合同状态、飞书 Device Flow 与焦点圈闭/归还，并把准入状态回传生成编排器
connection-center.css: 连接中心视觉层，提供 OneAPI/飞书无套框双分区、中性浅色 32px 动作按钮的结构与交互基底、灰阶就绪标签、状态行、本机记忆控件、授权二维码和窄屏布局，最终颜色由 raycast-accent.css 统一
generation-actions.js: 白模/空房/旧房/风格转换共用Prompt指纹与首次单按钮/复用双按钮；可选getUnavailableReason将精模等配置门禁映射为禁用与可恢复提示，保持START/RUNNING…/中文aria-label及忙碌语义
generation-actions.css: 白模生成动作视觉层，内嵌 Smiley Sans 展示字形并提供无图标横向标志性盒橙 START 精密键帽、保留功能色并以中性扫光表达进行中的 RUNNING 状态、提示词复用后的 65/35 主次双按钮、761px 起不遮挡配置的独立底部动作栏、窄屏自然流布局及完整交互反馈
design-inputs.js: 旧房与空房共用房型/家具/输入顺序；生成输入布局组合层，主图置顶、风格参考图紧随其后，连接家具请求、补充要求文案及直接显示的 Agent 配置
empty-room-furniture.js: 空房家具多选控制器，消费服务端目录、首次按房型默认勾选、逐房型保留修改、刷新清除失效选项、“其他”勾选展开输入及已选正向需求、未指定自动搭配与必要配饰说明
empty-room-type.js: 空房房间类型输入层，消费服务端十项受控目录与详情长度，提供无默认值的必填单选、“其他”具体类型条件必填、归一化、聚焦与请求字段
empty-room-type.css: 空房房型与家具增量视觉层，提供三列紧凑按钮、“其他”输入、必填标识、选中/焦点/按压、低动效结构，并由最终颜色层统一纯黑白字选中态
final-model-availability.js: 最终出图模型展示解释器，四个可运行 OneAPI 模型与一个 ComfyUI 工作流统一可选且不暴露内部目录状态，由真实生成请求裁决
model-capabilities.js: 光影转换单张效果图/旧进程门禁与Flux双图尺寸；全景新旧进程/FluxR5_4身份门禁，固定original/原图尺寸，无普通推理与超分档；新旧进程质感增强功能门禁及单图必填的含二次编辑主图语义的双 Provider 模型能力解释器，以纯函数推导参考图主题与数量、按功能覆盖的合法比例/分辨率选项、Seedream 5.0 Pro 全景 3040x1520 4K 实验档，以及精模Flux参考上下文仅1K2K/长边摘要与普通 Flux 原图比例 1K/2K 原生输出和标明“2K→攸行超分”的 4K/6K 最终尺寸摘要
model-multi-select.js: 模型业务适配，注入至少一项、筛选全选/取消与首选保序规则，兼容风格入口，菜单统一委托choice-select
generation-count.js: 单模型生成张数下拉控制器，提供 1–4 张归一化、原生 select 取值，以及多模型时隐藏并恢复一张
flux-negative-prompt.js: 全景R5_4隐藏CFG1无效负向且独立空草稿；质感增强隐藏负向编辑；Flux 负向 Prompt 输入控制器，仅在选中 Flux2 Klein 时显示，旧房与普通功能分别保存内存草稿，旧房空值说明可改材质/配色/家具/装饰且保留真实结构/原视角，美化独立说明空默认负向，普通原文不变，非空整段覆盖并管理字数；不持久化或接收默认正文
generation-input.js: 光影转换仅投影独立补充要求及卡片/规则身份，不带其他功能词；质感增强独立Prompt版本仅随本功能请求冻结；全景仅传卡片身份和用户光影正文、不携第二参考图；质感增强清空正负向用户词；精模纯词投影基础版本，迁移/上传与氛围词双图投影各自ruleVersion为promptVersion、不携基础code/SHA，卡图服务端读取/上传图独立携带，undefined才兼容旧参数；旧房映射emptyRoom并携designScenario/独立Agent版本
generation-batch.js: 质感增强沿用固定PNG/合法尺寸与批次；生成批次领域层，逐模型/精模单项模式及功能适配合法尺寸与质量、为白模/空房/风格转换/精模/效果图/全景图美化剥离 WebP、剥离遗留 Flux 工作流档位，并以并发度二保序执行任意数量生成项、保留部分失败
generation-results.js: 全功能共享单图/两列结果画廊，消费精模预设仅提示词/提示词加参考图可读摘要、原图/结果滑动对比、原位失败卡、全景专属360°入口、内嵌Blob/远程同源下载及独立飞书同步；旧房无中间图或额外归档
generation-task-controller.js: 生成任务交互层，按功能管理任务启动/跟随/恢复、仅在当前页面内存保留任务原图，并向结果区传递功能/对比上下文与忙碌状态
panorama-viewer.js: 全景图美化结果专属 360° 交互层，以按需 Blob 和 Pannellum 等距柱状投影创建可拖拽、缩放、全屏、复位及关闭销毁的 viewer
panorama-viewer.css: 全景结果预览视觉层，提供 360° 入口、与工作台同构的银灰命令栏/品牌键帽、沉浸式暗色画布、同源 Pannellum 控件/加载提示和窄屏全屏布局；弹层表面与遮罩由 raycast-accent.css 统一
generation-task-request.js: 全景多光影×模型×每组合张数展开、逐卡身份/名称标签与对比文案；精模光影×模型×模式/逐模式版本与单项投影；共享图片只传一份、逐模型适配与旧房普通空房路由
generation-task-state.js: 光影转换独立任务引用与恢复；全景MaaS排队/执行消息恢复；质感增强独立任务存储与恢复；按功能保存后台任务ID并隔离旧房/空房入口，普通设计按图片计数恢复状态；图片工具保留ComfyUI/API阶段消息，不复制图片数据
reference-upload.js: 共享参考图上传/替换/删除与格式容量校验，单图最新同步校验有效读取优先、非法/取消不打断；isEnabled/clear可取消异步回写及静默恢复，多图追加不变
white-model-render-mode.js: 复用共享可搜索单选下拉的设计风格选择层，保留版本/说明和白模/空房智能默认；风格转换仅明确平台风格或上传参考图，不自动选首项，与原模式隔离选择，参考图上传自动切换/禁选平台、删除清空并阻断无目标生成；已就绪说明清空，真实不可用原因标记.error
white-model-render-mode.css: 主工作台设计风格单选下拉的容器边界，复用model-picker共享外观，不再保留两列按钮或独立选中底色
lark-permission-labels.js: 飞书授权文案解释器，把最小 Scope 编码映射为连接中心可理解的中文能力名称并保留未知项诊断
custom-select.js: 原生select渐进增强适配，所有页面和动态select统一委托choice-select，保留value/change/隐藏/禁用语义，移除时销毁浮层与监听
custom-select.css: 三工作台下拉样式统一入口，引入choice-select.css并隐藏增强后的原生select，不维护第二套菜单视觉
product-navigation.css: 生图工作台、Beta跑图与模型评测共享的三段式顶栏视觉与动效真源，提供纯文字 Canvas Lab 品牌、内嵌 Inter Variable、Raycast ss03 字形与 0.5px 光学基线修正、滚动条存在时仍按物理视口居中的银灰玻璃顶栏、静态首帧激活层、仅双层 transform 的 140ms 导航前激活视窗位移与 reduced-motion 瞬时降级，最终选中层级由 raycast-accent.css 加深
product-navigation.js: 三工作台导航反馈层，点击同源目标时只更新 data-active-index 触发 140ms CSS transform，可用后续点击重定向到最后目标，完成后原生导航；reduced-motion、修饰键与当前页始终保留原生链接行为
raycast-accent.css: 跨工作台最终颜色层，以冷白银灰顶栏、`#000` 纯黑白字反色选中面、浅色普通键、淡灰细边与近距阴影统一全部状态，集中连接/更新/全景弹层的银灰表面、边界、文字、38%/12px 遮罩与统一阴影，弹层常规动作及单一下载安装按钮复用中性近距键帽与完整状态反馈，并以唯一的 `#f37021` 标志性盒橙统一关键执行动作与小面积状态回声；提供 pointer-down 即时反馈和减少动态/透明度、增强对比度系统偏好降级，普通禁用仍回到中性灰
prompt-agent-version-select.js: 场景融合Agent版本选择控制器，旧房以独立scope隔离版本记忆，其他保留原存储键，只渲染服务端脱敏已上架目录、默认最高版本并在当前标签页记忆选择
refined-prompt-version-select.js: 消费基础目录与迁移/上传及氛围词前置规则脱敏身份，基础版本独立记忆/下架回退，setReferenceConfig按来源显示只读迁移/氛围词前置版本且不污染基础存储；referenceLightingPromptCatalog供Main/Beta共享，真实错误可见且无普通说明
style-dna-chat.css: Style DNA 反推预览视觉，提供图片/PDF 附件卡、兼容内嵌功能目录的等高对话面板、独立滚动消息流与未发布 JSON 草稿卡片
index.html: 白模与精模归AI渲染；AI渲染光影转换入口与独立参数容器；质感增强固定Prompt版本状态/刷新空容器；全景纯词光影容器与共享卡片样式入口；AI渲染新增质感增强单图入口；显式加载panel-copy与共享config-refresh-button样式，统一不展示普通说明/维护入口且保留真实错误；精模光影卡片/参考图独立常显配置及Prompt版本、状态与刷新；旧房入口直接复用空房配置与共享结果；含AI编辑二次编辑入口/主区域遮罩画布与统一START；精简工作台语义骨架，以 AI设计/AI渲染/AI编辑/AI创作内嵌目录（超分与扩图归入AI编辑）、独立配置滚动区和底部动作栏构成左侧配置面板，并提供纯文字品牌顶栏、效果图美化强度色调/效果图氛围转换天气时段/含专属 360°结果预览的全景图美化、精模、白模/空房/风格转换/自由生图/风格反推、默认攸行3B且含7B原图直入与KS预缩放/原图直入2X/4K/6K对照的六工作流超分、动态尺寸目录及说明、默认 Flux Fill/可选 Qwen Image Edit 2511 及 Sunburst 三引擎扩图、隔离的 Flux 模型下拉/默认原比例及五预设画幅/固定2K输出/可拖动构图/动态可用性/真实错误提示、双参考图、白模/空房智能默认与平台风格、风格转换明确平台/参考图风格、独立 Agent、Flux 负向 Prompt、已选摘要/简洁搜索不限模型数与单模型多张、多结果画廊和飞书记录入口
app-config-controls.js: 含二次编辑6MB/4096px单张上传说明；生图配置控件展示层，统一白模/空房/旧房/风格转换独立配置、单主图必填校验、参考图互斥平台风格和 Agent 标题，风格转换参考图使用独立参考语义，按当前权限渲染基模说明，并依功能与模型能力更新上传要求
beta.html: 全景纯词光影容器与卡片样式入口；显式加载panel-copy与共享config-refresh-button样式，普通说明/维护入口隐藏且保留实际状态；共享精模光影卡片/参考图独立常显配置及样式入口；独立第三工作台十任务可搜索单选下拉语义骨架，沿用样本/任务/输出分区、共享搜索多选、提示词模型权限与飞书双阶段监控；AI超分独立工作流及按工作流交集的输出尺寸区；AI扩图隐藏普通任务及模型尺寸控件，独立选择多工作流、原比例/五预设、1.5/2/3倍率与固定2K居中构图
beta.css: Beta跑图 Light Command Center 视觉层，继承既有双栏、独立配置滚动与窄屏单栏，提供超分工作流/输出尺寸交集说明与扩图构图同构控件、不可用原因、设计配置、样本库、38px中性保存、START/仅失败项RETRY及双阶段监控和逐项异常预警
beta-app.js: 全景多光影×模型×样本独立展开/计数/标签与旧进程多选门禁；全景纯词光影模板/手写要求、原尺寸与OneAPI混选逐模型适配、旧进程START/原任务重试门禁；精模光影×方式×模型×样本独立计数摘要及Run ID/Prompt身份/参考切换联动Flux1K2K输出/隐藏CFG1无效负向与光影组合配置、独立模型默认委托共享选择策略，保留有效双图/手动选择、迁移旧自动Flux；目录驱动的可搜索任务单选与十功能配置/任务编排，独立扩图/超分工作流选择/准入/同批对比保留普通模型状态，Comfy扩图/超分不依赖OneAPI连接；复用跨功能图片样本库、正式模型参数、设计/美化/全景配置、轻量持久化、Run ID、START/仅失败项RETRY、冻结原批次重试/新批次退出与飞书双阶段监控及连接/生成/同步异常；提示词模型正常授权说明隐藏，仅检测/断连/不可用/有效候补状态可见
beta-upscale.js: Beta超分目录搜索多选与统一输出尺寸，按候选支持项交集生成2X/4K/6K或4K/6K/8K菜单，混选4K/6K全部同档位展开；旧KS缺省2X、显式合法选择保留、动态原生/增强下拉同步与样本ID请求
beta-outpaint.js: Beta扩图独立边界，严格归一化四工作流键/六画幅/三倍率，复用搜索多选并保留不可用选中项与原因，以固定2K居中构图按样本乘工作流展开Run，不混入普通modelKey/Prompt/quality
beta-design-config.js: Beta设计配置组合层，保留白模/空房原合同，复用共享风格纯规则提供明确平台/参考图两路、独立版本/选择快照、无目标阻断、参考图上传锁平台及删除后重选
beta-model-rules.js: R5_4原尺寸与OneAPI各自分辨率混选规则；按原任务顺序排列且含完整名称的Beta十功能文案目录，供任务下拉和功能配置共用，全景2:1源图/模型准入及普通功能输出尺寸状态；AI扩图独立构图参数由beta-outpaint负责，精模参考状态透传共享Flux1K2K规则，普通模型仍保留全景和Flux后置超分档
beta-assets.js: Beta批次图片传输层，已有样本仅稳定ID；主图/风格图/精模氛围图分角色去重，shared-lighting及逐Run lightingReferenceAssetKey，剥离重复图片正文
beta-results.js: Beta跑图右侧异常预警组件，归一化逐Run生成/归档及页面连接错误，用安全文本渲染可滚动单列预警、无异常状态和飞书明细链接，不渲染结果图
beta-configuration.js: 独立保存精模光影/手动模型与基础Prompt版本，预设图文/上传迁移只读版本不覆盖基础记忆；光影初始未选/旧三字段迁移，普通表单与扩图/超分快照按目录/样本/模型分阶段恢复，输入/标签隐藏/切页落盘并公开状态
beta-page-state.js: 精模旧original/损坏来源迁移未选，忽略已撤销六组合草稿，默认Banana2.1/旧自动Flux迁移与手动身份、光影预设执行方式/上传身份轻量持久化，旧预设默认仅提示词且上传图片刷新需重传；十功能状态边界，不复制图片、任务结果、密钥或服务端真源
beta-run-id.js: Beta跑图时间与追溯标识纯函数，生成 `YYYY-MM-DD HH:mm:ss` 人工分组时间，并以紧凑时间、批内序号和模型键生成技术 Run ID
beta-sample-library.js: 跨功能图片样本集共享/纯提示词集分流、选集记忆优先与同功能默认回退、新建归当前功能且复用不重传，异步目标隔离；空房逐样本房型保存/回读/校验、外部全景 2:1 源图校验及稳定样本 ID 管理，已有样本读取元信息与轻量预览；新集保留 File/Blob 草稿、单张上传与稳定 ID 断点重试，完成回读后才可运行；不设整批容量限制
beta-upload.js: Beta跑图上传呈现层，复用预览/删除/拖放语法，支持本地 Blob 与飞书轻量图片懒加载及草稿上传后的删除禁用，为单张风格/自由参考图提供原位替换，单图校验由调用方管理
smiley-sans-v2.0.1.woff2: 得意黑 Smiley Sans v2.0.1 官方未修改网页字体资产，仅用于生图主动作的窄斜展示字形
smiley-sans-OFL-1.1.txt: 得意黑 Smiley Sans 随附的 SIL Open Font License 1.1 与保留字体名声明
benchmark.html: 继承 Canvas Lab 工作台语义与纯文字品牌顶栏的独立评测页，以横向五步流程串联左侧紧凑管理录入/右侧列表的样本工作区、可分次累加的已有分类/AI 分类双路径样本治理、带功能强调语义的实验计划/正式运行/AI 评分动作、停止/继续出图与失败重试、seven_evaluate_v3.1 单次/断点继续 1–5 小数 AI 评分和数据分析
benchmark.css: 继承 Raycast 向 Light Command Center 近白银灰画布/半透明命令面板、中性浅色动作、低圆角与单层面板规则的评测基础视觉层，提供与生图页同构的单层输入焦点反馈、上方横向流程条、下方填满剩余视口的完整工作面板、实验分析筛选/飞书跳转、表单、指标漏斗与表格
benchmark-responsive.css: Benchmark 响应式覆盖层，提供共享产品顶栏下的流程条收敛、内容双栏降级、窄屏单栏动作重排与低动效规则
benchmark-dataset.css: Benchmark 样本集管理增量视觉层，提供左侧紧凑样本集工具栏与录入/右侧样本列表、同高中性浅灰的管理/表头带、行内新建/重命名编辑器、空间类型来源双路径、AI 标签模型、逐图标签审核、人工准入控制、空态与窄屏排列
benchmark-experiment.css: Benchmark 实验配置增量视觉层，提供上置实验因子、选择器与计数同组、隐藏重复候选标题、紧凑候选项、四列 220px 固定参数栅格、不可用状态和窄屏重排
benchmark-run.css: Benchmark 运行与评分任务增量视觉层，提供任务阶段、Base 落库状态、停止/继续出图与失败出图重试动作、用户影响/下一步/折叠技术详情、评分实验摘要、按任务归属安放的进度卡、任务 ID 与窄屏重排
benchmark-review.css: Benchmark AI 评分视觉层，移除独立协议说明卡，提供单栏横向配置、轻量三维提示、六项摘要、逐图三维/加权分、结构化问题与响应式表格
benchmark-experiment.js: Benchmark 通用实验因子控制器，用注册表管理八类因子的字段、候选源和互斥展示，联动含 Flux 1K/2K 的模型输出能力并输出 `variableKey + variantValues` 草稿
benchmark-app.js: 评测工作台浏览器编排器，负责左右样本工作区空态、分次累加文件队列/稳定缩略图、已有空间分类保护/未分类 AI 识别、五维打标、通用单变量计划、停止/继续出图、失败 Run 重试、评分断点继续、横评跳转、评分分析与任务轮询
benchmark-sample-ui.js: Benchmark 样本纯交互规则层，集中维护文件去重/草稿初始化、分类/五维选项、分类来源动态文案、AI 回填合并和草稿状态，阻止重复图片和模型覆盖已有人工空间分类
benchmark-job-ui.js: Benchmark 任务呈现组件，统一生成/评分任务的阶段、Base 真源进度、停止/继续出图状态、失败出图重试输入、评分失败卡断点继续动作、持久化实验任务投影、失败影响与可执行恢复建议
benchmark-review-ui.js: Benchmark AI 评分控制器，从 Base 成功结果目录筛选当前样本集可评分实验，默认最近完成实验和 GPT 评分模型，部分完成时按剩余 Run 显示继续评分，按 Run 仅选择最新 v3.1 评分并渲染六项摘要/三维加权分/结论/结构化问题/本地校准原因，对旧协议显示隔离提示，并确保评分任务留在 AI 评分面板
styles.css: 紧凑输入控制、单模型生成张数参数、轻量配置刷新、参考图列表与单图替换反馈、弹层与响应式结构规则
result.css: 结果工具栏、空态/加载态/错误态、单图与完整图片高度的可滚动多图画廊、细线与无聚焦外圈的半透明小胶囊构成的原图/结果图叠层分界及逐图下载动作视觉
theme.css: 主题基础层，跨页面刷新按钮样式已抽至config-refresh-button.css；生图工作台 Raycast 向近白银灰画布/半透明命令面板设计令牌、440–490px 自适应双栏、144px 宽且正文不低于 12px、分类黑色粗体的 AI设计/AI渲染/AI编辑/AI创作目录及窄屏两列分组、系统字体光学排版、约束隐藏下拉定位且禁止外层焦点滚动的独立配置滚动区与底部动作栏、精模/Flux Prompt、紧凑配置、单图替换反馈与共享选择按钮令牌的主题基础层
theme-interactions.css: 生图主题补充层，提供精细指针hover和560px以下布局；跨页面刷新按钮交互由config-refresh-button.css承载
app-elements.js: 新增质感增强固定Prompt配置区引用；全景光影容器查询；含精模光影氛围容器；生图页 DOM 查询边界，集中提供二次编辑/功能、美化容器、图片超分工作流及说明、模型、图片、Prompt、参数与结果元素映射
app.js: 光影转换独立卡片/补充要求/运行门禁与选择后尺寸刷新，尺寸DOM投影委托generation-size-controls；质感增强飞书Prompt状态/刷新、无上架版本阻止START/重试且不提供词编辑或版本选择；全景多光影×模型独立对比/旧进程多选阻断/手写要求与原尺寸R5_4控制、单张真实2:1和隐藏负向；质感增强运行目录准入/旧进程禁用START与重试、单图固定词且隐藏正负向/Agent/美化控件；精模独立Prompt身份与光影预设提示词单图/上传参考双图组合控制器、目标必选/缺资产阻断、精模Flux参考时1K2K/隐藏CFG1负向、上传双图门槛/专属默认及跨功能恢复；旧房/空房共享生成流程，独立Prompt目录/版本记忆及复用；含二次编辑两模式、URL功能直达与按功能恢复；生成状态编排器，普通功能以白模智能默认和Flux2 Klein初始化，精模按独立双图默认策略，按 2:1 门槛禁选全景不兼容模型并展示 GPT Image 2.5 质量档，对生图/二次编辑/扩图执行飞书合同阻断且仅本机超分豁免，并协调独立图片工具及三引擎扩图参数/主区域大画布与结果切换/任务阶段/动态准入及连接或换 Key 后权限刷新、按功能/sessionStorage 任务恢复与当前任务原图对比并隔离扩图异画幅对比、效果图/含 Seedream 5.0 Pro 3040x1520 4K 实验档的全景图美化、精模要求、空房类型/家具/专属布局、白模/空房/风格转换双模式 Prompt、双参考图、Agent、固定 PNG、旧房独立负向内存草稿与Flux双档、单模型多张或多模型批量、连接边界与提示词复用
image-upscale.js: 六套超分目录驱动最终尺寸与KS2X/4K/6K选择保留，逐候选原因阻断START/冻结版本/单份原图请求；正常说明清空，仅显示带.error的真实不可用原因
image-ratio.js: 无状态画幅适配工具，通过浏览器解码读取上传图宽高、格式化原图比例并从当前模型矩阵选择最近合法比例
style-dna-chat.js: Style DNA 反推浏览器控制器，读取脱敏已上架 Prompt 版本目录与图片/PDF 附件策略，只提交版本号而不接收正文，并提供版本刷新、上传边界、首轮附件、后续纯文字修正、多轮消息、草稿渲染、复制与新对话；正常版本说明清空，缺版本/读取失败保留.error
workbench-utils.js: 质感固定词无负向不误标默认负向；按真实refinedLighting展示精模卡片及仅提示词/参考图迁移/氛围词加参考图执行方式、上传参考摘要，旧历史不补造执行方式，保留refinedRender兼容；统一同源JSON API、格式化、图片读取、字节、三方/ComfyUI本机结果、Flux负向/攸行超分标记、分段耗时及原生下拉填充
icons/: 外部图标资产模块，提供 Heroicons 加号与上箭头 SVG，详见 icons/CLAUDE.md

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

prototypes/: 隔离交互探索模块，sidebar 提供工作台对比，multi-angle 提供独立MaaS摄影机球单张试跑，不接入生产入口

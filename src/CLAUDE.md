# src/
> L2 | 父级: ../CLAUDE.md

成员清单
design-prompt-output.mjs: 空房/旧房自由JSON/纯文本校验和用户原文前置；机位Agent仅复用前置函数，自身输出由独立JSON合同校验
floor-plan-camera-prompt.mjs: 独立飞书floor-plan-camera-agent空间推理系统正文、最低v2 JSON合同门槛、上架版本/SHA冻结与脱敏目录，无跨表或本地回退
floor-plan-camera-output.mjs: 校验Agent JSON的view_summary/image_prompt、4000字摘要上限与UNRESOLVABLE_VIEW阻断，额外字段不透传生图
floor-plan-camera-service.mjs: .9单次Agent和逐图并发（上限2），模型多选、每模型1–4张/共12张、逐图回执与部分失败；.8单图兼容。同一张墙体遮挡和镜头角域标注图复用为推理输入与唯一生图参考，记录遮挡估算或仅开角；v7双侧强遮挡时淡化图纸画外区域并向Agent附画幅和平面边界，按冻结水平视野换算等效焦距；v6起成图词为人眼平视开场、可见画面、可选用户原文及简短图纸几何约束，v2–v5保留历史编译；双模型/资产/工作流冻结复核、视野摘要/独立画面词与同图SHA、两阶段费用诊断、九模型尺寸/质量及GPT2.6可选complexity
beta-house-plan.mjs: 户型布局Beta适配，主服务复用、批次版本/模型准入、主卧标注冻结、完整Prompt与费用归档强校验
house-plan-prompt.mjs: 独立专表tblzPGZ7rKzKVqjE的用户原文house-plan-layout资产、多上架版本目录/精确版本选择与SHA复核及结构化Agent输出校验
house-plan-service.mjs: 服务端编译Prompt回调供Beta归档； 主卧标注准入、视觉Agent到单次图片生成、默认GPT2.5与两阶段费用回执
floor-plan-geometry.mjs: 当前Key视觉模型目录、几何Prompt与权限双校验、单次识图建模
floor-plan-spec.mjs: 严格HouseSpec与洞口/家具范围校验
floor-plan-api.mjs: 三个平面出图入口独立config/jobs、归档能力准入、成功槽位异步归档与失败恢复、连接隔离及更新忙碌守卫
floor-plan-archive-input.mjs: 逐图稳定归档ID、原图/实际送模图及Prompt SHA校验、结果/机位/逐图回执投影和串行同步
floor-plan-archive.mjs: 三个平面图出图功能标签和飞书Schema、按归档ID查重与附件续传、字段和下载字节校验
floor-plan-service.mjs: 导出显式文生图/默认图生图、可选complexity/多参考图/指定画幅及按请求像素限制解码的图片执行原语；GPT2.6双模型身份/权限与历史兼容；布局四模型可选/默认参数与真实路由、后续Sunburst三动作保留；单图/Prompt/所选权限复核、PNG交付与原生格式/实际尺寸/费用回执
floor-plan-prompt.mjs: 独立飞书设计实验室v2 JSON三动作资产严格解析、上架版本/SHA冻结与脱敏目录，缺失不回退
image-upscale-capabilities.mjs: 独立/嵌入KS共享的节点接口/模型枚举纯验证和15分钟执行/5分钟排队常量，无网络或工作流构建
effect-beautification-lighting.mjs: 新增光影纯词照明保护合同/三字段身份、入队和执行卡片版本SHA复核、固定low/natural与归档元数据；原六档无库依赖
ai-render-studio-lighting.mjs: 共享飞书氛围库九卡纯词读取、单卡ID/版本/SHA与正文冻结及执行重验，原光影零库依赖/脱敏目录/完整计划摘要

ai-render-studio-archive.mjs: GPT2.6双模型身份/权限与历史兼容； 专属13列/枚举与附件ID Schema门禁、实际Prompt/计划/原件/guide/原生结果SHA尺寸防漂移manifest与字段投影
ai-render-studio-sync.mjs: 按真实任务ID查重与既有记录续传，字段/token回读和附件下载SHA核验，失败只同步不重跑生成

http-security.mjs: 平面机位页面精确路径同源嵌入； HTTP安全头真源，仅AI渲染台页面允许同源嵌入，其余页面与API禁止嵌入
ai-render-studio-definitions.mjs: 独立8MiB/4096px输入、单次工作流版本与保原材质/四种渲染风格目录
ai-render-studio-prompt.mjs: 独立飞书AI渲染台Prompt表tbl9Djf4iVWzRxf5的完整JSON严格解析/唯一上架版本SHA与脱敏配置，禁止跨表回退
ai-render-studio-service.mjs: GPT2.6双模型身份/权限与历史兼容； 同库九卡原词/原光影与typed控光/四种风格同次Sunburst渲染，用户原文及typed控光前置/快照冻结/权限门禁/原生PNG与私有实际Prompt回执
ai-render-studio-api.mjs: GPT2.6双模型身份/权限与历史兼容； 独立config/jobs与当前进程幂等、只读恢复/同步状态和仅归档重试，忙碌检查包括生成与同步
white-model-lighting.mjs: 白模可选纯词光影规范化、卡片版本SHA入队/执行复核、Agent输入优先级与脱敏归档身份，自动不读库，不加载精模规则或卡片原图
lighting-transfer-prompt.mjs: 独立飞书光影转换Prompt表tblOQOF7m7eKMIAA的上架版本/正文SHA与脱敏目录，缺失下架阻断，不改精模迁移规则
lighting-transfer-workflow.mjs: 已有效果图与库卡片原图双图迁移，用户原文先于独立保护Prompt/版本冻结，实际送模正文与原件SHA和图序同文归档
beta-panorama-archive-contract.mjs: Beta全景纯词光影/原图SHA/卡片与Prompt版本冻结，R5_4实际原尺寸及产物SHA强核验和旧美化恢复边界
panorama-workflow.mjs: R5_4四步Euler/20视角1536球面状态共享工厂，原尺寸输入输出、唯一产物与源SHA追溯，独立于普通Flux
panorama-client.mjs: 全景专用ComfyUI适配器，真实2:1与23类节点/模型/连线执行前准入、20分钟执行窗口及尺寸/SHA回执
panorama-lighting.mjs: 纯词全景光影合同/卡片版本SHA冻结，非空用户要求首段后接保护合同与卡片、空补充兼容，保护结构材质且允许按目标改光照，无第二张参考图或精模规则
texture-enhancement-prompt.mjs: 独立飞书质感增强Prompt表/上架版本唯一读取器，默认tblQJtk95Sr5IueL；最新或指定版本/正文SHA与脱敏目录、forceRefresh，缺失下架拒绝且无本地/跨表回退
refined-flux-reference.mjs: 精模与效果图光影转换共用4步/CFG1/Euler双图图工厂，节点模型预验、1K/2K独立长边、普通单图路由与SHA元数据
refined-lighting-library.mjs: loadRefinedLightingAssets独立只读卡片/原附件与轻量预览，loadRefinedRenderAssets组合精模完整Prompt目录；Prompt失败保留共享卡片，无旧规则或本地fallback
refined-lighting.mjs: 精模用户补充统一前置，再接纯词完整Prompt+卡片或参考迁移/氛围词双图正文；纯词拒旧公共规则冻结，双图独立Prompt及原件图序/SHA复核，效果图迁移编码可注入且共享卡片隔离
refined-render-prompt-asset.mjs: 精模四块资产纯解析器，将主正文与三列JSON模块规范化为内部MAIN/TIME/WEATHER/TONE，三列全空兼容旧纯文本，缺组/错型/未知键/空模块以409阻断
refined-render-prompt.mjs: 精模同表完整纯词/迁移/氛围词双图的code版本正文SHA/source冻结与执行前复核；纯词无分散规则，双图不回退纯词，历史结果保留
image-relight-prompt.mjs: 独立飞书打光JSON资产唯一读取器，复用同构版本/上架/缓存，校验完整结构与版本重复/正文SHA，无本地或跨表回退，公开脱敏版本与表链接
image-relight-presets.mjs: 飞书bundle的场景/摄影规则编译器，五模板/局部/三旧方案路由，整体原灯/单灯/新增补光的同源优先级保留代码，不持有运营正文
image-relight-service.mjs: GPT2.6双模型身份/权限与历史兼容； 飞书上架Prompt配置/服务端快照准入，Key/Schema/资产三门禁，旧省略模板兼容及真实图片/整体原灯三选/空标注有效动作准入、模板拒绝整体暗参/Prompt脱敏与归档
image-relight-oneapi.mjs: GPT2.6双模型身份/权限与历史兼容； 用户原文/typed光源动作前置的Sunburst v10快照编译，原灯/模板单图及标记双图、动作优先级/摄影资产/历史保护，实际Prompt与原生PNG/SHA/尺寸/费用及一次收费提交
image-relight-archive.mjs: GPT2.6双模型身份/权限与历史兼容； v10整体原灯canonical三方冻结/计划摘要与v8起飞书资产身份复核，旧v1-v9原字段摘要/Prompt兼容，四局部动作/模板/幅度冻结，单/双参考真实身份/尺寸/Prompt/费用投影及字段附件双回读manifest
image-mask-fill-qwen.mjs: Qwen-Image-Edit-2511独立双模式局部重绘、Lightning4步/denoise1、约1MP统一图像遮罩条件/原尺度回贴、用户原文直投与同次History实际尺寸、独立产物/节点准入
image-mask-fill-archive.mjs: GPT2.6双模型身份/权限与历史兼容； 二次编辑功能/字段/模式及Flux模型标签真源，三模型真实身份/档位质量/尺寸/实际Prompt投影及Responses后台或Images edits来源标签；消除操作与实际回执一致后写生成参数JSON，参考用途不新增列；原件/结果/mask/编辑参考图/实际矩形或多边形送模PNG分列，复用框选原图附件且SHA与提交回执一致，未用附件留空并保留费用版本
image-mask-fill-workflow.mjs: 提示词编辑/参考图编辑稳定key与新标签，Flux2双模式三图Base64、首图latent/参考条件、2K/4K/原图推理与裁剪回贴/最高2K；唯一产物、同次History真实尺寸及供Qwen复用的执行图端口准入
image-mask-fill-oneapi.mjs: GPT2.6双模型身份/权限与历史兼容； Sunburst .16局部消除显式操作原文直投且不拼填充模板，操作及独立Prompt版本写请求摘要/实际回执；无mask使用Responses后台提交/同ID轮询与即时任务ID，透明mask保留Images edits同步；原图/可选透明mask或真实蓝色矩形/自由多边形轮廓定位目标物体，像素取整再验面积/至少3px边界/不以bbox代替轮廓；原尺寸4096输入与模型目录三档五质量默认1K/medium，普通编辑用户原文先于定位及物品/材质参考模板，实际送模圈选PNG精确归档及单帧PNG原始字节交付
image-mask-fill-service.mjs: GPT2.6双模型身份/权限与历史兼容； 三模型双模式及显式remove操作准入，公开独立removalPromptVersion；消除必须真实mask或editRegion，操作/版本透传三模型请求摘要/回执/归档；Flux/Qwen必填遮罩/最高2K；GPT公开矩形/自由圈选与物品/材质用途目录，参考模式默认换物品/指令可省略且保留空原文、复用共享可选策略，涂抹/矩形/多边形互斥、独立区域归一化及无mask扩展归零；三档五质量默认1K/medium，权限/Schema前验与异步五附件归档、内部图片载荷剥离
image-multi-angle-archive.mjs: 三模型统一飞书归档投影、四个机位字段与Qwen独立标签，分别保存实际提交指令/共享指令版本/工作流版本、原始参考图/真实结果和执行尺寸，不重建历史Prompt
image-multi-angle-oneapi.mjs: GPT2.6双模型身份/权限与历史兼容； Banana2.1/Sunburst共用英文镜头语义与合法2K最近画幅，Sunburst复用模型真源的五档质量/默认medium/非法档位前置400，复用Responses/edits单次请求并保留实际quality与费用回执；读取真实产物，长边超2048只缩小，记录原生/交付尺寸与SHA，禁止把机位意图当几何保证
image-multi-angle-service.mjs: 多角度单图应用服务，Qwen节点模型与Banana2.1/Sunburst逐项权限准入/脱敏质量目录，模型和质量白名单、20MB原图压至长边最高2K，统一任务/进度/飞书原图与结果归档，独立无调度试跑仍可本机执行
image-multi-angle-image.mjs: 共享尺寸策略下的多角度20MB/6400万像素/单边16384准入、EXIF归一化、大图长边2048与8像素对齐，小图不放大，推理即输出尺寸
image-multi-angle-prompt.mjs: Qwen/Banana/Sunburst共用全英文镜头语义真源，严格机位校验、原机位零点/反打/俯仰/景别/空间保持约束，独立指令版本2026-10-26.en.1
image-multi-angle-workflow.mjs: 主工作台/独立试跑复用共享英文机位指令，拒绝连续景别伪精度、Qwen2509双LoRA原生图、长边最高2K直接推理、无后置放大、实时节点模型准入与真实产物元数据，不进入正式模型目录

image-outpaint-service.mjs: GPT2.6双模型身份/权限与历史兼容； AI 扩图 Flux/Qwen/Sunburst 三引擎应用边界，含新旧COMBO枚举准入，共享原比例/预设固定2K画幅/位置/scale计划，省略档位补2K且显式1K/4K前置拒绝，旧四边输出仅允许2K，EXIF后按真实等比缩放适配并记录原尺寸/缩放事实/用户scale；Sunburst原图16384px与API适配图3840px边界分离，超限只执行最终一次等比resize，狭长原比例只最小扩大目标短边且归档targetAdaptation，零扩展显式阻断且旧省略scale请求兼容；两款 Flux 候选与Qwen节点分别准入/缓存30秒/执行前复核，非Flux拒绝Flux模型参数；保留各引擎尺寸/Key合同，实际产物校验后复用飞书调度并返回同步身份，底层无调度可独立验证
image-outpaint-archive.mjs: GPT2.6双模型身份/权限与历史兼容； 三引擎共用飞书归档投影与独立模型标签目录，保留实际提交源图/输出/画布/原尺寸/缩放/模型/LoRA/种子/产物指纹/费用/耗时；Flux/Qwen只归档同次History实际捕获正文与来源，缺失留空且不冒用固定约束，Sunburst沿用动态真源，不扩展通用模型目录
image-outpaint-janus.mjs: Flux/Qwen共享Janus-Pro-1B固定配置与节点工厂，只分析未扩边原图并捕获当前SaveText单条正文，保留原Flux问题/seed/temperature/topP/999tokens
image-outpaint-qwen.mjs: 独立 Qwen Image Edit 2511 FP8 mixed 扩图真源，2026-10-20.1的25节点运行图，Janus question不变，动态正文原文直连SaveText再到positive，不含固定前缀/Scene continuation或StringConcatenate，并归档同次实际原文，Lightning4steps/CFG1/euler/simple/shift3.1；整张pad画布与mask统一约1MP/8px参考及采样尺度，保留latent遮罩后整图解码恢复目标、不回贴原图，原区允许编解码变化；节点/COMBO/INT槽位准入与请求级产物，分别记录推理/输出/插值恢复/非像素保真且不冒充AI超分
image-outpaint-workflow.mjs: AI 扩图真实执行图真源，2026-10-19.1适配MaaS prod_test参数1082原18节点并增加SaveText实际提示词透传，输入准入统一放宽至每轴 4096px，受控选择 Flux Fill OneReward FP8/原版 Dev 与各自权重格式，固定 Janus-Pro-1B/20步/guidance30/feathering30，保留 LayerStyle 比例截断后 ceil32 预处理、8px 目标、唯一产物与尺寸/原始来源 SHA-256；643 仅截图线索
image-outpaint-oneapi.mjs: GPT2.6双模型身份/权限与历史兼容； GPT Image 2.5 Sunburst 编辑扩图适配器（2026-10-19.1），原图最高16384px/适配图最高3840px独立合同及原比例超3:1最小目标补边政策，按实际输入/四边构造动态Prompt供执行与归档共用，生成透明PNG/外围透明mask，开放模型真源9个2K预设与原比例长边2048/16px对齐/3:1限制及655360–8294400像素范围、固定medium/n1/png、实际尺寸/结果/画布/遮罩SHA-256、placement与真实费用身份
image-tools-api.mjs: 含GPT打光脱敏Prompt及forceRefresh透传的图片工具只读配置API，提供本地二次编辑分模式能力/输入合同及多角度脱敏目录/实时准入，主/Beta共用超分整图/分块节点合同探测并逐候选返回可用性，公开Flux/Qwen/Sunburst三引擎固定2K与各自输入合同、动态可用性和准入原因

CLAUDE.md: 本模块地图，维护服务端业务模块清单
app-update.mjs: GitHub 正式 Release 更新检测边界，比较 SemVer、核验标准运行 ZIP 与仓库链接、匿名读取公开仓库及无说明正文的版本页 HEAD 兜底，并提供总超时、并发去重和成功/失败分档缓存
app-update-api.mjs: 共享版本检查与安装 HTTP 边界，按服务端最新正式版回执、安装政策及运行任务状态准入，流式返回安装进度/错误并保护待重启与恢复失败状态
app-installer.mjs: 正式版本安装边界，固定仓库 ZIP/官方 SHA-256 与受信重定向/容量/ZIP 路径准入，无 shell 解压；含 .git 的源码工作区仅安装到持久新目录，无 .git 的 Release 目录原地事务替换发布运行根项、保留配置/依赖/数据并失败回滚；公开 getPolicy/isRestartRequired/isRecoveryRequired，成功后要求重启，恢复失败保留备份与操作指引并阻断再次安装，不自动重启
model-config.mjs: GPT2.6双模型独立complexityOptions目录与normalizeImageComplexity严格准入，默认不传且不替代quality；GPT2.6双模型身份/权限与历史兼容； 服务端编译正文32k/普通用户8k分离与请求字段不可提额；模型参数/Provider/完整型号和历史别名真源；普通Flux4K/6K公开KS直入27.1身份/版本/输入限制，normalizeFluxPostUpscaleInput冻结新KS或历史3B，真实2K尺寸预检与目标规划；保留旧房负向、GPT尺寸矩阵、全景原尺寸和精模/光影转换双图1K/2K
generation-batch.mjs: 单模型多张/多模型生成批次契约，批次总数不受模型数量上限约束，严格校验共同批次 ID、正安全整数总数与批内序号；单模型张数由任务入口独立约束
generation-jobs.mjs: 日常生图后台任务层，提供最多两路并发的保序批执行、部分失败、进程内任务查询、领域阶段快照透传及有界结果保留；只读hasActiveJobs守护running任务供原地更新准入
generation-job-api.mjs: GPT2.6双模型身份/权限与历史兼容； 独立超分双噪声入队前400及数值快照冻结，既有jobId幂等不变；Flux后置超分逐项身份冻结/真实2K尺寸Agent前预检；白模promptLighting能力/卡片入队规范化与冻结、跨功能拒绝；局部消除Prompt版本准入与操作身份冻结；光影转换独立Prompt/卡片及原附件SHA入队冻结/去重，全景纯词卡片入队前冻结/去重，按模型/光影ID限额且版本SHA不另开计数，排队执行阶段透传；supportedGenerationFeatureModes/supportedGenerationFeatureCapabilities公开运行进程功能及全景多光影能力目录；精模入队必选光影来源或明确有效旧参数，冻结独立基础code/版本/SHA及规则/卡片/实际氛围图身份并去重，兼容旧四块/双资产；GPT打光单图/模板融合/整体原灯及真实局部光源深冻结及独立scope、日常生成后台任务 HTTP 适配层，普通生图含质感增强按真实目录准入；精模按模型/光影ID/模式计数，每组合单模型1–4张/多模型各1张且版本SHA不另开限额，两路并发；旧房与空房共用普通任务与按张数进度；需归档先验飞书Schema；超分最多4项/扩图1项，扩图固定2K且按引擎权限准入，多角度单图机位准入；二次编辑仅单项、真实主图/遮罩及GPT归一化矩形或多边形前验、分模式能力/GPT参考用途与圈选参数冻结、透传上游后台任务ID/状态并以独立imageMaskFill scope校验飞书新增字段，仅超分豁免飞书；美化六档/新卡按模型和模板身份限额，单模型每组合1–4张/多模型各1张且版本SHA不另开计数，公开multipleLightingSelections；新卡入队去重冻结/跨功能拒绝及promptLighting能力目录，仅新卡强制低自然
generation-service.mjs: GPT2.6双模型身份/权限与历史兼容； 白模专属光影字段在直调与按功能执行入口前隔离；光影转换独立双图工作流/Prompt与卡片读取器可注入，质感独立Prompt读取器可注入且生产默认飞书；Main/Beta全景按feature/provider路由专用客户端、缺配置拒绝回退及进度透传；独立GPT打光/执行前Schema及显式功能路由统一覆盖输入身份，自由生图直接入口也固定free以拒绝冒用旧房场景，含风格转换、氛围转换、美化与质感增强固定词；旧房入口直接复用emptyRoom单流程；扩图取Flux/Qwen或Sunburst编辑客户端并归档；日常超分本机结果/Beta独立归档，二次编辑独立客户端/配置、GPU前专属Schema复核与飞书同步，多角度按冻结模型分流并重查权限；美化新卡纯词库读取可注入及跨入口隔离，旧六档保持原工作流
image-upscale-service.mjs: 双噪声准入、实际值透传/请求记录与非零节点能力探测；主/Beta独立超分实际尺寸/版本及节点准入；复用image-upscale-capabilities纯合同和KS时限，保留15分钟执行/5分钟排队、精确PNG与异常不自动重提，独立默认仍攸行3B
image-upscale-workflow.mjs: 独立超分双噪声0..1/0.001纯合同、目录能力及实际节点/元数据，省略为零；六套SeedVR2真源与独立攸行默认/Flux后置KS常量分离；KS直入27.1的6K固定5120推理/6144交付，其余KSstrict20MP，正式阶段/目标/计划/元数据共用
beta-upscale-archive-contract.mjs: 从Base提取的纯超分合同，当前fixed5K与20MP严格分开，旧直入26.3/更早历史仅原件恢复，源/目标/推理/成品/SHA逐字段验证
beta-base.mjs: 扩图建档复用OneAPI引擎白名单，含GPT2.6两款真实标签； 户型布局独立功能与标注/Agent/Prompt/SHA归档和恢复强校验； 含Beta质感增强固定Prompt批跑；后置KS身份快照/实际版本摘要和归档强核验、旧3B快照只恢复且不改历史正文；旧房独立功能标签/场景及版本快照、实际Agent强校验与带参考图异步冷恢复；当前模型完整名归档与旧冻结别名兼容；全景版本1快照冻结/最终Prompt与卡片/原尺寸SHA核验及旧美化恢复边界；精模实际Prompt code/版本/SHA与execution冻结归档，纯词用基础、迁移/上传用迁移规则、氛围词双图用独立图序前置规则且版本摘要去重，纯提示词单图/附原卡图及上传双图分路；图文预设建档前解析核验并归档服务器原件，版本摘要区分prompt-and-reference/prompt-with-reference并回读图序/数量/SHA；旧双图归档按历史图数和摘要恢复；独立三表归档与十三功能映射，真源标签及无Agent清空Prompt融合；KS直入27.1固定5K/其他KS20MP由专用archive-contract核验，旧直入26.3/20.1/21.1/26.1/26.2仅原件恢复；冻结扩图/风格/美化/全景配置；captureBetaGenerationArchive复用正式Prompt投影且不写旧表，版本/尺寸/费用逐字段回读，图片工具额外核验附件token/字节；合同错误不可重试409，浮点机器精度容差与上传幂等；历史原件下载核验SHA/尺寸后仅恢复状态，确认后展示预览；美化卡片身份进入场景/配置快照及结果版本摘要
beta-sample-store.mjs: 旧房与空房共同保存逐样本房型；新建按当前功能归属、已有样本跨功能按目标功能读取的草稿样本集、{id}对象关联、逐张真实8MB/MIME/尺寸校验、稳定ID/内容幂等及附件回读，全部确认才发布；列表仅元数据，执行时按需读单张原图，全景再次核验2:1，扩图保留真实源尺寸交执行引擎准入，预览按需WebP，不设整集图片容量上限
beta-base-schema.mjs: 含Beta质感增强固定Prompt批跑；含旧房改造的十三功能，复用现有场景/配置/版本/Agent/附件字段；Beta三表字段合同真源，实时分页校验含AI扩图的十三功能、普通/独立扩图/六超分工作流模型及图片输入Agent单选标签、全部字段类型/附件ID/关联目标；扩图与风格转换复用配置/场景/版本/生成参数及附件字段，允许历史附加选项，合同错误不可重试，不读取旧生成记录或Benchmark表
beta-upscale.mjs: Beta六套超分目录与真实尺寸合同，默认攸行3B；冻结直入27.1/其他当前版本，能力门禁与执行前阻断漂移；受信旧直入26.3/更早任务仅进入Base原件恢复
beta-outpaint.mjs: GPT2.6双模型身份/权限与历史兼容； Beta扩图四稳定工作流与脱敏能力目录，复用两款Flux Fill/Qwen2511/Sunburst模型真源；严格映射引擎/模型并冻结真实标签，固定2K、原比例或五预设、居中和1.5/2/3倍，拒绝身份冲突/四边参数/重传图片，入队及执行前独立核验所选候选可用性，不复制推理或归档
beta-runner.mjs: 户型布局单次执行/主卧标注及Prompt版本冻结； GPT2.6双模型身份/权限与历史兼容； 含Beta质感增强固定Prompt批跑；后置超分新KS/旧3B身份冻结、惰性源图取回后建档/Agent前尺寸预检；旧房独立两路正整数版本/房型/权限准入、执行映射emptyRoom＋room-renovation且非旧房拒绝冒用；全景光影卡片入队前冻结并逐次重验、R5_4只一次GPU Attempt；精模必选光影来源或明确有效旧参数，唯一配置串行冻结独立基础code/版本/SHA及规则/卡片/实际参考图并去重/共享图片解包，资产准备失败零入队，历史original仅恢复已有结果、缺结果零建档/出图，兼容历史四块/双资产；十三功能样本草稿/逐张保存/完成回读与ID批次三表Schema准入，真实成员/目标输入内容及Agent/全景/风格转换冻结版本校验；来源功能不阻断跨功能复用，原样本不复制/重传或改写，两路并发逐项lazy读取原图；扩图/超分异步配置、零重传、真实尺寸在beginRun前预检及候选能力执行前复核，Comfy扩图/超分不依赖Prompt Agent Key；共享生成服务与独立Beta归档保持生成/同步双阶段，逐Run结构化预警，手动RETRY保留成功项与原冻结输入、只续失败Attempt，旧任务可携冻结批次恢复并先复用已上传附件；仅同步失败保留原结果/记录且零重新生成，普通瞬时生成错误最多三次新Attempt、400/409不自动重试，Sunburst扩图最多一次执行，重复点击复用重试任务，全部生成同步结算前hasActiveJobs持续忙碌；受信旧KS失败批次恢复可保留旧版本，恢复无结果仍零建档/GPU拒绝；美化新卡入队串行去重冻结与执行前重验/恢复已有结果不重复生成
effect-render-enhancement-prompt.mjs: 效果图氛围转换/全景图美化 Prompt 资产边界，原效果图表 ID 与 effect-render-enhancement 编码保持兼容，分别公开脱敏可用性/当前上架版本；氛围严格校验 BASE/DEFAULT/CONTRACT/TIME/WEATHER 并按环境拼接，全景接受纯文本/开放 MAIN JSON 与根级尾逗号，禁止跨表回退
effect-render-enhancement-workflow.mjs: 含Beta质感增强固定Prompt批跑；四功能双Provider单图服务；美化原六档保留，新增纯词卡片固定低自然工作流/独立照明保护合同与实际版本SHA归档；质感原文空负向无LoRA，全景独立R5_4
empty-room-furniture.mjs: 空房家具领域真源，提供线上同名同序目录及独立房型多选推荐、“其他”输入标记及 200 字上限、选择来源归档、仅非空已选需求 Prompt 投影；空条件省略，不推断未选品类为排除项
empty-room-type.mjs: 空房房间类型领域真源，维护十个客户可选值、“其他”详情 40 字上限，并向公开目录、工作流校验与飞书同步提供同一归一化合同
image-dimensions.mjs: 无解码图片尺寸探测器，从 PNG IHDR、JPEG SOF 与 WebP VP8X/VP8L/VP8 图片头读取参考图与生成结果的可信宽高
agent-model-config.mjs: Prompt Agent 模型真源，维护十一个候选 ID（含 DeepSeek V4.1 Flash 与 Doubao Seed 2.0 Lite）、图片输入能力与接口可用性组合，不纳入 Opus
oneapi-image-async.mjs: 复用模型真源校验可选complexity并仅放image_generation工具；无mask原始PNG及图序的Responses background提交/1.5秒轮询、单次收费POST、同ID/终态校验、提交到正文与等待共享600秒总预算、取消及即时ID回调；透明mask明确拒绝
oneapi-client.mjs: Prompt Agent空回复错误保留已知requestId/费用且不附正文；同步Responses按模型真源校验并透传可选complexity工具字段；按阶段独立限时/外部及单请求 AbortSignal 的 OneAPI HTTP 客户端与 ONEAPI_REQUEST_TIMEOUTS 真源：目录 30 秒、提示词/Style DNA 300 秒、出图/编辑 600 秒、分析/评审 180 秒，每次 HTTP 请求至完整响应体独立计时，专用 undici Agent 避免底层默认 300 秒提前截断且不改全局连接；Prompt Agent/分析/Style DNA/图生图走 Responses、Claude 双图评审走 Chat Completions；editImageAsync使用Responses后台任务并归一化结果/费用，editImage 使用 JSON POST `/images/edits` 原样传透明 PNG/mask、不经 JPEG 压缩且不重试收费 POST，保留阶段/模型/限时脱敏诊断及请求身份/费用
ai-texture-workflow-config.mjs: Flux默认参数和工作流身份、后置超分输入/版本/目标校验与aiTexturePostUpscaleRequest；独立postUpscale实际模型/源尺寸/推理/交付/SHA元数据，不覆盖Flux或美化1920核心信息
ai-texture-workflow.mjs: 普通Flux9B7步或美化六预设核心，经2K中间图进入正式KS直入7B后置阶段；显式源尺寸/版本、4K或固定5K到6K、唯一72 SaveImage，历史3B显式兼容及原负向规则保留
comfyui-client.mjs: 原子提交/History/view/取消及数字分段耗时；嵌入KS按实际子图校验节点和7B枚举、15分钟执行/5分钟排队、未知提交或后续异常不自动重提且保留Prompt ID，PNG和真实交付尺寸强验；其他消费者保持原合同
comfyui-timing.mjs: 请求内单调时钟分段与HTTP状态/尝试计数，仅有限数字叶子；History网络等待覆盖远端执行不可累加，原始远端时间戳及POST ack差标跨时钟，缺失不编造纯排队，无Prompt/URL/图片/Key
lark-cli.mjs: 飞书 CLI 基础设施，优先解析项目内固定版 1.0.77、首次调用校验最低版本，移除 OneAPI Key 后统一子进程环境、执行、JSON 解析、超时和错误归一化
lark-setup.mjs: 运营首次运行边界，检查固定版本 CLI、应用配置、用户 Token、字段读取/记录读写/附件上传最小 Scope 与 Base 可读性，并编排非阻塞 Device Flow 和临时二维码
local-settings.mjs: 本机设置边界，保留未知环境项并原子写入或删除 .env.local 中的 OneAPI Key
lark-sync.mjs: 导出既有记录/附件I/O及字段/token回读供独立渲染台复用；二次编辑新字段/选项写入与历史Flux模型标签补归档规范化，保留内部feature与模式key；光影转换与质感增强独立功能枚举/固定词归档，含打光独立scope/原件与实际引导图双参考附件/参数及字段附件双回读的飞书生成记录同步边界，既有Schema/字段/附件与生成投影保持原范围；遮罩专属scope要求七列/模式/功能/模型枚举并动态解析附件ID，原图/结果/遮罩/编辑参考图/框选原图分列，框图实际PNG/size/送模SHA校验，GPT无mask时附件留空并校验hasMask，结果真实SHA与附件manifest留档、字段和token/字节两次回读通过才成功；失败只标同步失败，不重跑GPU
image-artifact.mjs: 图片产物基础设施，依赖 sharp 统一生成结果 data URL 解码、受限远程下载、输出扩展名、不修改原件的模型请求 JPEG 降质/缩放压缩与任务快照用轻量 WebP 预览
image-download.mjs: 生成结果下载边界，复用受限图片读取并生成跨域安全的字节、MIME、文件名与附件响应头
benchmark-base-schema.mjs: comparisonModelLabels按稳定ID优先解析当前名/历史别名；Benchmark Base Schema 适配层，维护五张运行表投影字段，按实时字段存在性/可写类型/单选选项校验全部普通回填，并以稳定编码解析冻结配置展示名、剥离默认 medium 后缀、阻止未建模质量档
benchmark-base-config.mjs: Benchmark Base 连接/响应协议层，解析五表环境配置、必填项、分页 envelope 与单选字段值
benchmark-base.mjs: 当前模型名与历史附件列按既有列ID兼容读写；Benchmark 飞书持久化边界，分页读取五张运行表，在统一写入口按实时 Schema 校验字段/类型/单选值并隔离系统与附件字段，录入完整样本标签、批量同步样本集名称、读写附件，幂等回填配置、Prompt、逐 Run、三维评分/细则/时间、费用、重试链和展示宽表，并筛选三类实验视图
benchmark-identifiers.mjs: Benchmark 标识基础设施，兼容历史模型横评并支持任意提示阶段候选维度的稳定 Prompt/Run/重试 ID、SHA-256 与 Provider 归一化
benchmark-experiment-config.mjs: Benchmark 实验配置领域层，把 `variableKey + variantValues` 规范化为八类质量配置的单变量候选与稳定配置 ID，并推导提示/出图阶段及校验 Provider 输出能力
benchmark-model-access.mjs: Benchmark Provider 准入层，统一检查 OneAPI 模型权限与 ComfyUI 等外部图像服务健康状态
benchmark-plan-input.mjs: Benchmark 计划输入边界，集中维护资源 ID/版本/正整数/同组一致性校验、有效样本筛选与显式 ID 集合归一化
benchmark-runner.mjs: 历史模型名宽表恢复/已处理进度与重复收费防护；可主动取消的通用单变量横评应用服务，按因子阶段决定候选间共享或隔离冻结 Prompt，并映射飞书“模型横评/Prompt 横评”实验类型，校验模型权限与输出策略，贯穿费用，逐 Run 留存成功失败和重试、重建持久化进度并同步横评展示
benchmark-review.mjs: Benchmark AI 评审领域层，维护 `white-model-review@v3.1-single-pass` 的单次白模准入与三维 1–5 小数评分、三维证据隔离、完整 JSON 提取/严格契约与单次修复、正式评分 Run 断点筛选、原文留存、MINOR/MAJOR/CRITICAL 本地封顶、40%/30%/30% 加权准入、飞书可读评分细则与浏览器评分目录投影、旧协议隔离、P95 及模型分类分析
benchmark-labeling.mjs: Benchmark 样本 AI 标注领域层，维护 `sample-labeling@v2`、受控空间与空间结构/镜头/软装/材质复杂度/输入质量五个独立低中高维度、人工准入隔离、单图视觉模型协议、严格 JSON 解析、理由和置信度
benchmark-workbench-store.mjs: Benchmark 当前 worktree 本地状态边界，原子持久化样本集、实验、样本分类元数据、评审批次和版本化 AI 评分，并兼容旧状态迁移
benchmark-workbench.mjs: 当前及历史图片列兼容模型准入；Benchmark 浏览器应用服务，编排样本治理、五维 AI 待审标注、八类单变量零写入计划、确认后配置落库/可取消运行、停止实验 Base 进度重建、v3.1 单次评分与按 Run 断点继续/写回/分析及飞书跳转，并持久化任务阶段、评分失败批次、结构化评分事实与拦截协议漂移
benchmark-jobs.mjs: Benchmark 后台任务注册表，为长耗时批量生成与 AI 评分公开阶段、Base 落库状态、起止时间、进度、主动取消、结果和可诊断失败消息；只读 hasActiveJobs 同时保护 running/cancelling，容量清理不得移除未结算取消任务
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: 统一 Prompt 资产边界，维护 `AI 生图` Base 内白模/空房及独立旧房表的智能默认/平台融合、独立风格转换表的平台风格及参考图、风格反推配置，以 Agent 编码稳定路由并支持可选展示名，用五分钟进程缓存输出脱敏已上架版本目录、单 Agent 可用性与默认最高/指定版本读取
refined-model-prompt.mjs: loadRefinedLightingPromptAssets同表读取三模式完整纯文本与正文SHA/真实来源；版本目录与旧精模编码/模块隔离，完整上架准入且下架409不可绕过
refined-model-workflow.mjs: 用户补充统一前置的完整纯词Prompt+卡片单图、迁移完整Prompt双图与氛围词完整前置+卡片双图；真实Prompt表来源/版本SHA与原件图序归档，历史兼容和脱敏响应
white-model-workflow.mjs: 复用design-prompt-output自由正文/用户前置； 用户原文前置Agent输入/最终正文；空房/旧房接受任意JSON或纯文本并阻断空/损坏回复，独立输出缓存版本和32000字符额度；白模/风格转换保留字段校验，各独立Agent/版本、房型家具/参考图/光影准入及最终单图/双Provider同文归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，向浏览器公开脱敏已上架 Prompt 版本目录与附件策略，仅在服务端精确读取所选正文，首轮接收无业务数量上限的 PNG/JPEG/WebP/GIF/PDF 并支持仅附件触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-attachment.mjs: Style DNA 多模态附件安全边界，在通用图片校验之上增加 PDF 文件签名、MIME、真实字节、单文件/合计容量与可选数量校验，并输出 Responses 图片/文件附件
reference-image.mjs: 参考图安全边界，保留生成链路默认最多 4 张并允许调用方配置格式、容量及可选数量上限，统一校验 MIME/真实字节并附加可信图片宽高
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询；只读 hasActiveJobs 在 pending 同步结束前阻断原地更新；仅开放已启用的失败归档同ID重试

generation-config.mjs: 生图与Beta共用脱敏配置/统一刷新，精模完整Prompt读取故障仅降级对应目录并保留真实错误，不牵连白模/全景/光影转换与共享卡片；其他配置错误继续抛出，正文与附件token留服务端
effect-beautification-prompt.mjs: 独立效果图美化固定 Prompt 真源，读取 effect-render-beautification 上架版本，复用执行预设真源准入LOW/HIGH×NATURAL/WARM/COOL，默认low/natural、拒绝未知值、逐字选择正向正文，公开脱敏目录且禁止跨表回退
effect-beautification-workflow.mjs: CF六原图的共享美化阶段及参数真源，LoRA0.45/0.7、2/4步、ab匹配及按mode旁路的亮度/色温，1920等比/16补边裁剪/输出档适配，用户首段不被幂等触发词前插，实际元数据与节点准入

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

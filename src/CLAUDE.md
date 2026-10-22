# src/
> L2 | 父级: ../CLAUDE.md

成员清单
image-mask-fill-qwen.mjs: Qwen-Image-Edit-2511独立双模式局部重绘、Lightning4步/denoise1、约1MP统一图像遮罩条件/原尺度回贴、用户原文直投与同次History实际尺寸、独立产物/节点准入
image-mask-fill-archive.mjs: 三模型真实身份/档位质量/尺寸/实际Prompt投影；原件/结果/mask/物体参考图/实际矩形或多边形送模PNG分列，复用框选原图附件且SHA与提交回执一致，未用附件留空并保留费用版本
image-mask-fill-workflow.mjs: Flux2双模式三图Base64、首图latent/参考条件、2K/4K/原图推理与裁剪回贴/最高2K；唯一产物、同次History真实尺寸及供Qwen复用的执行图端口准入
image-mask-fill-oneapi.mjs: Sunburst .10无mask使用Responses后台提交/同ID轮询与即时任务ID，透明mask保留Images edits同步；原图/可选透明mask或真实蓝色矩形/自由多边形轮廓定位目标物体，像素取整再验面积/至少3px边界/不以bbox代替轮廓；原尺寸4096输入与模型目录三档五质量默认1K/medium，形状中立Prompt增删改换/去标记，实际送模圈选PNG精确归档及单帧PNG原始字节交付
image-mask-fill-service.mjs: 三模型双模式准入，Flux/Qwen必填遮罩/最高2K；GPT公开矩形/自由圈选两能力，涂抹/矩形/多边形互斥、独立区域归一化及无mask扩展归零；三档五质量默认1K/medium，权限/Schema前验与异步五附件归档、内部图片载荷剥离
image-multi-angle-archive.mjs: 三模型统一飞书归档投影、四个机位字段与Qwen独立标签，保存实际提交指令/版本、原始参考图/真实结果和执行尺寸，不重建历史Prompt
image-multi-angle-oneapi.mjs: Banana2.1/Sunburst机位语义与合法2K最近画幅，Sunburst复用模型真源的五档质量/默认medium/非法档位前置400，复用Responses/edits单次请求并保留实际quality与费用回执；读取真实产物，长边超2048只缩小，记录原生/交付尺寸与SHA，禁止把机位意图当几何保证
image-multi-angle-service.mjs: 多角度单图应用服务，Qwen节点模型与Banana2.1/Sunburst逐项权限准入/脱敏质量目录，模型和质量白名单、20MB原图压至长边最高2K，统一任务/进度/飞书原图与结果归档，独立无调度试跑仍可本机执行
image-multi-angle-image.mjs: 共享尺寸策略下的多角度20MB/6400万像素/单边16384准入、EXIF归一化、大图长边2048与8像素对齐，小图不放大，推理即输出尺寸
image-multi-angle-workflow.mjs: 主工作台/独立试跑共享摄影机球机位/特写标准远景三档指令映射，后半圈以原摄影机为零点，绕场景中心移至另一侧朝原拍摄点反打，并约束原背景退至新机位身后，远景先约束后退/主体变小/环境变多，拒绝连续景别伪精度、Qwen2509双LoRA原生图、长边最高2K直接推理、无后置放大、实时节点模型准入与真实产物元数据，不进入正式模型目录

image-outpaint-service.mjs: AI 扩图 Flux/Qwen/Sunburst 三引擎应用边界，含新旧COMBO枚举准入，共享原比例/预设固定2K画幅/位置/scale计划，省略档位补2K且显式1K/4K前置拒绝，旧四边输出仅允许2K，EXIF后按真实等比缩放适配并记录原尺寸/缩放事实/用户scale；Sunburst原图16384px与API适配图3840px边界分离，超限只执行最终一次等比resize，狭长原比例只最小扩大目标短边且归档targetAdaptation，零扩展显式阻断且旧省略scale请求兼容；两款 Flux 候选与Qwen节点分别准入/缓存30秒/执行前复核，非Flux拒绝Flux模型参数；保留各引擎尺寸/Key合同，实际产物校验后复用飞书调度并返回同步身份，底层无调度可独立验证
image-outpaint-archive.mjs: 三引擎共用飞书归档投影与独立模型标签目录，保留实际提交源图/输出/画布/原尺寸/缩放/模型/LoRA/种子/产物指纹/费用/耗时；Flux/Qwen只归档同次History实际捕获正文与来源，缺失留空且不冒用固定约束，Sunburst沿用动态真源，不扩展通用模型目录
image-outpaint-janus.mjs: Flux/Qwen共享Janus-Pro-1B固定配置与节点工厂，只分析未扩边原图并捕获当前SaveText单条正文，保留原Flux问题/seed/temperature/topP/999tokens
image-outpaint-qwen.mjs: 独立 Qwen Image Edit 2511 FP8 mixed 扩图真源，2026-10-20.1的25节点运行图，Janus question不变，动态正文原文直连SaveText再到positive，不含固定前缀/Scene continuation或StringConcatenate，并归档同次实际原文，Lightning4steps/CFG1/euler/simple/shift3.1；整张pad画布与mask统一约1MP/8px参考及采样尺度，保留latent遮罩后整图解码恢复目标、不回贴原图，原区允许编解码变化；节点/COMBO/INT槽位准入与请求级产物，分别记录推理/输出/插值恢复/非像素保真且不冒充AI超分
image-outpaint-workflow.mjs: AI 扩图真实执行图真源，2026-10-19.1适配MaaS prod_test参数1082原18节点并增加SaveText实际提示词透传，输入准入统一放宽至每轴 4096px，受控选择 Flux Fill OneReward FP8/原版 Dev 与各自权重格式，固定 Janus-Pro-1B/20步/guidance30/feathering30，保留 LayerStyle 比例截断后 ceil32 预处理、8px 目标、唯一产物与尺寸/原始来源 SHA-256；643 仅截图线索
image-outpaint-oneapi.mjs: GPT Image 2.5 Sunburst 编辑扩图适配器（2026-10-19.1），原图最高16384px/适配图最高3840px独立合同及原比例超3:1最小目标补边政策，按实际输入/四边构造动态Prompt供执行与归档共用，生成透明PNG/外围透明mask，开放模型真源9个2K预设与原比例长边2048/16px对齐/3:1限制及655360–8294400像素范围、固定medium/n1/png、实际尺寸/结果/画布/遮罩SHA-256、placement与真实费用身份
image-tools-api.mjs: 独立图片工具只读配置 API，提供本地遮罩填充分模式能力/输入合同及多角度脱敏目录/实时准入，保留超分健康与目录，公开Flux/Qwen/Sunburst三引擎固定2K与各自输入合同、动态可用性和准入原因

CLAUDE.md: 本模块地图，维护服务端业务模块清单
app-update.mjs: GitHub 正式 Release 更新检测边界，比较 SemVer、核验标准运行 ZIP 与仓库链接、匿名读取公开仓库及无说明正文的版本页 HEAD 兜底，并提供总超时、并发去重和成功/失败分档缓存
app-update-api.mjs: 共享版本检查与安装 HTTP 边界，按服务端最新正式版回执、安装政策及运行任务状态准入，流式返回安装进度/错误并保护待重启与恢复失败状态
app-installer.mjs: 正式版本安装边界，固定仓库 ZIP/官方 SHA-256 与受信重定向/容量/ZIP 路径准入，无 shell 解压；含 .git 的源码工作区仅安装到持久新目录，无 .git 的 Release 目录原地事务替换发布运行根项、保留配置/依赖/数据并失败回滚；公开 getPolicy/isRestartRequired/isRecoveryRequired，成功后要求重启，恢复失败保留备份与操作指引并阻断再次安装，不自动重启
model-config.mjs: 模型参数真源，维护七个 OneAPI 模型（含独立 Banana 2.1 十四比例/1K-4K、GPT Image 2.5 Sunburst/Flare）与默认 9B FP8/7 steps 的 Flux2 Klein、Provider、参考图能力、Flux 正负 Prompt、原有四模型 2:1 与 2.5 九比例/五质量档、GPT 按比例的 16px/655360–8294400像素/3840边长尺寸映射（1K 16:9 为1536x864）、Seedream 5.0 Pro 仅全景可用的 3040x1520 4K 实验档，以及 Flux 原图比例 1K/2K 原生输出与同图 2K→4K/6K 攸行超分请求契约
generation-batch.mjs: 单模型多张/多模型生成批次契约，批次总数不受模型数量上限约束，严格校验共同批次 ID、正安全整数总数与批内序号；单模型张数由任务入口独立约束
generation-jobs.mjs: 日常生图后台任务层，提供最多两路并发的保序批执行、部分失败及旧房清空中间产物保留、进程内任务查询、领域阶段快照透传及有界结果保留；只读hasActiveJobs守护running任务供原地更新准入
generation-job-api.mjs: 日常生成后台任务 HTTP 适配层，普通生图按真实目录准入、单模型1–4张/多模型各1张及两路并发；旧房逐项主图与独立阶段；需归档先验飞书Schema；超分最多4项/扩图1项，扩图固定2K且按引擎权限准入，多角度单图机位准入；遮罩填充仅单项、真实主图/遮罩及GPT归一化矩形或多边形前验、分模式能力与圈选参数冻结、透传上游后台任务ID/状态并以独立imageMaskFill scope校验飞书新增字段，仅超分豁免飞书
generation-service.mjs: 显式功能路由穿透生成输入，含风格转换、旧房包装、氛围转换及美化；旧房只允许emptyRoom并透传两步阶段；扩图取Flux/Qwen或Sunburst编辑客户端并归档；日常超分本机结果/Beta独立归档，遮罩填充独立客户端/配置、GPU前专属Schema复核与飞书同步，多角度按冻结模型分流并重查权限
room-renovation-workflow.mjs: 旧房改造包装与room-clearance-2026-10-21.2清空指令，先通过空房参数/Agent版本/权限/出图配置准入，再移除可移动家具/全部家电含壁挂空调与嵌入式/杂物，保留硬装固定柜体和机位，固定安装不能豁免家电移除；真实下载清空图、读取尺寸/SHA且仅该图进入空房Agent与最终出图，原图/清空图/两步关联归档保留，第二步失败仍返回清空产物，不自动重跑收费请求
image-upscale-service.mjs: 图片超分应用服务，按真实单图尺寸校验常规4K/6K/8K或KS两套2X/4K/6K及每轴384–3200合同，传递源图追溯尺寸，分开5分钟排队与仅8K的15分钟执行时限，返回Prompt ID与实际产物尺寸的本机结果
image-upscale-workflow.mjs: 六套SeedVR2执行与尺寸真源，默认攸行3B；KS预缩放/原图直入均提供2X/4K/6K，按所选分辨率定义生成短边/max及真实倍率元数据；显示名去固定2倍且归档标签/键/来源SHA不变，保留旧2X与Flux嵌入阶段、源/目标/实际尺寸追溯
beta-base.mjs: 独立三表归档与含AI扩图/超分的十功能映射，按真源解析普通/扩图/六超分工作流标签、无Agent明确清空Prompt融合，冻结超分工作流/档位、扩图引擎/工作流/画布及风格转换/美化/全景配置；captureBetaGenerationArchive复用正式Prompt投影且不写旧表，实际工作流版本/尺寸/费用逐字段回读，扩图、超分和风格转换额外核验源图/参考/结果附件数量、token及字节数，合同错误不可重试409，浮点机器精度容差与结果附件上传幂等，已有结果下载核验字节/尺寸/SHA-256后仅恢复状态并逐字段回读，确认后展示轻量预览
beta-sample-store.mjs: 新建按当前功能归属、已有样本跨功能按目标功能读取的草稿样本集、{id}对象关联、逐张真实8MB/MIME/尺寸校验、稳定ID/内容幂等及附件回读，全部确认才发布；列表仅元数据，执行时按需读单张原图，全景再次核验2:1，扩图保留真实源尺寸交执行引擎准入，预览按需WebP，不设整集图片容量上限
beta-base-schema.mjs: Beta三表字段合同真源，实时分页校验含AI扩图的十功能、普通/独立扩图/六超分工作流模型及图片输入Agent单选标签、全部字段类型/附件ID/关联目标；扩图与风格转换复用配置/场景/版本/生成参数及附件字段，允许历史附加选项，合同错误不可重试，不读取旧生成记录或Benchmark表
beta-upscale.mjs: Beta超分六工作流与脱敏目录，默认攸行3B，按所选2X或长边档位准入与真实输入检查，进度使用通用显示名，入队/执行能力复核；复用正式执行及独立Beta归档
beta-outpaint.mjs: Beta扩图四稳定工作流与脱敏能力目录，复用两款Flux Fill/Qwen2511/Sunburst模型真源；严格映射引擎/模型并冻结真实标签，固定2K、原比例或五预设、居中和1.5/2/3倍，拒绝身份冲突/四边参数/重传图片，入队及执行前独立核验所选候选可用性，不复制推理或归档
beta-runner.mjs: 十功能样本草稿/逐张保存/完成回读与ID批次三表Schema准入，真实成员/目标输入内容及Agent/全景/风格转换冻结版本校验；来源功能不阻断跨功能复用，原样本不复制/重传或改写，两路并发逐项lazy读取原图；扩图/超分异步配置、零重传、真实尺寸在beginRun前预检及候选能力执行前复核，Comfy扩图/超分不依赖Prompt Agent Key；共享生成服务与独立Beta归档保持生成/同步双阶段，逐Run结构化预警，手动RETRY保留成功项与原冻结输入、只续失败Attempt，旧任务可携冻结批次恢复并先复用已上传附件；仅同步失败保留原结果/记录且零重新生成，普通瞬时生成错误最多三次新Attempt、400/409不自动重试，Sunburst扩图最多一次执行，重复点击复用重试任务，全部生成同步结算前hasActiveJobs持续忙碌
effect-render-enhancement-prompt.mjs: 效果图氛围转换/全景图美化 Prompt 资产边界，原效果图表 ID 与 effect-render-enhancement 编码保持兼容，分别公开脱敏可用性/当前上架版本；氛围严格校验 BASE/DEFAULT/CONTRACT/TIME/WEATHER 并按环境拼接，全景接受纯文本/开放 MAIN JSON 与根级尾逗号，禁止跨表回退
effect-render-enhancement-workflow.mjs: 效果图氛围转换/六预设美化/全景图美化共享双 Provider 单图服务，各自独立上架 Prompt；美化按专属版本原样注入且只归档强度色调，全景按panoramaPromptVersion读取冻结资产，氛围继续天气时段，Flux 全景只替换独立 Prompt，其余复用普通工作流与现有负向机制
empty-room-furniture.mjs: 空房家具领域真源，提供线上同名同序目录及独立房型多选推荐、“其他”输入标记及 200 字上限、选择来源归档、仅非空已选需求 Prompt 投影；空条件省略，不推断未选品类为排除项
empty-room-type.mjs: 空房房间类型领域真源，维护十个客户可选值、“其他”详情 40 字上限，并向公开目录、工作流校验与飞书同步提供同一归一化合同
image-dimensions.mjs: 无解码图片尺寸探测器，从 PNG IHDR、JPEG SOF 与 WebP VP8X/VP8L/VP8 图片头读取参考图与生成结果的可信宽高
agent-model-config.mjs: Prompt Agent 模型真源，维护十一个候选 ID（含 DeepSeek V4.1 Flash 与 Doubao Seed 2.0 Lite）、图片输入能力与接口可用性组合，不纳入 Opus
oneapi-image-async.mjs: 无mask原始PNG及图序的Responses background提交/1.5秒轮询、单次收费POST、同ID/终态校验、提交到正文与等待共享600秒总预算、取消及即时ID回调；透明mask明确拒绝
oneapi-client.mjs: 按阶段独立限时/外部及单请求 AbortSignal 的 OneAPI HTTP 客户端与 ONEAPI_REQUEST_TIMEOUTS 真源：目录 30 秒、提示词/Style DNA 300 秒、出图/编辑 600 秒、分析/评审 180 秒，每次 HTTP 请求至完整响应体独立计时，专用 undici Agent 避免底层默认 300 秒提前截断且不改全局连接；Prompt Agent/分析/Style DNA/图生图走 Responses、Claude 双图评审走 Chat Completions；editImageAsync使用Responses后台任务并归一化结果/费用，editImage 使用 JSON POST `/images/edits` 原样传透明 PNG/mask、不经 JPEG 压缩且不重试收费 POST，保留阶段/模型/限时脱敏诊断及请求身份/费用
ai-texture-workflow-config.mjs: Flux 工作流身份与参数合同真源，集中维护 9B FP8、7-step、节点标识、默认负向 Prompt 与归档元数据
ai-texture-workflow.mjs: Flux2 Klein ComfyUI 执行图，统一使用 9B FP8/7 steps、`euler`、空 Latent 与原图 ReferenceLatent，按原图比例执行 1K/2K 推理；可选直连无 Prompt 攸行 SeedVR2 3B，并以唯一 SaveImage 收口
comfyui-client.mjs: 支持外部取消信号、可独立设置的排队/执行时限与工作流适配器的 ComfyUI HTTP/WebSocket 客户端，将 Base64 单图与工作流原子提交，以请求级唯一产物键隔离多实例同名旧图，通过同 client ID 的事件流区分排队/执行并保留 Prompt ID，WebSocket 丢失执行事件时以实时队列和 History 恢复阶段，即使 `completed=false` 也立即透传节点 OOM/中断，只对网关读取抖动做安全重试、保留节点校验详情、为最终输出提供最长约一分钟的暂不可见恢复，并向元数据适配器传递当前History输出以捕获实际Prompt，归一为含真实尺寸/SHA-256身份的data URL与耗时元数据
lark-cli.mjs: 飞书 CLI 基础设施，优先解析项目内固定版 1.0.77、首次调用校验最低版本，移除 OneAPI Key 后统一子进程环境、执行、JSON 解析、超时和错误归一化
lark-setup.mjs: 运营首次运行边界，检查固定版本 CLI、应用配置、用户 Token、字段读取/记录读写/附件上传最小 Scope 与 Base 可读性，并编排非阻塞 Device Flow 和临时二维码
local-settings.mjs: 本机设置边界，保留未知环境项并原子写入或删除 .env.local 中的 OneAPI Key
lark-sync.mjs: 飞书生成记录同步边界，既有Schema/字段/附件与生成投影保持原范围；遮罩专属scope要求七列/模式/功能/模型枚举并动态解析附件ID，原图/结果/遮罩/填充参考图/框选原图分列，框图实际PNG/size/送模SHA校验，GPT无mask时附件留空并校验hasMask，结果真实SHA与附件manifest留档、字段和token/字节两次回读通过才成功；失败只标同步失败，不重跑GPU
image-artifact.mjs: 图片产物基础设施，依赖 sharp 统一生成结果 data URL 解码、受限远程下载、输出扩展名、不修改原件的模型请求 JPEG 降质/缩放压缩与任务快照用轻量 WebP 预览
image-download.mjs: 生成结果下载边界，复用受限图片读取并生成跨域安全的字节、MIME、文件名与附件响应头
benchmark-base-schema.mjs: Benchmark Base Schema 适配层，维护五张运行表投影字段，按实时字段存在性/可写类型/单选选项校验全部普通回填，并以稳定编码解析冻结配置展示名、剥离默认 medium 后缀、阻止未建模质量档
benchmark-base-config.mjs: Benchmark Base 连接/响应协议层，解析五表环境配置、必填项、分页 envelope 与单选字段值
benchmark-base.mjs: Benchmark 飞书持久化边界，分页读取五张运行表，在统一写入口按实时 Schema 校验字段/类型/单选值并隔离系统与附件字段，录入完整样本标签、批量同步样本集名称、读写附件，幂等回填配置、Prompt、逐 Run、三维评分/细则/时间、费用、重试链和展示宽表，并筛选三类实验视图
benchmark-identifiers.mjs: Benchmark 标识基础设施，兼容历史模型横评并支持任意提示阶段候选维度的稳定 Prompt/Run/重试 ID、SHA-256 与 Provider 归一化
benchmark-experiment-config.mjs: Benchmark 实验配置领域层，把 `variableKey + variantValues` 规范化为八类质量配置的单变量候选与稳定配置 ID，并推导提示/出图阶段及校验 Provider 输出能力
benchmark-model-access.mjs: Benchmark Provider 准入层，统一检查 OneAPI 模型权限与 ComfyUI 等外部图像服务健康状态
benchmark-plan-input.mjs: Benchmark 计划输入边界，集中维护资源 ID/版本/正整数/同组一致性校验、有效样本筛选与显式 ID 集合归一化
benchmark-runner.mjs: 可主动取消的通用单变量横评应用服务，按因子阶段决定候选间共享或隔离冻结 Prompt，并映射飞书“模型横评/Prompt 横评”实验类型，校验模型权限与输出策略，贯穿费用，逐 Run 留存成功失败和重试、重建持久化进度并同步横评展示
benchmark-review.mjs: Benchmark AI 评审领域层，维护 `white-model-review@v3.1-single-pass` 的单次白模准入与三维 1–5 小数评分、三维证据隔离、完整 JSON 提取/严格契约与单次修复、正式评分 Run 断点筛选、原文留存、MINOR/MAJOR/CRITICAL 本地封顶、40%/30%/30% 加权准入、飞书可读评分细则与浏览器评分目录投影、旧协议隔离、P95 及模型分类分析
benchmark-labeling.mjs: Benchmark 样本 AI 标注领域层，维护 `sample-labeling@v2`、受控空间与空间结构/镜头/软装/材质复杂度/输入质量五个独立低中高维度、人工准入隔离、单图视觉模型协议、严格 JSON 解析、理由和置信度
benchmark-workbench-store.mjs: Benchmark 当前 worktree 本地状态边界，原子持久化样本集、实验、样本分类元数据、评审批次和版本化 AI 评分，并兼容旧状态迁移
benchmark-workbench.mjs: Benchmark 浏览器应用服务，编排样本治理、五维 AI 待审标注、八类单变量零写入计划、确认后配置落库/可取消运行、停止实验 Base 进度重建、v3.1 单次评分与按 Run 断点继续/写回/分析及飞书跳转，并持久化任务阶段、评分失败批次、结构化评分事实与拦截协议漂移
benchmark-jobs.mjs: Benchmark 后台任务注册表，为长耗时批量生成与 AI 评分公开阶段、Base 落库状态、起止时间、进度、主动取消、结果和可诊断失败消息；只读 hasActiveJobs 同时保护 running/cancelling，容量清理不得移除未结算取消任务
style-library.mjs: Style DNA 风格目录边界，将基础编码与版本合成唯一运行时编码，默认最新版并支持精确读取历史版本
prompt-agent.mjs: 统一 Prompt 资产边界，维护 `AI 生图` Base 内白模/空房智能默认及平台融合、独立风格转换表的平台风格及参考图、风格反推配置，以 Agent 编码稳定路由并支持可选展示名，用五分钟进程缓存输出脱敏已上架版本目录、单 Agent 可用性与默认最高/指定版本读取
refined-model-prompt.mjs: 同构版本化 Prompt 读取边界，为精模、效果图氛围转换、效果图美化与全景图美化独立飞书表解析脱敏目录，仅公开和读取完整已上架版本，指定下架版本以 409 阻断且旧 allowDraft 参数不能绕过
refined-model-workflow.mjs: 精模渲染应用服务，仅使用已上架固定 Prompt，下架版本在出图前阻断；以单张带材质模型图、可选用户要求前置且飞书预设 Prompt 后置的顺序编排双 Provider 出图、批次元数据与原始/最终 Prompt 独立归档
white-model-workflow.mjs: 设计模型渲染应用服务，白模/空房按智能默认及平台融合选独立Agent，空房在Agent前校验房型/详情/家具；完整准入后可注入prepareSourceImage，处理后主图统一进入Agent/缓存指纹/出图/归档，供旧房先清空；风格转换日常及Beta共用显式平台/参考来源和独立版本，非法目标前置阻断；按功能/房型/家具/Prompt/风格图完整指纹复用提示词，最终模型仅接收主图并统一双Provider归档
style-dna-reverse.mjs: Style DNA 草稿应用服务，向浏览器公开脱敏已上架 Prompt 版本目录与附件策略，仅在服务端精确读取所选正文，首轮接收无业务数量上限的 PNG/JPEG/WebP/GIF/PDF 并支持仅附件触发，后续允许基于草稿纯文字修正，同时校验多轮消息、模型可用性与固定 JSON Schema，不执行发布写入
reference-attachment.mjs: Style DNA 多模态附件安全边界，在通用图片校验之上增加 PDF 文件签名、MIME、真实字节、单文件/合计容量与可选数量校验，并输出 Responses 图片/文件附件
reference-image.mjs: 参考图安全边界，保留生成链路默认最多 4 张并允许调用方配置格式、容量及可选数量上限，统一校验 MIME/真实字节并附加可信图片宽高
runtime-cache.mjs: 运行时缓存基础设施，提供异步加载并发去重、五分钟 TTL 与主动失效
sync-jobs.mjs: 后台同步调度基础设施，按 generationId 幂等入队并提供 pending/success/failed 状态查询；只读 hasActiveJobs 在 pending 同步结束前阻断原地更新

generation-config.mjs: 生图与 Beta 共用的脱敏配置聚合器，统一 /api/styles 与 /api/config/refresh 的风格/Agent/独立风格转换/精模/氛围转换/独立美化/独立全景真源及主动刷新，隔离各表正文
effect-beautification-prompt.mjs: 独立效果图美化固定 Prompt 真源，读取 effect-render-beautification 上架版本，严格校验 LOW/HIGH × NATURAL/WARM/COOL 六预设，默认 low/natural、拒绝未知值、逐字选择正向正文，公开脱敏目录且禁止跨表回退

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

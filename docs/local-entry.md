<!--
[INPUT]: 依赖主工作目录PORT真源、Codex短命令启动脚本、各功能运行目录与生成/评测/飞书同步空闲检查
[OUTPUT]: 对外提供全景保原光影v3的4192配置回读/零收费验证、v0.1.23正式包1730全测/附件SHA及本机版本回读，空房/旧房自由Agent输出/1869开发全测、空闲重载及单张Sunburst真实归档验收，Main独立超分/美化多选、全景需求前置、功能内KS与Beta旧房历史目录回读、4192统一入口规范及独立预览例外与验证边界
[POS]: docs 的本机服务入口和运行态记录，链接各功能合同，不把源码更新等同运行发布
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 本机统一工作台入口

2026-11-06主入口修复：4192旧进程PID68589读取到新增静态入口，但house-plan.html仍返回X-Frame-Options DENY和frame-ancestors none，导致内嵌页面显示拒绝连接。确认进程仅LISTEN、无外部TCP连接或子进程后，通过既有com.canvas-lab.workspace重载为PID17215。GET页面HTTP200且为SAMEORIGIN/self，独立配置available=true、GPT2.5默认及专表v1/SHA一致；Chrome主工作台内嵌页面、上传入口和模型加载通过，无页面脚本错误。当前直接使用http://127.0.0.1:4192/?feature=housePlanLayout；本轮没有新增收费生成。

2026-11-06 GPT2.6：4192原PID25660仅LISTEN、无外部连接或子进程后，通过既有com.canvas-lab.workspace重载为PID67651，错误文案校准后最终PID68589；八类配置HTTP200且含两款GPT2.6目录，飞书三处模型字段和横评两附件列已回读。1878项全测通过；Key预算超限导致实时模型权限查询也被403拦截，目录接入不代表当前可收费生成。两张3840×2160文生图成功、两次图生图403无产物，未自动重试或发布安装包。详见gpt26-integration.md与outputs/gpt26-integration/runtime.json。

2026-11-05全景保原光影Prompt：用户完整原文与R5_4源节点4 Positive逐字一致，以独立panorama-render-enhancement v3草稿完整回读后上架；正文2672字符、SHA976668e3f6a24dbef1eac7477019bc5b09948d5da014b1337b3648b19eac049a。4192仅POST配置强刷、不重启，实际目录回读v3，其余12项公开配置不变。v1/v2记录全字段投影不变，兼容Beta已冻结批次；新批次整页刷新。OneAPI/Flux实际请求/归档替身与模板/custom分流14项校验通过，无新增收费生成或包发布。资产/源文及验证见outputs/panorama-lighting-final/preserve-prompt.json。

2026-11-05正式发布v0.1.23：从v0.1.22隔离基线仅发布空房/旧房自由输出、用户原文前置和内部长度准入，提交c2bdb990b06e4045811b76c657c5ad53890500c0。1730项全测、生产依赖零漏洞、262文件白名单ZIP、干净安装/启动、草稿与正式三附件名称/字节数/摘要及完整下载SHA通过，最新正式Release已回读v0.1.23。本机main无损快进，133份既有未提交内容核对保留；4192仅监听且无子进程后重载PID16844→25660，首页及目录HTTP200，/api/app-update实际返回currentVersion=latestVersion=0.1.23、status=current。未刷新原页面或新增收费生成。其他本机开发仍未随本版发布，正式下载见https://github.com/DAi0519/Interior-Design/releases/tag/v0.1.23。

2026-11-05空房/旧房Agent输出：取消两场景智能默认/平台风格的固定字段Schema校验，接受非空自由JSON或纯文本；用户补充前置、单次送模/归档同文和独立缓存版本随同生效，白模/风格转换保持原校验。11项专项及1869项完整离线测试通过。只读检查已有Edge空房页等待生成、Edge平面页为几何演示、Chrome平面页已生成，未见进行中任务；4192只监听、无外部TCP连接或子进程后，通过既有com.canvas-lab.workspace空闲重载，PID94291→16844。首页、/api/catalog、/api/styles、/api/beta/config均HTTP200，实际旧房智能v4/默认融合v5（可选v4）、空房智能v34/默认融合v35及Beta旧房入口回读通过；未刷新用户原页面。未改飞书Agent正文/版本、未自动重跑旧任务、未提交收费生成或发布安装包，实际新图画质另行验收。合同见workbench-prompt-order.md。

2026-11-05后续单张真实验收：用户授权跑一张旧房三方模型后，4192正式任务复用截图失败原图/参数，旧房融合v5及Sunburst 2K/low只生成一次；实际Agent输出仅prompt字段，新链路成功而旧strict复核拒绝，直接验证放宽生效。总计73.8秒交付2048×1536 PNG，飞书reczz28VpPBCGuSg归档成功，24项回读及双附件字节/尺寸/SHA核验通过。无额外重试、未重启服务或发布安装包，单图视觉及几何边界见room-renovation.md与outputs/room-renovation/final/report.md。

2026-11-04独立图片超分双噪声：主工作台AI编辑→图片超分新增输入噪声/潜空间噪声，默认均0，范围0–1、步长0.001；实际目录须声明supportsNoiseControls，参数冻结入队并贯通真实节点与结果元数据。确认4192仅监听、无外部TCP连接或子进程，已见工作台待生成且并行平面布局开发未调用模型后，复用既有launchctl服务空闲重载，PID9806→17920；/api/image-upscale/config实际回读双噪声能力、六工作流可用且默认仍youxing_seedvr2_3b。1842项完整测试通过，浏览器已验证可编辑、切换工作流/功能及刷新保留合法值，1.001显示错误并禁用START，最后恢复攸行3B及双0；实际非法请求返回400，未入队。桌面截图已保存；窄屏检查因浏览器连接超时未完成。Beta与Flux后置仍按省略参数默认0，本轮未提交收费/GPU生成或正式版本发布。证据见outputs/image-upscale-noise/verification.json及ui.jpg。

2026-11-04 平面布局：在既有可见生图页待运行、4192进程无ESTABLISHED连接和子进程时，复用`com.canvas-lab.workspace`重载主目录服务，PID90236→9806，不另开端口或刷新用户原操作页。实际`/api/floor-plan/config`返回`2026-11-04.floor-plan.1`、独立Prompt v1/SHA和当前Key视觉模型目录；AI设计入口、平面/空间编辑、多机位、本机恢复及实际JSON/PNG下载已检查，1842项完整回归通过。未调用收费识图/生图或发布安装包；浏览器导入自动化本地文件权限限制和质量边界见`floor-plan.md`。

2026-11-04 全景用户需求前置：实际编译改为非空用户原文首段，再接全景保护合同与适用卡片正文；仅自定义也前置，空补充/原光影和既有合同正文SHA不变。36项定向回归通过，纯内存核对最终Flux节点及OneAPI文字逐字透传。确认4192仅监听、无在途TCP连接和子进程后，复用既有`com.canvas-lab.workspace`从主目录重载，PID25823→31062；首页HTTP200，实际目录仍声明全景多光影能力。未刷新用户原操作页、未提交收费生成或改写11/3历史结果；源程序和本机运行已更新，不代表正式运行包已发布或新顺序的实图质量验收通过。

2026-11-02 精模用户补充前置：只读核对用户三图同批归档，“纯室内，背光场景”均实际传入最终Prompt恰一次，旧代码将其放末尾。现三预设方式与上传参考统一先放用户补充，再接完整控制Prompt与适用卡片正文；Main/Beta/Flux实际送模与归档同文，空补充不改正文，控制Prompt仍v6/v8/v5且卡片不变。1603项全测通过；等待该组三项飞书同步全部success、服务无子进程，并检查Beta待运行/评测已停止后重载4192，PID由29717变为80040，工作目录仍为主目录，完整配置读回与重载前一致。未刷新用户原页面以保留已上传图和结果，本轮未新增收费调用；前置效果仍需后续新图验收。证据见`outputs/refined-lighting-final/user-prompt-first.json`。

2026-11-02 精模光源合理性与点灯优化：三条完整Prompt升至纯词v6/参考迁移v8/氛围词双图v5并上架，原v5/v7/v4仅下架留档。主工作台等待生成、Beta待运行、评测已停止，进程未见上游连接后通过`POST /api/config/refresh`刷新配置，无服务重启；PID仍29717，实际目录读回6/8/5及对应双图SHA。九卡与其余十二项配置目录保持不变，56项真实工作流替身编译/两项漂移零调用与103项定向回归通过。Main/Beta三模式均显示6/8/5；Beta旧草稿按既有规则阻断后显式重选原电影柔光，并恢复氛围词双图方式，新版就绪。未点击START或新增收费出图，质量仍待真实图片验收；证据见`outputs/refined-lighting-final/lighting-plausibility-v1.json`。

2026-11-02 精模 Prompt 统一管理：等待用户原有两项光影对比生成均已出图且同步飞书终态后，才从主工作目录重载4192，其他端口未触动。实际运行目录已读回同一精模表的完整纯词v5、参考迁移v7与氛围词双图v4，光影库不再提供上架控制规则；九卡目录和效果图光影转换目录与切换前完全一致。1598项全测与54项九卡×三方式×两模型替身编译通过，整合前后最终Prompt字节相同，本轮未新增收费生成。此处只记录发布和运行回读，浏览器展示与真实成图质量另行验收；证据见`outputs/refined-lighting-final/prompt-management-unified.json`，维护入口见`refined-lighting-library.md`。

2026-11-02 白模纯词光影：检查 Main/Beta/评测及进程连接，未见在途生成或同步后，从主目录重载4192；实际目录回读`generationFeatureCapabilities.whiteModel.promptLighting=true`，配置回读白模智能默认v4、融合默认v8和九卡。主工作台默认自动，选卡只传提示词，原单图出图与其他功能隔离；1592项全测和浏览器自动/选卡/恢复/跨功能切换通过。未新增收费调用，其他端口保持不变，详见`white-model-lighting.md`。

2026-11-02 主支入口与固定功能栏：用户暂不测试Agent对话，确认未见在途任务/上游连接、Agent零提交账本后，4192已从Agent工作副本切回`/Users/dai/Work_qunhe/Interior Design`的`main`运行，未另开端口或Agent窗口；分支源码与账本原地保留。主支页面无Agent入口。功能目录固定144px，参数栏独立伸缩/完全收起，旧窄栏偏好迁移，布局资源版本5；主目录1526项全测通过，桌面拖动/收起恢复及390px同DOM抽屉已验证，无收费生成。

2026-10-30 Seedream型号标注：原“Seedream 5.0”统一标为“Seedream 5.0 Lite”，稳定key/API ID不变；主/Beta飞书新增完整名称并保留旧选项，模型评测附件列在原ID上改名并兼容历史配置/旧列。主目录与当前Agent工作副本同步相同修正，双方全量测试通过；4192实际从`/Users/dai/.codex/worktrees/agent-chat-entry/Interior Design`运行，确认主/Beta/评测待运行、Agent无提交账本和无在途连接后保留该副本重载，实际目录读回Lite/Pro且浏览器同列表核验。Agent入口保留，未提交收费生成。

2026-10-29二次编辑命名：飞书功能/模式/Flux模型选项与三项专属列在原ID上完成改名，普通与专属Schema回读通过。等待全景任务生成成功且同步已终态后重载4192，实际目录回读三模型“提示词编辑／参考图编辑”，连接仍为local-file；4193/4194保持不变。全景结果附件上传超时已另存完整PNG和任务快照，本次改名未触发模型请求。

2026-10-29局部消除提示词纠正：确认4192无已知在途任务、最新遮罩结果已同步及无外部在途连接后重载主服务。`/api/image-mask-fill/config`须读回`removalPromptVersion=2026-10-29.removal.1`；局部消除通过显式操作只投精简用户原文，编辑模板独立，Sunburst适配器为16版。108项相关离线测试通过；未新增收费生成或修改历史飞书记录。

2026-10-29光影转换独立预览：用户明确选择在新端口验收，4194加载当前源码，入口为 `http://127.0.0.1:4194/?feature=lightingTransfer`；已回读功能目录、独立Prompt v1及10张光影卡片。4192正在执行113项Beta批次，本次保持该进程及4193不变。4194只作本次预览，日常端口仍为4192；功能未在旧4192服务加载时，浏览器明确禁用提交。尚未执行本功能真实出图。

日常工作目录为 `/Users/dai/Work_qunhe/Interior Design`，统一入口为 [4192工作台](http://127.0.0.1:4192/)。本机 `.env.local` 设置 `PORT=4192`，不提交密钥配置。

macOS/Windows双击启动脚本、`npm start`和Codex“运行工作台”读取同一端口配置。Codex动作复用启动器的 `resolvePort`，启动前先检查原入口；已有服务时打开原入口，不额外启动副本。

Codex运行动作只执行 `bash .codex/environments/run-workspace.sh`；端口解析、launchctl启动和就绪轮询放在脚本中，避免把长命令直接送入集成终端。2026-11-02截图中的旧命令连同目录前缀共1163字节，显示内容恰好停在第1024字节的`until curl ...;`，缺少后续循环体和打开浏览器命令；这是该次终端传入链路截断的证据，不代表所有终端均有同一上限。新脚本复用已有服务，冷启动时把解析后的PORT显式传给launchd服务，保持探测与服务端口一致；每次HTTP探测最多1秒，最多50轮等待，失败提示日志位置且不打开浏览器。原终端若仍残留半条命令，先按`Ctrl+C`取消，再重新执行运行动作。4项临时替身回归覆盖复用/冷启动/端口覆盖/超时，11项现有启动器及发布白名单测试通过；真实4192复用执行已打开原入口，PID前后均为29717，本次未重启服务或提交生图。

完成分支后将修改合入主分支，保留主目录其他独立修改；确认生成、评测和飞书同步空闲后重启4192。刷新网页不会更新旧Node进程加载的服务端模块。验收须同时核对界面包版本与 `/api/image-upscale/config`、`/api/beta/config` 的实际KS工作流版本。

当前KS直入工作流为 `2026-10-27.1`：6K固定5120长边整图推理，再插值到6144交付，不再套20MP上限；其2X/4K与KS版26.3继续原20MP策略。每次本机更新都回读主/Beta实际目录版本，不能用源码状态代替运行态。历史独立端口不作为日常验收入口，报告与原件保留在主目录 `outputs/`。

2026-10-28临时例外：4192仍运行精模300项批次，禁止为加载新功能中断该进程。用户已明确同意启用4193独立预览（`com.canvas-lab.texture-preview`），同一预览也用于R5_4全景纯词光影测试：`http://127.0.0.1:4193/?feature=panoramaEnhancement`。4193在四模型质感增强任务和归档均成功后安全重载最新全景代码；`/api/catalog`实际回读`panorama-r5-4@2026-10-28.1`。全景前端对缺少新目录标记的4192阻断提交，避免新光影参数被旧后端忽略。4192仍为日常默认端口，批次完成前不替换它。随后已确认两批精模任务240＋60全部生成/归档成功；用户明确要求重启4192，现已重新启动并从`/api/styles`回读`prompt-only`、`prompt-and-reference`、`prompt-with-reference`三种执行能力，页面可选“氛围词＋参考图”。独立HTML报告采集/终稿进程保持运行，4193未重启；本次未提交生图请求。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

2026-10-28第三模式纠正：4192再次按用户要求重载，运行目录确认`lighting-prompt-reference` v1及三模式多选；第三模式为图序前置词＋卡片三段词，真实资产/模型替身编译核验通过，无收费生成。其他服务和报告进程未执行停止或重启操作。浏览器连接异常，当前UI未重新验收，详见`refined-rendering.md`。

2026-10-29全景多光影：确认Main/Beta待运行、4192无外部连接后重载主服务；`/api/catalog`已回读 `generationFeatureCapabilities.panoramaEnhancement.multipleLightingSelections=true` 和 `panorama-r5-4@2026-10-28.1`。4193保留，日常全景验收使用4192。1512项全测通过，桌面/360px窄屏检查通过；未新增收费生成。

2026-11-03 AI渲染台：主工作台AI渲染新增正式目录，直达`http://127.0.0.1:4192/?feature=aiRenderStudio`。空闲时重载到PID46926，真实config为2026-11-02.ai-render-studio.1、独立Prompt表v1可用且同步Schema就绪；原件单次生成/归档成功，画质部分通过而非精准控光已解决。见ai-render-studio.md与outputs/ai-render-studio/report.md。

2026-11-03九卡/界面修订：4192空闲重载为PID59215，/api/ai-render-studio/config?refresh=1返回2026-11-03.ai-render-studio.2、真实九卡、仅custom底层与同步可用；1681项全测和桌面/390px界面检查通过，无新增收费出图。旧首图/飞书记录保留历史，不代表新九卡画质验收。

2026-11-03效果图美化光影扩展：代码位于 `codex/effect-beautification-lighting`，原六氛围保持六工作流，新增九卡仅复用低自然；1700项离线测试与Main/Beta、390px浏览器互斥及旧进程门禁检查通过。4192的45张全景批次仍运行（观察时生成与同步均5/45），故保持PID59215且不重载。实际目录尚无effectBeautification.promptLighting能力，新后端待批次和归档终态后加载；未新增收费出图或正式发布，详见effect-beautification.md。

2026-11-03独立美化预览：用户明确选择“另开独立预览端口，保留当前批次”后，使用专属launchctl服务 `com.canvas-lab.effect-beautification-preview` 启动4195（PID1603），入口为 `http://127.0.0.1:4195/?feature=effectBeautification`。实际 `/api/catalog` 已声明 `effectBeautification.promptLighting=true`，`/api/styles` 返回九卡及旧六档Prompt v2；浏览器选中暖灯静夜后无旧后端阻断提示。4192仍PID59215，4193仍PID49795，未改.env.local/默认端口或触碰原45张批次。仅运行目录和交互验证，未提交收费生成或正式发布。

2026-11-03美化合并后重启：用户要求重启日常工作台，确认4192无在途连接/子进程、评测未运行后，通过既有主服务重载，PID59215→57921。主支本机入口已回读 `effectBeautification.promptLighting=true`、九卡及美化Prompt v2，新页面显示连接已就绪及六氛围/九预设；4193（PID49795）、4195（PID1603）未动，未刷新用户原任务页或提交生成。分支已本地合入main，未推送/正式发布；排队超时修复不在本次重启范围内。

2026-11-04 Beta旧房改造：启动前4192无监听且无原主服务，使用既有run-workspace.sh从主工作目录启动，不另开端口。实际/api/beta/config.features返回十一功能含roomRenovation，/api/styles返回旧房智能默认/融合均独立v4；空房目录保持其既有智能默认v34及融合v35/v34。真实Beta样本集/明细两表原功能字段仅追加“旧房改造”，完整三表Schema回读通过。1728项全测通过，浏览器已见旧房入口、逐图房型、旧房融合v4和空房智能默认v34切换隔离；未提交START或新增收费生成，未执行正式版本发布。

2026-11-04功能内Flux后置KS：确认Beta待运行、主工作台未有有效运行页、4192无外部连接/子进程后，通过既有launchctl服务空闲重载，最终校验版PID25823（原6773）。实际/api/catalog的Flux4K/6K均声明ks_seedvr2_2x_direct@2026-10-27.1及384–3200输入限制，/api/image-upscale/config回读KS可用且独立默认仍youxing_seedvr2_3b。1757项完整自动化测试及430份源码契约检查通过，Main/Beta菜单显示KS直入、已有样本6K配置检查通过；浏览器本地文件权限未开启，未完成新增测试图上传，尺寸边界由自动化覆盖。本轮未提交收费生图、未修改飞书Prompt/功能枚举，也未再次发布版本（包版本仍v0.1.22，工作区改动不属于已发布包）。详见image-upscale-output-size.md。

2026-11-04主工作台美化多选：在可见Main/Beta/Benchmark均未运行、已知任务引用为空或已过期且Node无子进程后，通过既有 `gui/501/com.canvas-lab.workspace` 重载4192，PID83152→90236。实际 `/api/catalog` 回读 `effectBeautification={promptLighting:true,multipleLightingSelections:true}`，主工作台十五模板混选按模板×模型及单模型每模板1–4张独立展开，其他功能限额保留。1794项完整测试通过，实际静态脚本回读为新版。检查无全量任务只读端点且有一旧Chrome标签读取超时，因此只记录未发现有效在途任务；未提交收费生成或正式发布，详见effect-beautification.md。

2026-11-04平面布局简化：用户明确仅保留简单功能后，移除house-plan-designer专业编辑器与几何链路，改为上传→AI平面图→文字修改→室内图→常用角度的图片流程。确认4192原PID24673仅LISTEN、无外部连接/子进程后，通过既有com.canvas-lab.workspace重载；实际/api/floor-plan/config已回读2026-11-04.floor-plan.2和独立v2 JSON Prompt/SHA。旧几何演示和1842项验证不外推新版质量；新版完整回归1832项通过，真实出图和界面证据见floor-plan.md。未发布安装包。

2026-11-04平面布局选模：用户明确按步骤逐项完善，不移除文字修改、室内或机位。本轮仅增加layout模型下拉与真实路由，复用既有四个OneAPI图生图模型、独立Prompt v2不变。确认4192原PID36522仅LISTEN且无子进程后，通过com.canvas-lab.workspace重载为PID89046；实际config回读2026-11-04.floor-plan.3、四模型可用、后续Sunburst单独可用。1839项完整回归及Edge桌面/390px选模/配置刷新检查通过；无新增收费出图或安装包发布。

2026-11-06 10:55用户授权续测：两款GPT2.6各追加一次3840×2160图生图，仍均HTTP403预算超限、无产物；未再次重启4192或自动重试。两轮回执分别保留，详见gpt26-integration.md。

2026-11-06 11:14预算解除后：OneAPI目录HTTP200；4192六类独立工具配置两款GPT2.6均available=true（runtime-unblocked.json），未再次重启。两款各一次Responses单参考图4K/medium返回真实3840×2160 PNG，沙发改深绿色生效；本轮合计网关回报0.01353 USD，未核实际账单。前两轮四次403留档，不外推透明mask/后台编辑/全景或全场景画质验收，未发布安装包。

2026-11-08 GPT2.6补漏：4192原PID48797连续20次检查仅监听且无子进程后，沿既有com.canvas-lab.workspace重载为PID66128。Beta扩图建档已加载完整GPT引擎白名单；户型布局/设计实验室/平面机位/AI渲染台实际目录两款2.6可用，AI渲染台飞书光照选项补齐后available=true。1979项离线测试通过，无新增收费任务或正式发布。当前用户浏览器任务状态自动读取未完成，空闲判断依据进程网络/子进程检查；未刷新或改写用户原页面。详见gpt26-integration.md及outputs/gpt26-integration/audit-2026-11-08/verification.json。

<!--
[INPUT]: 依赖平面图机位页面、独立任务API、共享视觉Agent目录/机位画面两字段合同、共享图生图执行原语与独立飞书Agent资产
[OUTPUT]: 提供画布机位、墙线遮挡及双侧近墙估算、同图推理、批次生图与人眼平视合同、资产版本和验收边界
[POS]: docs 的平面图机位渲染维护文档，与设计实验室的图片转角度区分
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 平面图机位渲染

主工作台 → AI渲染 → 平面图机位渲染，入口 http://127.0.0.1:4192/?feature=floorPlanCamera 。

## 操作

1. 上传一张 PNG/JPEG/WebP 平面图，最大8MiB、单边4096px、16MP。
2. 点击房间内放置相机，按住拖动可同时指定朝向。拖机身移动。将中间圆点沿中心轴推远，视野收窄、焦距变长；沿轴拉近则扩大视野，绕机身拖可转向。起手方向明确时锁定变焦或转向，手指略偏离拖动路径不会串动。两侧菱形手柄仍可调水平视野35–100°。画布工具条可精调朝向和视野或将相机居中。等效焦距随视野显示，不另设焦距参数。方向键移动，Shift＋方向键旋转，加减键调整视野。机位高度采用服务端公布的默认平视值，当前为1.5米。
3. 选择一个“空间推理模型”，勾选一个或多个“生图模型”，设置每个模型出图 1–4 张（每批最多 12 张）。填写可选的空间、材质、风格与光影要求。空间推理默认优先Gemini 3.1 Pro，否则初次采用当前Key首个可用视觉Agent；后续失权不静默换模。
4. 点击生成后，只推理一次机位可见空间。所选模型用同一张带机位的平面图和同一份画面提示词逐张生成。结果按模型归组，可点缩略图查看成图及失败项。“模型理解的镜头内容”和“画面提示词”共用这一批的推理结果。
5. 选择成图并下载 PNG，批次文件名带模型和序号。切换工作台功能保留图和机位；整页刷新后仅按旧任务ID查询，原图需重新上传，不自动重提生成。

整页刷新加载 v10 界面脚本。画布点击后无焦点外框，下拉选项用勾选标识。更换平面图需重新放置相机，上传失败保留旧图。任务进行中锁定输入，未知提交只GET原任务。默认折叠的提示词正文使用纯文本显示。

## 两阶段合同

工作流 `2026-11-07.floor-plan-camera.9`，功能 `floorPlanCamera`，配置声明 `pipeline: camera-view-agent-to-image-reference` 和 `imageGeneration: { mode: image-to-image, referenceImageCount: 1, referenceImageRole: camera-annotated-plan }`。批次提交必须冻结 .9。兼容 .8 的单图请求及历史单图结果，更早工作流返回 409。

流程：单张带机位平面图 → 视觉Agent生成视野摘要和画面提示词 → 同一张机位平面图加画面提示词 → 每张独立图生图请求。

服务端从原图与冻结相机数值绘制蓝色C点、朝向箭头、镜头开角虚线与估算可见区；两阶段使用同一份标注图字节。原图用于界面和身份记录。图片阶段复用 OneAPI `/responses` 图生图，GPT Image 2.5 Sunburst 和 GPT Image 2.6 两款走既有后台编辑，其余走既有单图请求。坐标以左上角为原点归一化，朝向0°向上、90°向右、顺时针；视野依据真实图片长宽比计算。

虚线只表示镜头的水平开角。界面和服务端的开角示意长度分别为图像短边38%和25%，与最远可见距离无关。蓝色填色用共享算法在最长边640px的图上识别深色、水平或垂直的连续墙线，将每条视线截在首个遮挡处。已识别的开口保留直视部分。墙线不足、机位在墙上或射线缺少足够边界时只画虚线。门扇开合、窗台高度、细线和非轴向墙需对照图纸。

v7 在两侧有连续的近距离命中、中央有稳定的较远命中时，估算中间远景的画幅分界及五处平面远端命中点。服务端只在此条件下淡化单张机位标注图的画外区域，并向 Agent 附上边界。蓝区、机位与首墙算法沿用原标注。墙线也可能包含窗轨或深色物体，需要按图纸核对语义。

Agent输入以用户原文开头，随后提供相机位置、朝向、水平视野、全画幅等效焦距、高度、图像尺寸及`camera.visibility_mode`；独立系统词要求识别机位所在房间、朝向首先遇到的墙面或物体、左右与近中远景、开口可见性、遮挡及边缘裁切，并把材质、照明和摄影质感落实为最终画面。v6 的英文画面词直接描述可见景物，保留家具露出的面、斜向、画幅裁切和有依据的尺寸，省略相机参数、图纸解释和推理过程。基本结构或机位无法确定时返回`UNRESOLVABLE_VIEW`并停止，不回退直生图。

Agent必须返回JSON，两项必需字段为非空字符串：`view_summary`是中文机位与左右/近远/遮挡/裁切摘要（最多4000字符），`image_prompt`是独立描述该画面的英文摄影提示词。允许额外字段，但只提取这两项；缺失、错误类型、空内容、损坏JSON或无法定位标记阻止生图。独立机位合同不改变空房/旧房的自由输出行为。

v6 起，成图词以一句“从图中标记的机位，以人眼平视拍成真实室内摄影，只呈现可见部分”开头，紧接 Agent 的可见画面正文。用户补充要求仍保留，末尾用一句话约束按图纸的实墙和开口成像并移除标记。视野、朝向、等效焦距及默认相机高度仍用于机位和推理。v6 成图词的固定段省略摄影器材和参数，材质、曝光、光影及摄影质感由画面正文表达。已冻结的 v2–v5 保留历史编译顺序与摄影参数。

结果保留`viewSummary`、`scenePrompt`（即image_prompt）、`compiledPrompt`与SHA，以及生成时相机和模型快照。当前任务记录`actual.visibilityMode`（`estimated-wall-occlusion` 或 `angle-only`）、`actual.fullFrameEquivalentFocalLengthMm`及`actual.generationMode: image-to-image`、`referenceImageCount: 1`、`referenceImageRole: camera-annotated-plan`，`referenceImageSha256`与`agentInputImageSha256`相等。结果按任务身份显示“机位图参考”或历史“文生图”，未返回摘要时隐藏摘要。可读摘要用于人工核对，不是几何正确性的证明。

## 模型与任务

推理模型复用共享视觉Agent目录和当前Key权限，排除仅文本模型。`agentModelKey`必选，在准备、执行及Agent返回后复核模型身份与权限；明确选中的模型失权时阻断，不替换。

生图继续开放九款OneAPI模型：Banana 2/2.1、GPT Image 2、GPT Image 2.5 Sunburst/Flare、GPT Image 2.6 Sunburst/Flare、Seedream 5.0 Lite/Pro。默认GPT Image 2.5 Sunburst、2K、16:9、medium。尺寸按模型显示1K/2K/4K与16:9/4:3/1:1；Lite仅2K/4K，Pro仅1K/2K。同一批使用所有所选模型共同支持的分辨率与画幅。用户更改模型后可采用共同档并提示变化，配置刷新保留原选择。

GPT2.6保留独立“生图思考强度：模型默认/低/中/高”，指图像模型的`complexity`，与前置空间推理模型及`quality`不同。默认省略参数，显式值由共享图生图适配器传到Responses图像生成工具的`complexity`；结果只记`requestedComplexity`，公司网关的实际执行尚未实图验证。[官方指南](https://developers.openai.com/api/docs/guides/image-generation)、[Responses参数](https://developers.openai.com/api/reference/resources/responses/methods/create)。

- `GET /api/floor-plan-camera/config`：工作流/pipeline、推理和生图模型目录、Prompt身份、相机限制、输出档位及 `batch:{imageCounts:[1,2,3,4],maxImages:12}`。
- `POST /api/floor-plan-camera/jobs`：`jobId/action:'render'/workflowVersion/referenceImage/modelSelections:[{key,complexity?}]/imageCount/agentModelKey/camera:{x,y,heading,fov,height}/resolution/aspectRatio/userRequirements/promptVersion/promptSha256`。旧单图使用 `modelKey/complexity?`。
- `GET /api/floor-plan-camera/jobs/:jobId`：只读恢复同一任务，不重新分析或生图。
- 每张成功图返回 `sync`。通过 `GET /api/sync-jobs/:generationId` 查归档状态，失败可用 `POST /api/sync-jobs/:generationId/retry` 续传原记录。

继续复用既有任务幂等、同ID不同输入冲突、连接切换阻断和更新忙碌守卫。Agent失败、空输出、无法理解机位或返回后配置漂移时零次生图；并发上限为 2，每张只调用一次图片模型。某张失败保留同批成功图和该张失败原因。批次在顶层记录 `receipts.agent`，各 `items` 按模型与组内序号记录结果或失败及已知生图回执。历史单图仍记录 `receipts.agent/image`。

本功能九款模型统一使用单张机位图参考；GPT2.5 Sunburst及GPT2.6两款仍检查原生PNG及请求尺寸，其他模型保留现有可接受图片格式；保留原生格式/尺寸及PNG交付身份，不把尺寸偏差当精准输出。结果含原件与Agent标注图SHA、相机、模型和Prompt版本。原布局及house-plan保持既有图生图路径。每张成功图写入飞书「生成记录」。参考图列依次保存上传原图与实际送模机位图，字节相同则合并。结果图列保存交付 PNG。记录包括最终送模词、镜头理解、模型及逐图回执、机位、画幅、实际尺寸、Prompt 版本和摘要。归档失败后可在该图重试同步。Beta 与 Benchmark 使用各自入口。

## Prompt资产

独立飞书[平面图机位渲染 Prompt](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblfaU86CV0kY0L1)表，当前Agent编码`floor-plan-camera-agent`，名称“平面图机位空间推理 Agent”，当前默认 v7 记录 `reczz28WtLkU4v41`，1761 字符，正文 SHA `69e1b76f9c0916bd94fa3b009114affc3a2ee5bcfa30669d976ee0773c4566cb`，已通过飞书与本机 4192 双向读回。v6 `reczz28Wovy9DfGn` 与 v4 `reczz28WW2Tl30wc` 保留上架，供冻结的旧任务读取。v7 镜头内容要求分行写构图、近景遮挡、中景主体、远景与开口、关键裁切。影响取景的未知项可单列。

v3首次补充、v4继续保留线稿语义：墙体/细隔墙、门扇与开启弧线、窗线、家具占地、尺寸和房间标注、虚线需依图例辨认；不由平面图推定门的实际开闭、门窗高度或无指北针的地理朝向。图纸事实与后续设计补全明确区分。v4依据真实样本要求最终image_prompt保留机位高度和水平视野，并在图示尺度可读时估算机位到主墙/开口的距离、净宽、墙垛和开口占幅。

v5候选记录`reczz28WoRwG9CKR`已写入并回读，保持下架。按墙体遮挡筛选可见家具，再写沙发近端、正背侧面、座面斜向及裁切。真实Banana 2.1样本仍出现斜拍偏正或画外床，当轮未替换默认v4。验证见`outputs/floor-plan-camera/furniture-pose-acceptance-20261107/report.md`。

系统词只用于前置推理，不直接送给生图模型。准备、执行及Agent返回后复核上架版本、完整正文SHA与来源；缺失、下架、重复版本或漂移阻断，无本地正文或其他功能Prompt回退。新合同最低接受Agent v2；旧Agent v1/v2/v3和`floor-plan-camera`直生图v1/v2/v3保留下架且正文不变，新流程不读取。

## 验收边界与历史

平面出图归档验收覆盖平面图机位渲染、户型平面布局和设计实验室。三个入口分别完成一张真实成图及飞书归档，另补录 29 张有证据的历史成图。32 条记录、96 个附件均已核对。两张历史机位的送模内容按记录的版本与姿态重建，归档参数包含该来源说明。证据见 `outputs/floor-plan-archive/verification.json`。

v7 三机位实推理与 Banana 2.1 走廊复测：走廊摘要保留近墙约 29% 和 38%、中央约 33%。最终样本未带入画外家具，实际开口约 27%，右缘仍有门套形态。厨房台面和 Studio 沙发裁切仍存在推理误判。1967 项回归通过。详见 `outputs/floor-plan-camera/detail-acceptance-20261108/report.md`。

.9 已在本机 4192 加载，默认 Agent 正文仍为 v6。1964 项离线测试通过。主工作台在桌面和 390px 浏览器使用真实配置、模拟批次结果验证 2 模型各 2 张、部分失败、分组预览、下载及刷新后只读恢复。真实 HTTP 校验拒绝了 16 张提交，未创建任务。本次未运行新的付费出图。

此前 `.8` 延续单张机位图参考合同并增加共享墙线遮挡估算。此前 `.7` 延续 `.6` 的单张机位图参考合同，并将冻结视野换算的等效焦距和建筑摄影要求写入实际生图正文。此前 `.6` 按用户明确要求把带相机标注的俯视平面图送给生图模型。用户近期文生图任务的100°视野已写入英文提示词，但床头朝向和衣柜可见性在推理阶段已有偏差。共享参考图给生图模型提供图纸几何，实际纠偏程度按以下同机位实测区分，结果仍记`exactCameraGeometry:false`。


v6 人眼平视简化词实测：固定模型 Banana 2.1。厨房仅用一张带机位的平面图，Gemini 3.1 Pro 推理与 Banana 2.1 生图读取同图，成图保持正前一处窗、左侧台面和右侧实墙，画面为人眼平视。沙发和走廊的透视底稿对照中，原参考下的主要斜向、裁切与遮挡保留，走廊出现额外线性亮带。复杂过道的纯平面图推理仍曾误纳入墙后家具，Studio 的沙发裁切仍有误差。完整回归 1959 项通过。实际送模词、样本和读回见 `outputs/floor-plan-camera/compact-prompt-acceptance/report.md`。

固定透视试验：核对墙体及家具占地后按原机位投影，单张图以透视底稿为主、带机位平面图为小窗，再交Banana 2.1。四个机位保住主要可见面和遮挡，走廊彩色截图版开口占画宽33.2%，与底稿33.1%接近。自动提取在一组左前机位复测通过，复杂户型仍有无效门洞和缺失边界；证据见`outputs/floor-plan-camera/perspective-acceptance-20261107/report.md`，作为独立实验。

2026-11-07 `.8` 主工作台4192：1958项完整回归通过。桌面和390px触屏实测用户截图近似机位，通向客厅的区域着色、餐桌/厨房/沙发/卧室C的墙后检查点未新增填色。另用69㎡原图的厨房86°机位实际出图一次，两阶段标注图SHA一致，画面未跨入邻室，成图仍多出一处右侧窄窗。详见`outputs/floor-plan-camera/wall-visibility-acceptance-20261107/report.md`。

2026-11-07 `.7` 本机4193预览：1955项完整回归通过。Chrome桌面和390px触屏验证伸缩、焦距读数、绕机身转向和弦线转向不串动；界面提交核对为冻结视野、朝向和服务端高度，浏览器验证拦截生成，真实网关出图见下文。

2026-11-07 `.7` 摄影双档实测：69㎡厨房同机位、同朝向，38°/52.3mm 与 60°/31.2mm，各一次 Gemini 3.5 Flash → GPT Image 2.6 Sunburst 高思考 2K 16:9。两图均保留正前单窗和墙体遮挡，宽视野纳入更多台面，窗内外曝光及材质细节可读；推理的距离估值、成图的窗型和台面不一致，未通过同场景精确变焦验收。原图、送模正文及对照见`outputs/floor-plan-camera/photography-acceptance-20261107/report.md`。

`.6` 曾在本机4192加载，配置回读九款生图模型可用，缺少版本或提交`.5`均返回409。1952项回归通过，九款最终HTTP替身均核对推理和生图收到同一张标注图。桌面浏览器确认新结果标记“机位图参考”且刷新只查原任务，390px无横向溢出。上述界面验证采用替身。

2026-11-07 `.6` 真实单例：用用户此前同一张北欧户型图，按结果页读数重建53%/37%、132°、100°，同一张标注平面图、Gemini 3.5 Flash、GPT Image 2.6 Sunburst高思考/2K/16:9实跑两次。首张带入沙发并错置电视。第二张在用户补充字段约束床尾近而床头在右后、两窗与电视在画面左侧同墙、画外家具不入镜，主要空间关系与质感通过，交付第二张原生PNG。此为手工补足构图约束后的单例验收，墙角和开口占幅仍有偏差。证据和复现词见`outputs/floor-plan-camera/reference-acceptance-20261107/report.md`。

2026-11-07 `.6` 多机位实测：两套户型四个机位，水平视野38°–86°，同模型、同机位各跑首轮通用风格与补足构图约束两次，共八张2K原图。首轮一张保住主要空间关系，三张有画外物体或遮挡错误。按图补写取景后四张主要空间关系通过，墙角、窗占幅与门深度仍是近似，结果不代表全自动通过。四张交付联图、首轮对照和完整参数见`outputs/floor-plan-camera/multiview-acceptance-20261107/report.md`。

此前用户反馈首版成图没有理解相机位置与视角，质量验收未通过。后续单张标注图、九模型开放及328字符直生图v3均完成接口和界面验证；`.3`的1934项回归与GPT2.6复杂度浏览器检查不代表真实画质验收，证据保留于`outputs/floor-plan-camera/`。当前Agent系统词替代直生图规则的职责，不改写历史结果。

上一轮`.4`验收：1945/1945完整离线回归通过，实际4192已加载`.4`与新Agent v1，十款视觉Agent和九款生图模型可选。真实浏览器确认推理模型随提交冻结、结果默认折叠展示纯文本提示词、刷新按GET恢复原结果、390px无横向溢出及无控制台异常。唯一POST和任务响应在浏览器层替身处理，真实Agent调用0次、生图0次，不能据此声称空间或画质改善。历史证据见`outputs/floor-plan-camera/agent-flow-verification.json`，旧资产保留在`prompt-asset-receipt.json`的previousAgentVersions；未发布安装包。

此前`.5`离线/界面验收：1950/1950完整离线回归通过，4192已加载`.5`及唯一上架Agent v2，十款视觉Agent和九款生图模型可选。实际浏览器确认摘要默认显示且使用纯文本、提示词默认折叠、结果标识文生图、冻结提交与GET恢复一致，390px无横向溢出、无页面异常。九模型最终HTTP替身核对为Agent单图、图片零参考图，视野摘要和额外JSON字段不进入生图正文；真实Agent与图片调用均为0，未发布安装包。证据见`outputs/floor-plan-camera/view-text-verification.json`及`prompt-asset-receipt.json`。

用户早前失败任务的实际Agent正文尚未取得，不能追溯其具体误读。以下新增样本独立留证，不改写旧结果。

2026-11-07用户授权单张真实验收：已有69㎡两房图，客厅x=.375/y=.61、heading180°（朝图纸下方）、水平FOV60°、高1.5m；Agent v3＋Gemini 3.1 Pro → GPT Image2.5 Sunburst 2K16:9/medium，一次推理一次文生图，约79.3秒，原生2048×1152 PNG，无重试。实际Agent输入SHA与本地标注图一致，图像阶段零参考图。

主审与独立复核均判定：客厅看阳台及主要墙体遮挡基本正确；指定机位/FOV未通过。实际image_prompt漏掉1.5m/60°及距离/开口占幅，推理仍误称“正南”并把未知落地推拉门写成事实。成图门洞约占宽度52%（含套约54%），低于由墙垛内沿和FOV粗估的60%–71%；无法唯一归因于机位后退、视角增大或空间比例变化。所选视野无普通房门，不能据此宣布门弧识别已验证。

该次实验后更新至Agent v4并逐字回读，当时未追加推理或第二张图片。原v3及之前版本下架保留。证据、完整推理/实际生图词、原始成图、投影估算及网关费用见`outputs/floor-plan-camera/real-acceptance-20261107/report.md`和`validation.json`；图片回执requestId缺失，未补造，费用未核账单。

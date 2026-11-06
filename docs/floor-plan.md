<!--
[INPUT]: 依赖独立平面布局四动作API、飞书v2图片Prompt、共享OneAPI图片与多角度能力
[OUTPUT]: 提供最简平面方案/文字修改/室内预览流程、资产合同和实际验收边界
[POS]: docs 的设计实验室 Beta 产品与维护合同，不提供运行Prompt本地回退
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 设计实验室 · Beta

原「平面布局」更名为「设计实验室」，标记为 Beta 实验功能。保留原 floorPlan 路由、任务接口及全部现有能力；此标记不表示接入 Beta 批量跑图。

2026-11-06模型扩展：新增GPT Image 2.6 Sunburst/Flare，保留原2.5默认与历史任务；下文原有固定模型描述以本条为准。实际范围、4K文生图证据和图生图预算拦截见[gpt26-integration.md](gpt26-integration.md)。

主工作台 → AI设计 → 设计实验室 · Beta，入口 `http://127.0.0.1:4192/?feature=floorPlan`。

用户要求一个个步骤按预期完善，本轮仅聚焦：**上传户型图 → 选择生成模型 → AI平面结果**。布局要求可选；已有文字修改、室内预览和常用角度仍保留，本轮不移除或扩展后续功能。它是图片工作流；家具编辑 / 3D 按需加载固定版引擎。旧JSON和同浏览器草稿可继续编辑。

## 使用流程

1. 上传PNG/JPEG/WebP户型图（8MiB、单边4096px、16MP以内），选择生成模型，可选填写居住/家具需求，点击“生成平面布局”。
2. 看平面方案，在“继续调整”用一句话描述改动，点击“修改当前方案”。原图上传入口保留为核对依据；每次修改以当前平面图为底图。
3. 点击“查看室内效果”，写下空间、方向和风格，点击“生成室内预览”。
4. 在首张室内图基础上，点击“左侧 / 反向 / 右侧”逐张生成AI预览；缩略图切换只展示已有图片，不重新生成。相同方向再次生成时替换该缩略图。
5. 点击“下载图片”保存当前所见图片。后端任务在当前进程有期限保留，会话只存任务ID以GET恢复，不提供永久方案库；原图刷新后需重新上传。

每个生成动作都由明确点击触发，一次一张，不自动串联收费。修改平面图成功后，旧室内预览和角度清空，以免与新布局混用；失败时保留旧图片。提交状态未知只查询原任务，不自动重复POST。

## 图片与质量边界

- 平面方案由图像模型理解原户型并直接生成图片，不输出毫米HouseSpec，不再宣称几何识别校验通过。文字与尺寸也可能生成错误，需对照原图检查结构、开口、比例、家具和通行。
- 室内预览从平面图推断房间透视；多角度复用现有照片变角度能力。它们是AI生成图片，不提供真实相机落点、工程尺寸或严格多视角几何一致保证。
- 布局提供GPT Image 2.5 Sunburst、Banana 2.1、Seedream 5.0 Lite和Pro的现有图生图能力，按当前Key权限显示可用状态，选择失权不静默切换；各模型默认分辨率由既有目录决定。调整/室内继续固定Sunburst 1K、medium、原生PNG并强验实际尺寸。角度沿用已有多角度2K-max交付合同，记录原生和交付尺寸及是否缩小。
- 只写独立平面布局任务；不冒用“二次编辑”归档，不进入Beta/Benchmark或旧生图记录。Prompt正文与原图请求不进入公开配置或失败诊断。

## 接口与资产

工作流 `2026-11-04.floor-plan.3`。GET `/api/floor-plan/config`返回layoutModels/defaultLayoutModel与逐项权限/defaults，continuationAvailable/continuationReason独立表示保留的后续Sunburst能力；旧服务版本前端阻断新增模型选择。

POST `/api/floor-plan/jobs`接收 `jobId/action/referenceImage/userRequirements/modelKey/promptVersion/promptSha256`。action为 `layout/adjust/interior/camera`。camera额外接收 `sourceAction:'interior'` 与既有 `cameraPose:{azimuth,elevation,distance}`；不接文字修改。来源声明由UI限制为首张室内结果，服务无法仅凭像素证明上传图类别，结果明确 `exactCameraGeometry:false`。GET原jobId只读恢复，输入指纹/连接身份隔离，终态不重复执行。

[独立平面布局Prompt表](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblsJnSq7Qg9f4Nb&view=vewCOfNdQF)：编码 `floor-plan-layout`，当前唯一上架v2（记录 `reczz28VYHGIZXgr`）。正文是严格JSON `{version:2,layout,adjust,interior}`，三个动作正文由资产维护，实际执行先放用户非空原文；camera复用既有镜头Prompt，未自造第二套规则。准备/执行均复核上架版本、完整SHA和模型权限，缺失/漂移阻断收费，无本地正文回退。

v2 trim SHA-256：`a583dca3fdc43aa0c0849b4726bc94e6a10e3a35c40ce81ef5897a370996945a`。v1已下架，原文保留；v2真实字段、唯一上架和运行读取器回验见 `outputs/floor-plan/image-prompt-asset-receipt.json`。

## 验收状态

- 历史v2阶段曾撤下原专业编辑器。源码及vendor可恢复备份在 `/tmp/canvas-lab-floor-plan-editor-backup-20261104`；原演示草稿不迁移成新图片方案，旧证据不用于证明新流程。
- 原v1真实识图测试一次失败：`c1bd8683-b0a7-4355-ada8-bbb8815264ec`，模型洞口超出所属墙段而被校验拒绝，未载入编辑器。该旧失败没有保留模型响应/费用，不可按0费用计。首次失败原任务保存在 `outputs/floor-plan/real-acceptance/job.json`。
- 新版四动作后端与隔离定向测试31/31通过；完整回归1832/1832通过（含6项新增前端状态/收费恢复回归）。移除旧几何测试后总数下降，不能把数量与旧版直接比较。自动检测器依赖不全，已退化为regex；3条缺src命中均为默认hidden、运行时才赋真实图片的标签，不能据此宣称完整无障碍验收。
- 真实图片流程、桌面/窄屏截图及样本质量结论补充在 `outputs/floor-plan/real-acceptance/report.md`。当前工作区未发布安装包或推送。

- v2真实图像完整跑通5次：布局、圆桌修改、首张室内、左270°、右90°。五张原件/SHA和逐步输入链全部匹配，同次成功费用回执合计USD0.12283（不含费用未知的v1失败）。布局部分通过（上卧柜前空间不足）、本次局部改桌通过、室内可见关系通过；左右两图均偏向沙发墙，方向控制失败，不能称多视角几何一致。桌面1280×800/窄屏390×844、生成中刷新0新POST/34GET恢复已完成；IAB下载按钮触发但未取得文件回执，原件已从响应另存供下载。结论与图片见实测报告，未追加收费重试。

- 2026-11-04浏览器访问修正：此前聊天给的是本地report.md路径，经HTTP访问404。已新增只读网页 `http://127.0.0.1:4192/floor-plan-report/index.html`，仅映射六张图片和HTML/CSS，无原始任务/私有Prompt。复用既有静态服务，无需重启或重新生成；主功能页及直接资源HTTP200。

- 同轮用户澄清实际问题为Edge原工作台刷不出入口：在原effectBeautification页确认AI设计目录仍缺floorPlan，普通/强制刷新后短时仍见旧文档；在Edge新标签访问 `http://127.0.0.1:4192/?feature=floorPlan` 后，目录及完整上传/需求工作区均已实际显示。未证实缓存内部原因，不将推断写为根因；无需重启服务或调用模型。证据为real-acceptance/edge-entry-visible.jpg及browser-access-check.json。

- 本轮布局模型选择：1839/1839完整回归通过（服务11项、前端9项、独立API/Prompt合同均保留）；当前4192回读workflow .3，四模型在当前Key均可用。Edge已实际展开选项、切换Banana与Lite并显示1K/2K默认值、刷新配置保留Lite，最终恢复原Sunburst选择；390×844窄屏与桌面下拉均可见，后续功能入口保留。本轮未追加收费出图；自动文件上传因Edge扩展未启用本地文件访问而未完成，未改权限。历史五张实图仅验证当时Sunburst流程，不外推新增模型布局质量。

模型默认参数与真实送模：布局默认Sunburst/Banana2.1/SeedreamPro为1K，Lite为2K；Sunburst沿用medium质量。非GPT走既有generateImage请求封装，并在准备期使用同一压缩边界后记录submittedFormat/Width/Height/SHA；JPEG/WebP结果仅转PNG交付、保持实际尺寸并记录nativeFormat/nativeSha256/outputConverted/sizeMatched，不把转换或尺寸偏差伪称原生精准输出。

家具编辑 / 3D 从工作台顶部打开。识别当前平面结果或新上传的户型时，用户单独选择当前 OneAPI Key 可用的视觉模型。独立 floor-plan-geometry Prompt 产出墙、门窗和家具体块；手动编辑和同一方案3D预览在本机完成。支持保存、导入原有几何方案。

Edge 实测示例场景含 3 个空间、11 件家具，可切换几何 3D。截图位于 `outputs/floor-plan/geometry-restored.jpg`。4192 当前识图配置返回 10 个可选模型，默认 Gemini 3.1 Pro；本轮全量 1858 项测试通过，尚未用真实户型重新验收识图建模。

2026-11-06命名同步：入口改为“设计实验室 · Beta”，飞书原tblsJnSq7Qg9f4Nb更名“设计实验室 Prompt”，场景类型及三条Agent展示名称同步；稳定编码、版本、正文、记录ID不变。新户型平面布局仍使用自己的专表。

发布范围说明：本v0.1.24沿用已发布模型目录（GPT2.5、Banana2.1、Seedream5Lite/Pro），不包含其他分支的GPT2.6等改动。上文工作区测试记录包含其他并行开发；正式制品以本次发布检查和manifest为准。

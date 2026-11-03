<!--
[INPUT]: 依赖用户带材质模型/背光验收要求、typed打光编辑器、独立飞书渲染台资产与生成记录Schema
[OUTPUT]: 提供AI渲染台入口、光线/渲染风格分工、单次出图/同步合同及验收边界
[POS]: docs 的AI渲染台维护说明，运行正文只从飞书加载，不从本说明回退
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# AI渲染台

主工作台 → AI渲染 → AI渲染台，直达 `http://127.0.0.1:4192/?feature=aiRenderStudio`。独立界面 `/ai-render-studio.html` 支持主页面同源保活嵌入。切换功能保留两路输入/任务，渲染台仅显示自己的 START 与结果，旧通用生成按钮不能触发渲染台任务。不进入 Beta/Benchmark，也不代表已发布安装包。

## 光线与渲染风格

- 光影：直接读取现有飞书光影氛围库九张上架卡片，复用精模的缩略图/小勾/单选收起组件，默认原光影。新请求只允许原光影或真实卡片ID/版本/SHA，不再接受打光五模板。
- 精细控光：默认收起；按需展开后，整体原灯保留/减弱/关闭、点/线/面位置和目标方向、色温、相对强弱、软硬及单灯精修在同一参数栏内显示。无标注也可只渲染材质；旧打光空操作继续阻断。
- 渲染风格：写实摄影 `photoreal`、柔和表现 `soft`、电影质感 `cinematic`、胶片质感 `film`。调摄影响应，不覆盖 typed 光照位置/方向/开关/光色。
- 材质：固定 `faithful`，保持种类、本色、纹理方向/尺度、接缝及设计，AI增强微纹理、粗糙度、反射/透射与接触层次。
- 场景事实约束：只认真实支持的室外开口；浴室玻璃隔断、镜面、挂画不能解释阳光。背光不能用正面均匀补光替代。无证据不造日斑、窗格影、树影、光束或新开口。

一张原图必填，8MiB、单边4096px、16MP、PNG/JPEG/WebP真实解码及EXIF归一化。旧打光保持6MiB。固定 GPT Image 2.5 Sunburst，默认1K/medium、一次一张。原图与可选同源标注引导图同次提交，结果为原生PNG，不裁切/回贴/调色/重编码；不串行跑“打光后再精模”。

界面复用现有工作台的单列参数栏＋结果区、44px表头、上传控件、共享渲染风格下拉与底部START；默认结果为空态，不常驻编辑画布/双页签/第三设置栏。材质保真作为规则保持，不再占用大块说明。

## 飞书真源

[AI渲染台 Prompt](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tbl9Djf4iVWzRxf5&view=vewJGtaGq3)：标准字段为 Prompt 名称、Prompt 编码、版本、上架状态、Prompt 正文、变更说明、更新时间、更新人。稳定编码 `ai-render-studio`，首版v1记录 `reczz28UrkjgLbhX`。

完整JSON严格字段：`schemaVersion:1`、`renderBoundary`、`lightingBoundary`、`materialModes.faithful`、`renderStyles` 四键及 `output`。四种风格与公共规则整体同版本冻结，避免分别编辑造成半新半旧。Prompt正文SHA为 `39781511725acadcd0387efffeacddef4a746c392a8529212e276e41d6460536`。运行时只读此独立表已上架资产；缺失/重复版本/非法JSON/下架阻断，禁止从精模或打光表回退。

`LARK_AI_RENDER_STUDIO_PROMPT_BASE_TOKEN` / `LARK_AI_RENDER_STUDIO_PROMPT_TABLE_ID` 可覆盖部署真源。客户端只见版本/SHA/来源，完整正文服务端闭包冻结。用户补充在最终 Prompt 首段，后接物理与保真边界、图序、typed 光源方案、保材质规则、唯一所选风格和输出要求。

[生成记录](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC) 功能枚举新增“AI渲染台”。复用原始/最终Prompt、参考图、结果图、模型、真实尺寸、耗时、状态和生成参数；新增13列：

| 字段 | 类型 / 内容 |
| --- | --- |
| AI渲染台任务ID | text，同一生成身份 |
| AI渲染台渲染风格 | select，四种风格 |
| AI渲染台材质策略 | select，保留原材质 |
| AI渲染台光照方案 | select，原光影/自定义或当前库卡名；旧五方案仅保留历史值 |
| AI渲染台光源方案 | text，完整规范化JSON |
| AI渲染台原灯处理 | select，保留/整体减弱/全部关闭/由模板重建 |
| AI渲染台Prompt编码 | text |
| AI渲染台Prompt版本 | number |
| AI渲染台PromptSHA256 | text |
| AI渲染台Prompt来源 | text |
| AI渲染台工作流版本 | text |
| AI渲染台计划SHA256 | text |
| AI渲染台光源标注图 | attachment，`fldh9cQhTq`，无标注留空 |

原47列字段保留；光照方案枚举在保留旧记录值的基础上增加原光影/自定义和九卡名称，已回读。完整光源方案JSON还保存卡片id/code/name/version/SHA、三段原词和词正文SHA。实际送模Prompt、规范化方案、输入/guide/结果字节与SHA及真实尺寸须一致，归档字段和附件回读后才显示同步成功。

光影卡片在准备与执行前均从共享`loadRefinedLightingAssets`读取并校验最高上架版及完整冻结正文；三段词在同一次请求中只拼一次。公开HTTP只返回身份与缩略图，卡片原图不送模；只有手动标注需要原图+guide。无卡为原光影，准备/执行不依赖库可用性。场景事实优先，typed控光和用户补充优先于卡片默认照明；不改既有精模、白模、全景和光影转换规则。

## 任务与恢复

独立 `/api/ai-render-studio/config`、`POST /jobs`、`GET /jobs/:id`，不向旧普通生成接口注册占位执行。请求包含独立资产版本/SHA，入队和执行检查当前Key权限，收费前检查飞书Schema。

同一 jobId 在当前Node进程内幂等，输入变更返回409；收费不自动重试。网络结果未知只GET原任务。重启后内存任务不保留，404需用户手动新建，不自动重新收费。

成图先交付，飞书异步同步；GET原任务返回最新 `result.sync`。归档失败可 `POST /jobs/:id/sync-retry`，仅续传已生成图片与已有记录，不能再次调用模型。应用更新忙碌守卫包含本功能生成与同步。

## 验收

用户授权用既有“纯室内，背光场景”原图进行一次真实生成。原件来自既有记录 `reczz28UmltdPElY`，2914×1639、6,371,448字节、SHA `9957feafc40ef0baa256ce23a6caeeaebb5e381bc0c03acab95b9fe9fa87b28a`。后方为玻璃浴室隔断，不能据此假设室外窗。

实际提交、结果、同步及视觉评审在 `outputs/ai-render-studio/validation.json` 与 `report.md` 收口。自动合同通过不等于光照/材质质量通过；单张样例不能证明模型稳定遵从或工程级照度/几何精度。

2026-11-03本机验收：4192已加载，1669项全测通过；正式入口上传原件真实生成1张，36.81秒、1536×864原生PNG，归档reczz28Us8iveGOZ成功，13列及原件/结果附件下载SHA和独立字段回读通过。视觉主审/复核均为部分通过：无虚构外窗和日斑、既有灯具已点亮，但顶周/TV台下光带和后部两顶灯原图不能确认；背光方向不够明确。不能宣称光源保真和精准背光已通过。该结论已写入此记录人工验收字段，未额外收费重试。

2026-11-03修订：按用户反馈改回现有九卡及工作台简洁交互，版本2026-11-03.ai-render-studio.2。1681项全测通过；4192 PID59215已回读真实九卡ID/name/version/SHA与源库逐项一致，旧五模板仅为历史记录兼容、新任务拒绝。桌面与390px检查九卡加载/单选收起、原光影复位、按需控光/返回结果及标注保留；本轮未新增模型调用，首张实图仍是前述v1验收，不冒充新版画质实测。证据见同产物目录ui-library-alignment.json与interface-simplified.png。

# 质感增强

AI渲染 → 质感增强（`textureEnhancement`）。上传一张待增强效果图，选择出图模型与通用参数后使用 START；支持原有单模型1–4张、多模型对比、原图/结果对比、下载与按功能恢复后台任务。

固定提示词的唯一真源为飞书独立[“质感增强 Prompt”表](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblQJtk95Sr5IueL)。`src/texture-enhancement-prompt.mjs`复用现有只读版本读取器，仅读取该表完整上架正文；缺表、下架、读取失败均阻断，无本地正文回退。v1记录`reczz28SmznxCOYf`逐字保存用户342字原文，SHA-256为`a964b78cdbf5bb75f9670a59ab2c9924b3363a9527c644bc43b7100385ce4f8a`。

表列为Prompt 名称、Prompt 编码、版本、上架状态、Prompt 正文、变更说明、更新时间、更新人。稳定编码为`texture-render-enhancement`。后续修改在该表维护，发布更高整数版本并上架；前端显示当前版本和刷新按钮，不提供正文编辑或版本选择。读取器沿用5分钟缓存，点刷新可立即重读；浏览器只接收状态/版本/SHA，生成输入冻结所见版本，最终按实际读取正文、版本、SHA归档。

正文含所有材质、光影与避免项，不拆成负向词，不提供强度、色调、天气或时段控件。服务器忽略客户端自定义正负向词及其他功能配置，不调用Prompt Agent。

执行复用 `executeEffectRenderEnhancementWorkflow`、模型尺寸与单图准入。Flux使用普通工作流，不添加美化LoRA或触发词；请求携带服务端`negative_prompt_mode=disabled-fixed-prompt`，工作流工厂最终负向节点保持空字符串，其他功能默认负向不变。

归档使用 `texture-render-enhancement` / 功能“质感增强”，最终Prompt为实际送模全文，原始Prompt为空，独立记录Prompt编码与版本。原图、结果、模型、尺寸、批次和同步状态沿用共享合同。开始生成前需通过实时飞书Schema校验。

2026-10-28验证：1415项全量测试通过，覆盖八模型实际请求正文、固定词SHA、最终Flux节点、单图准入、跨层任务/归档和前端输入隔离。飞书“功能”已追加“质感增强”并通过真实Schema读回。4192实际界面已验证单图必填与正负向/Agent隐藏，缺图点击START被前置阻断。上述为接口与交互验证，尚未进行真实出图质量验收。

本分支保留开发，不合入主分支。4192仍有精模240项与Banana2.1的60项批次在运行，保留旧Node进程。经用户明确同意，2026-10-28在4193启动独立预览，入口为 `http://127.0.0.1:4193/?feature=textureEnhancement`，由 `com.canvas-lab.texture-preview` 本机任务托管；4192继续执行原批次。

运行进程通过`/api/catalog.generationFeatureModes`公开实际准入真源，目录缺失或未声明质感增强时，前端禁用START并在重试入口前阻断，明确提示使用已更新的工作台入口。刷新静态页面不再被当作后端已更新的证据。


2026-10-28运行修复已验收：4193目录确认支持`textureEnhancement`，4192旧进程界面禁用START并明确提示更新入口。本轮全量1445项测试通过；同一张用户原图、2K、四模型真实任务`generation-0a461875-9e93-4302-8f11-398744e5fe12`为4/4成功，四条飞书同步均成功。Flux实际响应的负向模式为`disabled-fixed-prompt`，结果摘要不再误标“默认负向”。本次证明执行及归档闭环；材质改善程度与结构保真仍需人工验收。

| 模型 | 实际输出尺寸 | 飞书记录 |
| --- | --- | --- |
| Flux2 Klein | 1520×2736 | [reczz28SmKPvPBQP](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28SmKPvPBQP) |
| Banana 2.1 | 1536×2752 | [reczz28SmJL5Jpwk](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28SmJL5Jpwk) |
| Seedream 5.0 Pro | 1600×2848 | [reczz28SmLKcSa8o](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28SmLKcSa8o) |
| GPT Image 2.5 Sunburst | 1152×2048 | [reczz28SmL8Dtgzu](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28SmL8Dtgzu) |

2026-10-28独立表接入验证：v1已上架且342字正文SHA与原文一致；真实飞书读取→生成请求与归档投影使用替身出图客户端验证通过，未追加收费出图。1455项全量测试通过；4193实际`/api/styles`及界面回读均为v1/已上架，点击共享刷新返回质感增强Prompt v1。该次重载仅操作空闲4193进程，4192未重启。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

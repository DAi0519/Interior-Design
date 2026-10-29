# 光影转换

AI渲染 → 光影转换：上传一张已有室内效果图，选择光影库卡片，按需补充光照要求，再生成。卡片默认不选，不提供精模的渲染方式切换或用户氛围参考图上传。

`lightingTransfer` 使用现有光影库卡片和原件，但读取独立[光影转换 Prompt](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblOQOF7m7eKMIAA)表的 `lighting-render-transfer` 上架正文，不拼精模基础、精模迁移词、卡片氛围词、天气或时段，不调用 Prompt Agent。v1目标是保留原效果图的空间、开口、家具位置、材料类型/纹理/本色及机位，只迁移卡图的主辅光、方向、软硬、色温、曝光、光比和摄影响应；原照明与目标冲突时允许重新布光。提示词约束不等于真实材质或几何保真验收。

请求沿用 `refinedLighting`，仅接受 `preset + prompt-and-reference`。浏览器提交卡片ID/版本/SHA与独立迁移规则 `ruleVersion/ruleSha256`；卡图由服务端读原件，模型图序固定为原效果图、卡片图。入队和执行前校验规则、卡片及实际图片身份，更新/下架/篡改报错，禁止静默降级为单图或改用精模规则。缺原图、多主图、上传氛围图和其他执行方式都在生成前拒绝。

OneAPI要求至少双图能力；Flux复用独立双图客户端，只开放原比例1K/2K、长边1024/2048及16px对齐，不影响普通Flux的单图与后置超分。批次、模型选择、PNG、结果画廊、原图对比及任务恢复复用现有工作台。补充要求和卡片草稿与精模隔离，刷新后资产失效须重选。

生成记录的功能为“光影转换”（内部 `lighting-transfer`），保留实际Prompt、规则/卡片/源图/参考图身份，并将卡图原件写入既有风格参考图附件。实时Schema必须包含新功能选项。Beta本轮不开放新入口。

独立Prompt表默认 `tblOQOF7m7eKMIAA`，可用 `LARK_LIGHTING_TRANSFER_PROMPT_BASE_TOKEN` / `LARK_LIGHTING_TRANSFER_PROMPT_TABLE_ID` 覆盖；缺失或下架均阻断，无本地正文回退。v1已上架且逐字回读SHA为 `7e735082ca6e21d82c3c5f1970e889b64fa8f57e6e63640151c96463f0312639`。旧光影库未新增规则行，旧进程刷新仍兼容。

运行验收：源码入口为 `/?feature=lightingTransfer`；实际进程的 `/api/catalog.generationFeatureModes` 必须声明 `lightingTransfer`，`/api/styles.lightingTransferPrompt` 必须回读上架版本与SHA。旧进程未声明时START/重试禁用。4192存在活跃Beta批次时不得重载；源码测试、Prompt上架与真实效果图迁移验收分别记录，不能互相替代。

2026-10-29运行态：4192仍运行113项Beta批次，本次未停止或重启。用户授权新独立预览后，4194已启动于当前工作目录，[光影转换预览](http://127.0.0.1:4194/?feature=lightingTransfer)实际回读新功能、独立Prompt v1/SHA和10张光影卡片；飞书生成记录Schema通过。桌面/390px窄屏实机检查覆盖旧进程门禁、卡片可选/选后收起和Flux双图仅1K/2K。新增链路与原精模、归档、导航合同回归通过；未提交收费生成，尚无本功能实图迁移效果验收。

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

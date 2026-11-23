<!--
[INPUT]: 依赖用户R5_4历史执行图、FastFlux2附件语义归档、运行工厂/适配器与独立全景Prompt表
[OUTPUT]: 提供FastFlux2模型/LoRA/attention/色彩匹配合同、源与归档SHA、光影v4目标前置完整词入口和尾词编译及验收边界
[POS]: workflows/panorama-enhancement 的附件与运行语义说明；运营正文仍从飞书读取，本文件不作回退
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# FastFlux2 全景图美化执行图

2026-11-18，工作台全景计算图更新到用户提供的「全景图美化-质感增强-FastFlux2.json」，稳定 ID 保留 `panorama-r5-4`，版本为 `2026-11-18.1`。用户原文件有56个画布节点，原字节 SHA-256 为 `d6c0da647a93152bc3f1bd0af1537b2a9be178b7d5d82f42684be61a68e12151`。

`FastFlux2_workflow.json` 完整保留附件 JSON 数据，只将排版压紧为176行，逐对象语义与原文件相同；归档字节 SHA-256 为 `4a87f4696770a14aff9a07a7be55c53e76d6b79692bcdb009bf11642060394bb`。运行工厂记录的是用户原文件 SHA，以免将排版变化冒充原附件。文件本身不声明 MaaS 平台发布策略 ID。

## 运行计算图

工作台使用50节点计算图：

- 原模型保持 `flux-2-klein-9b-fp8.safetensors`、`qwen_3_8b_fp8mixed.safetensors`、`flux2-vae.safetensors`。
- 正负文本编码、VAE编码和VAE解码分别改用 `QunheFastFlux2TextEncode`、`QunheFastFlux2VAEEncode`、`QunheFastFlux2VAEDecode`。
- 引导模型依次经过 `LoraLoaderModelOnly`、`ModelAttentionBackend`、`QunheFastFlux2Model`。LoRA为 `flux2_klein9B_zhiganEnhance_v2_000006000.safetensors`，强度0.5；attention backend为 `comfy kitchen attention`，FastFlux2为 `attention=q8`、`kv_cache=auto`。
- `AIRenderFlowStateConvert` 的模型仍接原UNET，与附件一致；只将采样引导器接入LoRA与FastFlux2模型链。
- 球面合成后增加 `JHPixelProColorMatcher`，以原全景为参考、`channels=ab`、`strength=0.45`。
- 球面setup增加 `cpu_workers=2`、`assignment_block_size=64`、`compact_candidates=true`；透视提取使用 `cpu_workers=8`、`banded_rays=true`；最终球面合成使用 `cpu_workers=8`。

20个1536×1536、FOV90°视角、四步Euler、CFG1及手工sigma序列保持附件数据。每步Gather/Scatter共享球面状态，最后合成回原图尺寸。

## 工作台输入与产物

附件的MaaS URL输入、1000–6000px尺寸检查、接口seed、Reroute和JPG报告包装由工作台既有协议替换：`easy loadImageBase64`接收原图，随机种子与运营正文按请求注入，`SaveImage`以请求级唯一前缀保存PNG。保留附件中旁路的本地保存节点所表达的最终色彩匹配结果，不执行JPG再编码。

工作台继续按真实PNG/JPEG/WebP字节验证2:1，不额外套用附件MaaS包装的1000–6000px门限。输出档固定 `original`，不进行普通Flux的1K/2K缩放或SeedVR2超分。默认负向为空，自定义负向整段注入节点5。CFG1沿用附件设置，负向分支不作为可靠的效果控制变量。

每次只提交一次生成，默认执行窗口二十分钟；排队、取消与阶段追踪复用共享客户端。下载前核验产物前缀，下载后核验原尺寸和SHA。回执保存工作流版本、用户附件SHA、LoRA、attention、色彩匹配及球面采样参数和真实产物身份。

## Prompt与历史

默认原光影读取独立飞书全景Prompt v4，MAIN正文保持；2026-11-20模板/自定义使用[飞书规则资产v4](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblNVM20GiWeVEiT&record=reczz28blW2tiq4K)，在CF公共v3基线上仅扩展物体范围并追加一句空白实墙保护（增加130字符）。用户要求可选，公共规则在卡片全文之前；七卡v7、夕照v5、电影柔光v9均恢复既有新版原文。`zhiganEnhance`由正式编译器统一置于全部提示词最前且只保留一次，含用户要求的模式亦然，工作流工厂原样注入编译结果。历史[完整公共v4](光影规则模板-v4.md)与旧试验保留作原结果核验，不改其归档正文。

历史 `R5_4_workflow.api.json` 为原始46节点API图，SHA-256 `1390e507c446a82d45e9fec795358d4df7b29f52e6625cd988c53e6150e16b2a`。2026-11-05，保原光影默认v3采用旧节点4的2672字符原文，正文SHA `976668e3f6a24dbef1eac7477019bc5b09948d5da014b1337b3648b19eac049a`；此处保留来源记录，不把旧图描述为当前执行图。

## 验证边界

2026-11-18已只读查询楚雄新环境27类运行节点，完整50节点图通过必填项、模型/LoRA枚举和连线类型验证。离线测试验证附件计算节点一致、参数和输入隔离、缺少FastFlux2/色彩匹配节点及LoRA不匹配时零提交、单次提交和产物尺寸/SHA。未提交真实GPU任务，球面接缝、实际时延和画质仍需实图验收；未执行MaaS平台发布。

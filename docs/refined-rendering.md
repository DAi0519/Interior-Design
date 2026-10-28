<!--
[INPUT]: 依赖纯词基础/文字规则/反推正文、统一图1图2迁移规则、卡片原件与上传图及主Beta身份合同
[OUTPUT]: 对外提供默认收起的卡片面板/上传替换与单向锁定、纯词/简单双图编译及冻结归档验证边界
[POS]: docs 的精模入口，只有prompt-only读基础；预设加图与上传统一只读reference规则，旧合同仅供历史恢复
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 精模渲染氛围

上传一张带材质模型图，点击“光影选择”入口展开卡片面板选预设，或上传单张氛围参考图，再点击START。主/Beta共用选择器，默认收起且不自动选中；无有效目标不能开始。原时段/天气/色调下拉与原始光影入口不再显示。版本、状态和刷新直接显示，补充要求可选，不增加选中高亮框，也没有精模“清除”按钮。

## 当前模式与职责

光影预设对比两条完整链路：“仅提示词”使用原模型单图，编译基础＋文字规则＋卡片反推正文；“提示词＋参考图”使用原模型图＋所选卡片原始氛围图，最终只用`lighting-reference-transfer`规则＋可选补充要求。图文模式与用户上传统一执行“图1保设计、图2供光影”的简单双图迁移，不拼基础、文字规则、卡片反推正文或额外预设角色段，不增加运行时反推或Prompt Agent。

这是对比试验入口，尚未证明加图优于仅提示词，也未完成真实成图质量验收。本轮仅接通入口与验证合同，没有执行新付费生图；用户可选同一底图、卡片、模型和补充要求比较设计保留、光影贴合与材质质感。

十张用户图卡片为暗调洗墙、暖灯静夜、晴窗树影、斜阳长影、透帘柔光、日光暖灯、冷调日光、青橙、电影柔光、胶片。卡片v2原件和身份保留，反推正文仅供纯词模式；纯词用`lighting-prompt-render` v2，预设图文与上传均用既有`lighting-reference-transfer` v3，不再发布新参考规则。旧卡v1留档。原十卡发布读回见`outputs/refined-lighting-final/evidence.json/`，后续验证另行记录。

首批自然柔光、明亮日光、黄昏、夜景四张原创AI示例不恢复，记录、正文和附件仅保留历史，既有下架核验见 `outputs/refined-lighting-final/evidence.json`。STUDIO LIANG自然柔光仍是用户图候选，不自动提升为新卡。新增冷调日光、青橙、电影柔光、胶片取自本轮四张用户素材，预设差异写入独立正文，不新增强度/色调组合。

2026-10-27曾因误解需求新增“低/高强度×自然/暖/冷调”六组合，现已撤销界面、请求、配置、编译和归档分支。独立六组合v1和当时参考规则v2下架，原参考规则v1恢复，正文保留。撤销阶段原9张卡片不变仅是历史事实；相关旧测试、截图和编译见 `outputs/refined-lighting-final/evidence.json`，不能作为本轮十卡文本实现证据。效果图美化原有六预设不受影响。

## 当前光影流程

| 来源 | 实际输入 | 编译与模型能力 |
| --- | --- | --- |
| 预设：仅提示词 | 原模型单图；不发送卡片图 | `execution="prompt-only"`；基础Prompt＋氛围Prompt（`lighting-prompt-render`公共语义＋卡片正文）＋可选用户补充；不要求双图能力 |
| 预设：提示词＋参考图 | 原模型图＋所选卡片原始氛围图 | `execution="prompt-and-reference"`；仅reference规则v3＋可选补充，无基础/反推/额外角色段；要求双图能力 |
| 上传参考图 | 原模型图＋用户上传的单张氛围图 | `lighting-reference-transfer`专用规则＋可选用户补充；不含基础Prompt，必须支持至少两张参考图 |

原模型始终是结构、开口、机位、家具/物体、材质身份、本色与纹理真源。预设正文明确光向/软硬、主辅光、明暗/光比、光色和摄影响应，需适配原模型现有空间与开口。加图预设与用户上传的第二图都仅提供照明和摄影氛围，不能复制装修、家具、材质、窗洞、构图或相机；均不添加可见灯具硬件。视觉保真仍需实际成图检查。

上方参考图上传区常显，保留最多1张、计数、共享上传框及文件删除。下方“光影选择”默认收起，入口显示当前预设缩略图和名称；点击后在参数栏内展开三列图片＋名称卡片，选卡自动收起，Escape收起并把焦点还给入口。没有“清除”按钮或选中高亮框。Main刷新接统一配置刷新，Beta不显示未接线的局部刷新。

选中预设后，“渲染方式”在展开面板外显示，收起卡片后仍可切换“仅提示词”与“提示词＋参考图”，默认前者；上传时隐藏这组选项。切换保留卡片身份，但在纯词反推与简单双图迁移两条完整编译链间切换。

只有纯词版本区显示基础版本；预设图文和用户上传均显示只读“参考图光影迁移 · v3”，不依赖基础可用性。reference规则、图像与双图模型有效时，基础缺失/下架不阻断两种图2来源；规则真实错误仍需显示。

当前来源仍唯一：选预设时允许直接选择或拖入上传图，只有上传成功才切换为reference并丢弃当前预设，关闭且锁住模板入口/卡片。取消文件选择或非法上传保留原预设。实际上传图存在时不能选模板；删除参考图后回未选并解锁模板，START禁用，不自动恢复旧预设。旧双向禁止、清除预设解锁和卡片常显已由本交互替代。

上传校验失败不替换当前有效来源；已有参考图继续保留。刷新后需重选上传图，轻量存储不复制图片；恢复reference草稿却没有实际图时不锁模板，可重传或选预设。旧三字段/original草稿迁移未选，START不混入旧字段。卡片描述、控件外说明和维护链接不展示，标签/计数/真实错误保留，见[参数面板规则](parameter-panels.md)。

仅提示词预设不要求`maxReferenceImages >= 2`，可用单图模型可以执行；加图预设与用户上传均要求该双图能力。Flux2 Klein当前单图链路不能执行后两者，不丢弃第二图或暗中换模型。三条链路都使用原模型图确定输出画幅。精模自动默认仍优先当前Key可用的Banana 2.1，其他自动默认与功能模型选择策略保持；用户已有有效主动选择继续保留，切换来源或试验链路后不满足能力时明确阻断。

[飞书光影氛围库](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblhzZwxBUkiQAgG&view=vewKkNBpUn)是卡片展示图、说明、光影正文与两条规则的唯一真源。预设反推发生在运营维护阶段，不在点击卡片时调用额外分析模型。浏览器使用脱敏摘要、版本和同源预览展示卡片，正文仅留服务端；维护链接不在参数面板展示，详细字段与发布步骤见[光影库维护说明](refined-lighting-library.md)。

卡片“氛围参考图”字段保留唯一原始素材附件，名称/token/size参与卡片整体SHA及任务冻结复核。仅提示词链路只取文字和页面轻量预览，不下载或发送执行第二图；加图链路由服务端读取该卡片原始附件，核验并冻结实际第二图摘要，不能把同源缩略图当原件。候选图仅收藏，不参与执行、不自动选图；更换原件或正文需新建下一版本，旧记录只下架保留。身份漂移阻断，不能把旧任务静默替换成新目标。

首批五张用户图的命名、上传与附件核验见 `outputs/refined-lighting-final/evidence.json/`。羽果设计、木色将至和STUDIO LIANG分别收入斜阳长影、暖灯静夜和已下架自然柔光记录候选列；唐忠汉图用于暗调洗墙。旧10卡双图阶段的四附件核验见 `outputs/refined-lighting-final/evidence.json`，它不证明本轮单图文本合同通过。

## 独立基础Prompt维护

基础在[精模Prompt表](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblrj2xypwHnh97E)以`refined-lighting-base`v1维护，独立纯文本，仅供`prompt-only`。不拼旧MAIN/TIME/WEATHER/TONE，也不要求旧三列模块；预设图文与上传均不读基础，浏览器不接收正文。

纯词编译`basePrompt + textRule.prompt + preset.prompt + optionalUserPrompt`，其中卡片正文完整表达光影目标，不用“参照图2”代替文字。两种有图2的路径只编译`referenceRule.prompt + optionalUserPrompt`，既有v3已包含图序/设计保护/光影迁移与自足品质，不再补额外预设角色段。

只有预设`execution="prompt-only"`固定基础编码，按code隔离目录并冻结code/version/SHA。图文及上传固定reference规则真实身份；同版本数字不跨来源复用，旧精模编码不能回退。缺失、下架、编码不符或漂移均阻断。

2026-10-27最初发布新基础v1，记录`reczz28SMrMAt1xr`，当时纯文本657字符、SHA为`6f42cfde744a251afce3c61126a8159364e2be17783f1af81d599e66cc611461`，旧三列为空。旧`refined-model-render`v1–v13全部下架，v1–v12原正文/模块/名称/变更说明保持。初次发布快照见`outputs/refined-lighting-final/evidence.json`、`base-after.json`及`base-receipts.json`。

本次上传分流回归发现线上基础v1已被外部编辑，移除了原品质和分工段，当前正文SHA为`6e3fddca87d84743a58889d6493243a62203008e7b10332958b875e7ed517604`。本次分流未修改精模表，也不回滚外部编辑；预设按当前线上正文冻结，上传完全不读该基础。下方质量表和657字SHA仅说明初次发布约定，不能作为当前线上全文或真实质量生效的证明。差异记录见`outputs/refined-lighting-final/evidence.json`。

### 初版基础品质约定

基础应保留渲染质量与光影底座；精简风格偏置不等于删减质量要求。下表记录初版独立基础的品质约定；当前线上正文已发生外部编辑，不据此断言这些段落仍全部存在：

| 品质层 | 基础正文要求 |
| --- | --- |
| 材质 | 木纹/石材细节、织物纤维、金属反射、玻璃透光折射、合理粗糙度与微观起伏，避免塑料感、油腻高光和过锐 |
| 光影 | 物理全局光照、间接光反弹、柔和漫反射、自然主辅光、接触阴影、受光/背光与前中后景层次；高光和暗部均保留材质细节 |
| 摄影 | 佳能R1、f/8、ISO100、24mm、HDR包围曝光作为成像品质参照；保持原机位、透视与裁切，白平衡依据目标光影设定后锁定 |
| 氛围服从 | 可重建光源、投影、间接光、曝光和白平衡，关闭或减弱冲突原灯；具体时段和灯光由氛围Prompt决定，HDR和暗部细节不等于整体提亮 |

不恢复Velvia等高饱和风格偏置，也不锁定原图白天、色温、整体亮度或全部原灯开启；摄影参照不作为改变机位的授权，不新增可见灯具或建筑开口。以上是提示词要求，尚不能据此认定真实成图质量已通过。

### 统一图1/图2参考规则

预设图文和用户上传统一使用`referenceRule.prompt + optionalUserPrompt`，reference规则负责图1保设计/结构/材质/机位、图2只供光影。它们不读基础、textRule或preset反推正文，不追加旧预设角色段。图文仍读取卡片以取得受信原图和身份；用户上传不取卡片。既有v3记录`reczz28SOJTbhm62`及正文保持，不新发版本；v3原发布保留v1三段，只把品质段改为自足删base引用，旧1/2留档。

v3规则资产复合SHA为`f46e08b3f04089636dc9cb666ebf74c78326d756777b7d0fcafbdf8e33620acb`，用于`refinedLighting.ruleSha256`；实际Prompt正文SHA为`d6a20c643f90c46227c3a722dcc085f38251c864c886be53c7656ce07958d37e`，用于实际正文身份。来源为`feishu:tblhzZwxBUkiQAgG:lighting-reference-transfer@v3`，两种摘要不能互换。发布见`outputs/refined-lighting-final/evidence.json`、`receipts.json`、`after.json`。

两种图2来源冻结reference规则code/version/正文SHA、规则资产SHA和第二图SHA，实际Prompt身份均为referenceRule3，不得记为base。预设图文另冻preset身份/原件SHA，但不编译preset.prompt。Beta同一Prompt/规则去重；`mode/execution`仍区分卡图与上传，不新增第三种来源或模式。

### 历史四块与v13止血版本

旧`refined-model-render`v1–v13仅下架留档，正文、模块列及归档身份不重写，已有结果继续查看；新光影不消费其MAIN或任何旧模块。旧四块解析器只服务历史恢复/旧路径识别，不是新基础的依赖。历史模块列为TIME（DAYTIME/DUSK/NIGHT）、WEATHER（CLEAR/OVERCAST/RAINY/FOGGY）、TONE（WARM/COOL）；内部canonical结构与SHA不重新解释为新编码资产。

2026-10-26的v11为207字MAIN加九个模块，记录`reczz28RzX29n3Zo`，四块SHA为`44749239abd8d1d960d0b02874ff57ccd68e8fd9daeb35a04ea1c5a612725d55`；v12增强MAIN至540字，记录`reczz28Rzsa1vubs`，四块SHA为`6155a988aacd3a4e4043dd5a002eef69f4d27a56ae8af12019ac627402e901ae`。两者均属历史合同。

2026-10-27排查暗调洗墙请求发现仍命中浏览器保留的v10，含定向太阳、日景、全灯与Velvia冲突要求。随后曾发布v13中性modular MAIN止血：记录`reczz28SMb0CWdgy`，四块SHA为`65a21fafd64bc44a5003c3f4635c69c7dbce4ad1e63419cc03fabf9d41572b2a`，并下架v9/v10/v12。该过渡方案同轮被全新独立基础替代；当时“唯一上架13”及“新路径要求modular”均不再是当前合同。止血回执保留于`outputs/refined-lighting-final/evidence.json/`，无真实模型调用。

## 新光影请求合同

```json
{
  "featureMode": "refinedModel",
  "promptCode": "refined-lighting-base",
  "promptVersion": 1,
  "refinedLighting": {
    "mode": "preset",
    "execution": "prompt-only",
    "presetId": "<已上架卡片记录ID>",
    "version": 2,
    "sha256": "<卡片整体SHA-256>",
    "ruleVersion": 2,
    "ruleSha256": "<当前来源对应规则的SHA-256>"
  }
}
```

新请求只接受preset或reference，original/空来源/无目标均拒绝。主图在`referenceImages`。预设均带卡片身份：prompt-only带textRule2身份，prompt-and-reference带referenceRule3身份，后者第二图由服务端取卡片原件，不接受用户`lightingReferenceImages`冒充。上传为reference＋image-reference，带referenceRule3及一张`lightingReferenceImages`。execution、真实规则与第二图摘要冻结复核，不能静默切换。

历史双图预设`execution="image-reference"`不重新运行或自动改名为`prompt-and-reference`，旧结果可读。当前预设图文仍为`mode="preset"`，只是Prompt与用户上传统一为referenceRule3；不能与非默认旧`refinedRender`或设计用`styleReferenceImages`混用。

上例仅描述prompt-only，`promptVersion`属于base目录。图文与上传的Prompt身份固定referenceRule3，不继承base版本；按真实code/version/SHA准备、执行与归档。卡片SHA含原件身份，不等于已送模。`/api/styles`只公开可用性、规则身份、摘要和预览，不回正文/token；`presetExecutions`列两方式。纯词用textRule版本/SHA；图文与上传使用referenceRule版本/SHA，二者可用性不依赖base。

## 历史三字段请求兼容

以下仅保留未提交 `refinedLighting` 的旧 API/批次行为，不再由新界面产生。历史original任务/归档不重新解释为参考图任务；显式提交 `mode="original"` 的新请求不走兼容通道。旧路径不增加 Prompt Agent 或额外一次图像生成。默认只发送 MAIN；非默认组合使用 MAIN、通用设计保护/时段优先规则和当前选中的 TIME、WEATHER、TONE 模块，不拼未选模块，不读取旧氛围表，也不使用旧本地色调正文。可选用户补充要求继续放在基础正文前面。暖/冷只调整光色与摄影表现，天气只在真实窗口/开口外生效，不能据此更换材质、家具或机位。

```json
{
  "featureMode": "refinedModel",
  "promptVersion": 12,
  "refinedRender": {
    "preset": "custom",
    "time": "night",
    "weather": "rainy",
    "tone": "cool"
  }
}
```

该JSON仅说明旧请求形状，不授权执行已下架版本。新版不提交或冻结`refinedAtmospherePromptVersion`，服务端准备时清除遗留旧氛围版本/SHA字段。历史参数目录仍为浏览器/服务端同源的`public/refined-render-presets.js`；未知字段及非法枚举在模型调用前拒绝。

旧纯文本版本保留原行为：三字段均默认时使用原精模 Prompt；存在覆盖时读取独立旧氛围资产，只复用 TIME/WEATHER，冷暖调沿用旧参数编译。旧氛围 BASE、DEFAULT 和锁灯 CONTRACT 不叠入精模，原冲突优先级与设计保护边界保持。历史模板参数仍兼容，不重新解释已归档任务。

## 冻结与归档

| 路径 | 入队冻结 | 实际归档 |
| --- | --- | --- |
| 预设：仅提示词 | 独立基础code/version/SHA＋预设文字规则/卡片身份＋`prompt-only` | 实际单图与最终Prompt；不记录执行第二图或其SHA |
| 预设：提示词＋参考图 | referenceRule3正文/复合双SHA＋preset身份/原件SHA＋`prompt-and-reference` | 规则正文＋补充、实际双图、卡片与第二图身份；无base/textRule/preset反推或额外角色段 |
| 上传参考图 | 仅专用`lighting-reference-transfer`真实code/version/SHA＋用户第二图SHA | 专用规则真实来源、实际双图及最终规则正文＋用户补充；不含基础身份，图1归参考图/输入图，图2复用风格参考图附件列 |
| 历史同表四块资产 | 精模单版本与完整四块 canonical SHA | `renderPrompt.source=refined-prompt`、version、sha256、moduleKeys、assetSource，以及实际送模正文 |
| 旧纯文本资产 | 精模版本/SHA；有覆盖时另冻旧氛围版本/SHA | 原精模身份及可选 `atmospherePrompt`，以及旧组合正文 |

纯词归档base身份，预设图文与上传归档reference规则身份，不能只按版本数字复用。`workflow.promptCode/promptVersion/promptSha256/promptSource`反映实际正文来源，图文`ruleVersion/ruleSha256`也为referenceRule3；仍保留preset身份以追溯原图。新归档不写旧`renderPrompt/moduleKeys`。旧四块只按历史身份展示，Beta沿用正式投影。

图片摘要范围为实际输入原件：仅提示词`digestScope="source-original"`且`imageRoles={source:1}`；加图预设与上传均为`digestScope="input-originals"`、`imageRoles={source:1,atmosphere:2}`，并记录`referenceSha256`与`reference`的文件名、MIME、尺寸、字节和SHA。加图预设的`preset`身份保留，用户上传没有卡片身份。页面缩略图不是执行原件，摘要也不等同于OneAPI内部可能压缩后的传输字节摘要。

主工作台任务和Beta批次在入队前按来源与execution冻结身份，各图片执行前复核。加图预设及上传参考均需冻结真实第二图，`mode`与`execution`区分卡片原件和用户上传；均沿用既有参考附件归档路径，不新增结果列。缺失、下架、非法结构或同版本正文/资产漂移以409阻断，需刷新重新提交。历史四块接入曾在精模资产表新增三文本列；光影库独立。正文留在服务端，参数面板保留版本、状态及实际错误，不展示正文来源说明和维护链接；Beta已成功或仅同步失败结果不为重新归档重复出图。

Beta开始建档前再次通过`resolveLighting`读取并核验所选卡片原件，归档该原始图；进入执行时再次强制读取并校验冻结SHA，原件漂移须在对应阶段阻断。飞书版本字段给新预设加图链路追加`prompt-and-reference`标识，避免把试验结果与仅提示词混为同一版本描述；既有历史版本文本不改写。

正式/Beta批次按真实Prompt来源code/version/SHA、execution及规则/卡片/实际第二图身份去重冻结；预设A/B不合并，上传不携带基础身份。归档使用真实最终Prompt与受信来源，不允许上游metadata覆盖；回读编码、来源、执行链路、版本或SHA不一致不能标记成功。复用既有字段，不依赖旧四块或已撤销的六组合资产。

## 验证边界与历史记录

本次最终完整`npm test`1397/1397通过，Main4192真实页面验证完成：默认收起10卡、无清除；展开选卡自动收起，渲染方式留在面板外；预设后上传仍可用，本地WebP上传成功后关闭面板并锁入口/全部卡片，显示迁移v3。删除参考图回未选并解锁、不恢复旧预设；取消/无效文件上传保留原卡，Escape收起且焦点回入口。证据见`outputs/refined-lighting-collapsible-panel-20261027/ui-validation.json`、`selected.png`、`expanded.png`、`upload-locked.png`。

本次仅UI交互变更，后台三路提示词、冻结身份及飞书资产不变；未点击START、未修改飞书，也无新收费图或画质结论。Beta仅自动化，没有新增视觉验收。旧常显卡片/清除/双向锁定截图仅代表历史UI；1394仍为此前后台三路阶段证据。

此前最终完整`npm test`1394/1394通过，后台三路合同仍适用。实际workflow＋client替身：纯词prepare/execute各读base一次、1图、身份base@v1；图文与上传均baseReads0、2图、reference@v3，两条双图同rule3＋同补充逐字相同，不含base/textRule/preset反推/额外角色段，归档一致。见`outputs/refined-lighting-final/evidence.json`及三个`*-final-compiled.txt`。

预设原件SHA继续为`c397dd515c4a441ee722ae0e8d157a372a9d254bc191a7b3bc8a9ba145c28612`，card身份与摘要仍冻结，规则/Prompt身份reference3未改。此前Main模式切换验证见同目录`preset-ui-validation.json`、`preset-reference-simple.png`；原上传/删除与常显卡片记录仅代表当时UI。Beta该阶段仅自动化；无收费模型调用或真实画质结论。

之前“同文只加图”已退为历史，1391及更早回执不覆盖当前图文合同；本次比较纯词反推与简单双图迁移两条完整链路，以1394项和上述新回执为准。

上轮完整`npm test`1391/1391通过。上传专用v3经prepare＋实际workflow/client替身，`baseReads=0`、`oldAtmosphereReads=0`，库读1次，仅规则＋补充、双图/来源SHA归档一致。该时预设图文仍含base/textRule/preset与角色段，后被本次用户纠正。见`outputs/refined-lighting-final/evidence.json`、`uploaded-compiled.txt`，以下为原阶段记录。

真实HTTP将旧上传冻结基础编码以409拒绝，GET job404确认未入队，见同目录`runtime-config.json`、`http-rejection.json`。Main实际上传显示只读“参考图光影迁移 · v3”且START可用，清除后恢复基础v1并解锁预设/上传，再上传回专用v3；未点击生成。见`ui-validation.json`与`upload-reference.png`。Beta本轮仅自动化，无额外视觉验收。

上轮`preset-regression.json`确认当时A/B仍共用base/textRule/card并加角色段，以同一当前base替换快照基础后其余逐字匹配；线上base外部改写也已单独记录。该“同文只加图”合同现被纠正为图文仅referenceRule3，不再是当前行为。历史回执不改写，也不构成画质或效果优劣结论。

此前预设A/B完整`npm test`1376/1376通过，含Beta建档前读取/归档原件及漂移前置阻断，使用CLI与图像模型替身。4192当时公开两种`presetExecutions`。Beta只有自动化，无新增视觉验收；没有新付费图像生成，也无效果优劣结论。以下均为对应阶段历史证据。

预设A/B阶段公共文字规则v2已发布读回，记录`reczz28SNiceIvcl`，SHA为`b9c48ee016a3bd3e92f8b367ea1a33186ec170810b2aae6d590ba72946034070`；只改首句“唯一视觉输入”为“模型底图是设计真源”，其余正文逐字保留。原预设规则v1下架；当时十卡、独立基础v1和上传规则v1未改，上传随后独立升级v3。见`outputs/refined-lighting-final/evidence.json`、`before.json`、`rule-manifest.json`、`rule-receipts.json`与`after.json`。

实时飞书基础v1、文字规则v2、暗调洗墙卡片v2经实际workflow＋图像client替身编译，两路分别1/2图，基础/规则/卡片正文相同，加图仅增加图序角色段，实际正文归档一致。卡片原件为WebP、35018字节、1080×721，SHA为`c397dd515c4a441ee722ae0e8d157a372a9d254bc191a7b3bc8a9ba145c28612`；prepare与execute各强制刷新下载一次。见同目录`compiled-validation.json`、`prompt-*-compiled.txt`及`reference-original.webp`，未调用真实收费模型。

Main在4192用同一底图、暗调洗墙和Banana 2.1实测切换两种渲染方式，START均可用，但没有点击。两个方式按钮的边框、背景和阴影完全一致，仅字重表示选择，不增加高亮框；上传区仍因已选预设而禁用。见同目录`ui-validation.json`、`prompt-only.png`与`prompt-and-reference.png`。这些结果验证链路与页面可用性，不代替真实成图质量对比。

此前独立基础阶段完整`npm test`为1366/1366通过。4192当时重启为独立基础源码，`/api/styles`仅返回`refined-lighting-base@v1`；显式旧编码同v1与仅提交旧版本10均实际HTTP409，随后GET job为404，未进入队列。见`outputs/refined-lighting-final/evidence.json`。

该阶段实时飞书基础与暖灯静夜、暗调洗墙、上传参考三路走实际workflow及图像client替身，核对最终Prompt为基础＋氛围、预设单图/上传双图、品质要求保留、实际正文归档一致，且无旧`renderPrompt/moduleKeys`。见同目录`base-compiled-validation.json`与`base-*-compiled.txt`。当时4192页面确认“精模基础渲染 · v1”，截图为`main-base.png`；没有真实图像模型调用，夜景与其他氛围质量未因这些替身检查而通过。

15个主功能面板实测常态说明与维护链接可见数均为0，证据见`outputs/panel-copy-inline-cards-20261027/qa.json`。机械检查降级使用HTML正则，并保留两处既有动态img警告；没有新增可见坏图，不据此声称零问题。此前1362项、下列1360项及旧下拉截图均保留为对应阶段证据，不替代本次独立基础和卡片验证。

此前白模同款下拉布局全量 `npm test` 1360/1360通过；清除后焦点回归的小修完成后，9项精模UI定向复测通过，3个UI文件机械扫描无发现。Beta本轮仅自动化，未作视觉验收；未真实生图或写飞书。

此前下拉布局的Main已在统一4192入口实测：上传区常显在上，十项搜索下拉在下；选“暖灯静夜”后上传禁用，清除后焦点回下拉且上传恢复；直接通过常显上传框上传冷调日光测试图后下拉禁用，删图后解锁并因未选目标禁用START。Main刷新按钮确实返回配置已更新，目录仍为10个预设。整体参数栏从538缩至458时内容可读且无溢出，验证后恢复538；这是窄容器验证，不是移动端截图或移动端验收。`main.png`、`preset.png`、`reference.png`、`narrow.png` 位于 `outputs/refined-lighting-final/evidence.json/`。以下并排版测试和截图仅保留为历史。

此前并排按钮版互斥实现全量测试1360/1360通过；Main在统一4192入口实测选预设禁用上传、缩略摘要“×”清除解锁、上传禁用预设及删图解锁，清除后START禁用。该阶段共享上传器覆盖禁用选择/拖放及过期异步读取，Beta仅自动化。证据见 `outputs/refined-lighting-final/evidence.json/`，未点击START或调用模型。

此前十卡v2与单图规则发布读回成功，旧十卡v1仅下架保留正文和附件，上传参考规则v1资产深相等。新规则 `lighting-prompt-render` v1记录为 `reczz28SKlq4CNNT`，SHA为 `cc98a0070f9e48dbce643b5f2c9a293842939843b60d0f9678b632740120e08a`。该阶段全量 `npm test` 1356/1356通过、0失败，Beta仅自动化验证。证据见 `outputs/refined-lighting-final/evidence.json/`，不覆盖本次入口互斥调整，也未声明真实成图质量通过。

此前Main `http://127.0.0.1:4214/?feature=refinedModel` 已实机确认：两个来源入口保留，初始未选且START禁用；十卡及新增四图可见，选“冷调日光”后START启用，卡片仅显示“· 已选”且无高亮框。上传本地冷调日光测试图后进入reference模式，文案为“直接参考上传图的光影与质感，保留原模型设计”，START启用；删除上传图回未选并禁用START。截图为该目录 `main.png`、`library.png`、`upload.png`，不证明本次互斥锁定已完成实机验证。

十卡原件逐张下载后的字节、SHA和尺寸10/10一致；真实资产配合内存 `imageClient` 编译截获，十个预设均只含原模型1张，上传参考含2张。该验证模型HTTP调用为0、归档写入为0，证明资产和输入合同，不证明真实渲染质量。

此前移除原始光影入口、目标必选阶段全量 `npm test` 为1354/1354、0失败；Main 4212有视觉验证，Beta仅自动化。该阶段预设仍是双图，因此这些结果仅为历史证据，不能覆盖本轮文本单图合同。

2026-10-27此前四示例下架核验确认：该阶段为六张用户图卡，公共参考规则与六卡执行身份保持不变，四条旧正文和附件保留，模型调用0次。核验见 `outputs/refined-lighting-final/evidence.json`；该回执验证资产目录，不代替界面、请求合同或真实成图验收。

此前撤销六组合并新增暗调洗墙后，全量 `npm test` 1349/1349通过，包含旧六组合草稿忽略、主/Beta不再渲染该控件和新请求无该字段的回归。4210主工作台已实机确认卡片流程、暗调洗墙选择及无选中高亮框；新卡真实资产通过双图/Prompt编译内存截获，没有付费出图或结果归档写入。当时10卡及四个附件下载核验见 `outputs/refined-lighting-final/evidence.json`。这些历史检查不覆盖最新原始入口移除、必选目标及四示例下架，也不代表真实迁移画质通过。

2026-10-27撤销六组合后，精模光影/MAIN/旧模块/正式队列/Beta归档与效果图美化的定向回归84/84通过，检查范围仅为撤销后的代码合同，不触发付费生成。飞书撤销核验确认六组合v1和规则v2下架、原规则v1重新上架，原9卡和全部正文不变，模型调用0次；读回见 `outputs/refined-lighting-final/evidence.json`。

2026-10-27“暗调洗墙”v1曾完成上架读回，当时10卡。原9张执行身份与公共规则v1保持不变；唐忠汉执行图和三张候选附件逐张下载后字节、SHA、尺寸4/4一致，候选附件不作为模型输入。本次素材整理与发布未调用图像模型；证据见 `outputs/refined-lighting-final/evidence.json`。

此前六组合实现的1362项测试、4208主/Beta截图和18项线上资产编译均为已撤销方案的历史审计，不作为当前UI、请求或资产依赖的证据。当前模型迁移质量仍需真实同图验收；没有因为回滚与资产读回就认定材质保真、光影区分或渲染质量通过。

原光影库接入阶段的离线合同测试覆盖来源互斥、双图顺序、模型门槛、规则/预设/图片身份漂移、主/Beta冻结和附件归档。当时全量1332/1332测试通过；此后仅无框文案/样式调整的定向11项通过，二者验证范围分别记录。桌面与手机图库已有实机截图。真实飞书资产的原始/预设/上传参考三种来源还经过内存出图替身编译与归档投影校验，未调用付费图像模型；证据见 `outputs/refined-lighting-final/evidence.json`。参考样片已生成不等于迁移质量通过；尚需用真实精模图核验材质身份、结构/家具保留、氛围差异、细节、耗时及返工率。

以下为之前四块/v12的历史验证事实：

- 四块资产接入时全量 1294/1294 测试通过；当时 v12 只改飞书基础正文，60 种时段/天气/色调组合编译校验通过，未改代码或新增测试。
- v11 接入时通过真实 GPT 2.5 Sunburst、Banana 2.1 请求适配器与 fake image client 核验，实际提交 Prompt 和归档回执一致；当时 v12 已核对基础正文、九条不变模块及整体身份，没有真实付费出图。
- `test/refined-model-prompt.test.mjs`、`test/refined-render-prompt.test.mjs` 覆盖三模块列读取、完整性、单资产SHA、默认MAIN、选定模块与新旧归档。
- 当时的 `test/refined-render-controls.test.mjs`、`test/refined-prompt-version-select.test.mjs`、`test/beta-refined-render.test.mjs` 验证三下拉及版本来源合同；该阶段主/Beta交互测试转为光影卡片/参考图，旧三字段纯兼容测试保留；本轮双路径变更另行验证。

v12 当时新增预览进程为 `http://127.0.0.1:4194/?feature=refinedModel`；该地址不表示当前新光影库进程已启动。旧 4192 进程当时保留原有任务，未被替换。v12 的飞书上架、正文读回与组合校验不等于成图质量已验收，真实材质保持、氛围区分、摄影质量、耗时和返工率仍待同图实测。

<!--
[INPUT]: 依赖飞书光影库、纯词基础/反推正文、统一referenceRule3及卡片原件/上传图真实身份
[OUTPUT]: 对外提供收起卡片面板/上传替换单向锁定、纯词与简单双图链路、图源及冻结归档验证边界
[POS]: docs 的精模光影资产运营说明，与 refined-rendering.md 的使用/历史合同互补
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 光影氛围库

[打开光影卡片视图](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblhzZwxBUkiQAgG&view=vewiAu9i8J)，或使用[完整表格视图](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblhzZwxBUkiQAgG&view=vewKkNBpUn)维护规则。卡片视图仅显示已上架光影预设，并以氛围参考图作为封面。Base 为 `SALobKnnra17iSsGT2ccC52PnHd`，表为 `tblhzZwxBUkiQAgG`。飞书是运行真源，本地素材和回执仅作留档，不作为读取失败时的回退。

## 预设对比与上传参考

| 来源 | 实际送模图片 | 氛围来源 | 规则编码 |
| --- | --- | --- | --- |
| 预设：仅提示词 | 原模型单图 | 运营反推的光影提示词，`execution="prompt-only"` | `lighting-prompt-render` |
| 预设：提示词＋参考图 | 原模型图＋卡片飞书原始氛围图 | 仅referenceRule3＋补充，无base/textRule/preset反推或额外角色段，`execution="prompt-and-reference"` | `lighting-reference-transfer` |
| 上传参考图 | 原模型图＋用户上传的单张氛围图 | 仅专用参考规则＋可选用户补充；不读基础，不增加反推 | `lighting-reference-transfer` |

前两条比较纯词反推和简单双图迁移两条完整链路，已经不是“相同正文只加图”。图文与上传共用既有referenceRule3，卡图必须取原件；同底图/卡片/模型/补充可比较效果，尚无质量优劣结论。本轮没有新付费生成；旧双图预设`image-reference`不重新运行或自动转换，新图文仍为preset＋prompt-and-reference，用户上传仍reference＋image-reference。

用户选预设或上传有效氛围图，无目标不能开始。上传区常显；光影选择默认收起，入口显示已选缩略图＋名称，点击在参数栏内展开三列图卡，选卡自动收起，Escape关闭并归还入口焦点。无清除按钮和选中高亮框。Main统一刷新与计数保留，Beta不显示未接线的局部刷新。

渲染方式在卡片展开面板外，选预设后即使收起也能切换纯词/图文；上传时隐藏。两种方式保留卡片身份，后者不编译反推正文。

只有纯词显示基础版本；图文与上传均固定显示“参考图光影迁移 · v3”，只依赖reference规则、图像及双图模型能力。base缺失/下架不阻断这两种图2来源，规则真实错误仍可见。

选预设后仍可直接上传，取消或非法文件保留预设；成功上传才切reference、关面板并锁模板。上传图存在时禁止选模板，删除图后回未选、解锁且START禁用，不恢复旧预设。只提交当前来源，不设清除按钮；旧双向禁止和清除解锁属于历史合同。

无效上传不替换有效来源。轻量草稿不存图片，无实际图的reference草稿不锁模板，可重传或选预设。原始光影入口不恢复；不增加选中高亮边框，布局不改飞书正文/版本或三路后台。卡片描述、控件外小字和维护入口不展示，真实错误保留，见[参数面板规则](parameter-panels.md)。

只有`prompt-only`在精模表`tblrj2xypwHnh97E`读取独立`refined-lighting-base`v1和预设反推文字，不读取旧四块/三列。预设图文与用户上传不属于这条基础链路。

纯词编译`basePrompt + textRule.prompt + preset.prompt + optionalUserPrompt`。预设图文与上传统一严格编译`referenceRule.prompt + optionalUserPrompt`，不读/拼base、textRule、preset反推或额外预设角色段。既有v3（`reczz28SOJTbhm62`）已完整约束图1保设计、图2供光影和品质，不再发新版本；图文保留卡片查询仅用于原件与身份。

v3保留v1首段、迁移段、输出段逐字，只把品质段改为自足并删基础引用。旧v2已下架，故新建v3而不重用版本；v1下架保留，所有原记录正文/附件未改，预设规则v2/十卡v2状态不变。规则复合SHA为`f46e08b3f04089636dc9cb666ebf74c78326d756777b7d0fcafbdf8e33620acb`，实际Prompt正文SHA为`d6a20c643f90c46227c3a722dcc085f38251c864c886be53c7656ce07958d37e`，不能混用。来源`feishu:tblhzZwxBUkiQAgG:lighting-reference-transfer@v3`；发布证据见`outputs/refined-lighting-final/evidence.json`、`receipts.json`、`after.json`。

真实Prompt来源按code/version/SHA隔离：纯词是base，图文与上传是referenceRule3；图文另冻preset身份/原件SHA。缺失、下架或漂移阻断，同版本数字不跨源复用；旧精模v1–v13仅历史，不回退旧四块。

2026-10-27最初发布`refined-lighting-base@v1`（`reczz28SMrMAt1xr`），当时657字、SHA`6f42cfde744a251afce3c61126a8159364e2be17783f1af81d599e66cc611461`、三列为空；旧编码v1–v13下架，v1–v12原文等保持。该历史快照见`outputs/refined-lighting-final/evidence.json`、`base-after.json`、`base-receipts.json`。

本次回归发现线上基础v1已被外部编辑并去掉原品质/分工段，当前SHA`6e3fddca87d84743a58889d6493243a62203008e7b10332958b875e7ed517604`；本次上传分流没改精模表，不回滚外部编辑，也不把657字快照作为当前全文。预设沿用实际线上基础，上传不读取它；差异见`outputs/refined-lighting-final/evidence.json`。

预设反推发生在素材维护阶段：把光向、软硬、主辅光、明暗/光比、光色和摄影响应写成可独立执行的正文，不用“图2”代替文字目标。点击预设不调用额外Prompt Agent；仅提示词不下载执行原件，加图模式由服务端读取受信卡片原件为第二图。用户上传仍直接双图，不在运行时先分析成文字。

## 记录与字段

| 类型 | 用途 | 必需内容 |
| --- | --- | --- |
| 参考规则 | textRule仅纯词，referenceRule统一预设图文与上传 | 稳定编码、名称、非空光影提示词、版本、上架状态；不附图片 |
| 光影预设 | 页面缩略图卡片及完整光影文本 | 稳定编码、名称、非空光影提示词、版本、上架状态，以及唯一运营素材图 |

规则编码分别为 `lighting-prompt-render` 和 `lighting-reference-transfer`，分别选择各自编码最高上架版本；不能以另一条规则代替缺失规则。卡片按编码分组只公开最高上架版本，再按排序展示。相同编码与版本不得重复上架。

| 字段 | 类型 | 维护要求 |
| --- | --- | --- |
| 名称 | 文本，主字段 | 面向用户的卡片名称，如“电影柔光” |
| 编码 | 文本 | 稳定英文编码；小写字母开头，仅小写字母、数字及连字符，最长80字符 |
| 类型 | 单选 | 光影预设／参考规则；规则用途由稳定编码区分 |
| 分类 | 单选 | 自然光／人工光／混合光／电影质感／规则；用于素材管理和运营分类 |
| 说明 | 文本 | 运营可读的简短效果描述；参数面板不展示，避免把材料/装修差异作为效果承诺 |
| 氛围参考图 | 附件 | 预设恰好一张PNG、JPEG或WebP，单张不超过8MB；用于预览及加图试验的实际原件，规则行留空 |
| 候选参考图 | 附件 | 收藏同类原图或旧代表图；仅供运营比较，不作为模型输入、卡片预览或自动轮换来源 |
| 光影提示词 | 文本 | 服务端运行正文；规则写通用边界，预设完整描述该卡的光影目标 |
| 版本 | 整数 | 正整数；实质修改时新建下一版本行 |
| 上架状态 | 单选 | 下架／上架；默认下架，只有完整上架资产进入运行目录 |
| 排序 | 整数 | 数字较小的卡片靠前 |
| 变更说明 | 文本 | 说明本版本修改、执行路径与是否完成真实成图验收 |
| 更新时间 | 系统更新时间 | 自动维护，不手动写入 |

“氛围参考图”字段保留原始素材，页面卡片使用版本/SHA校验的同源轻量预览，不能拿预览替换执行原件。飞书卡片视图保留，正文与附件token留在服务端。卡片整体SHA包含素材附件名称/token/size；仅提示词只复核该资产身份，加图模式还须冻结并核验真实第二图摘要和角色。候选附件不进入执行资产或自动选图。

## 上架与更新

1. 新建下架草稿，填好名称、稳定编码、分类、说明、光影提示词、版本和排序。
2. 光影预设上传唯一匹配展示图，核对缩略图与原图；规则行不上传图片。
3. 根据素材反推可独立执行的光影正文，写明光向/软硬、主辅光、明暗/光比、光色及摄影响应。遵守独立基础的设计保护和品质要求，不复制装修、家具、开口或机位，不用长相机参数堆砌差异。
4. 核对记录完整性后上架，在工作台刷新飞书配置。两条规则分别准入；缺失、非法正文、重复版本或不合格展示附件不静默回退。
5. 实质修改时新建同编码下一版本；旧记录仅下架，保留正文和所有附件。同版本正文或展示附件身份改变会触发任务复核阻断，不能作为无害编辑。

新图先按光源形态、光向、软硬、主辅光与明暗结构判断是否已有卡片覆盖。家具或装修不同不构成新氛围；同类原件收入候选列。更换展示图也应新建下一版本，旧展示图可收入候选列。合并卡片时下架被合并记录，注明目标卡片；不暗中重写旧任务身份。

## 当前十张卡片

十张卡片继续v2，原件和反推文字保留。纯词用卡片正文＋textRule2；图文只取卡片原件/身份，用referenceRule3，与上传同规则。旧卡v1留档。原十卡发布证据见`outputs/refined-lighting-final/evidence.json/`，不能覆盖后来改动。

预设对比阶段公共文字规则v2记录`reczz28SNiceIvcl`已发布读回，SHA为`b9c48ee016a3bd3e92f8b367ea1a33186ec170810b2aae6d590ba72946034070`，原v1仅下架留档。只把首句的“唯一视觉输入”改为模型底图承担设计真源，其余正文逐字保留，两条预设仍共用同文。当时十卡、独立基础v1及上传规则v1均未动；随后上传专用规则独立升级v3。预设发布证据见`outputs/refined-lighting-final/evidence.json`、`before.json`、`rule-manifest.json`、`rule-receipts.json`、`after.json`。

| 卡片 | 光影目标 |
| --- | --- |
| 暗调洗墙 | 低环境亮度、连续线性光与墙面明暗渐变 |
| 暖灯静夜 | 多点暖灯、局部光池与可读的深色暗部 |
| 晴窗树影 | 明亮窗侧日光、斑驳投影与清晰层次 |
| 斜阳长影 | 斜向日光、连续光斑与延展投影 |
| 透帘柔光 | 漫射窗光、柔和背光与前暗后亮关系 |
| 日光暖灯 | 柔和日光与暖灯补光的混合照明 |
| 冷调日光 | 冷白主光、克制的青蓝暗部与清晰光比 |
| 青橙 | 青蓝环境光与橙暖局部灯光的冷暖分离 |
| 电影柔光 | 大面积柔主光、温和高光过渡与有方向的暗部层次 |
| 胶片 | 暖高光、青绿暗部、胶片式曲线与细腻颗粒的摄影目标 |

前两种暗调不能合并为泛称夜景：暗调洗墙强调连续渐变，暖灯静夜强调分散光池。冷调日光以光色与光比为主，即使素材含颗粒也不与胶片互换。电影柔光比透帘柔光更强调均衡、柔和的主辅光关系，不能靠模糊材质表现柔和。胶片正文描述摄影观感，不宣称已接入具体胶片型号、LUT或独立后处理流水线。

首批自然柔光（`natural-soft`）、明亮日光（`bright-daylight`）、黄昏（`golden-dusk`）、夜景（`warm-night`）四张原创AI示例不恢复。四条已下架并读回的历史见 `outputs/refined-lighting-final/evidence.json`；旧记录、正文和附件继续留档。自然柔光的STUDIO LIANG用户图仍为候选，没有自动提升为新卡；明亮日光、黄昏、蓝调等缺口可后续按独立目标与素材补齐，不借下架示例补数量。

## 图像角色、模型与归档

原模型图始终是结构、开口、相机、家具/物体、材质身份、本色与纹理的设计真源。光影必须适配其现有空间与开口，可调整既有灯具贡献或采用可信画外照明，不新增可见灯具硬件。

仅提示词预设允许可用单图模型；加图预设和用户上传均实际发送两张图片，要求`maxReferenceImages >= 2`。Flux2 Klein当前单图链路不能执行后两者，不丢弃第二图、不暗中换模型。精模自动默认仍优先Banana 2.1；来源或execution切换后不满足能力时明确阻断。

主/Beta按来源及execution冻结：纯词为base/textRule2/preset2；图文为referenceRule3/preset身份/原件SHA；上传为referenceRule3/用户图SHA。图文与上传不读/冻base或textRule。预设/上传继续互斥，归档以真实Prompt来源及mode/execution区分，沿用既有附件路径。

上传的实际Prompt正文SHA与`refinedLighting.ruleSha256`规则复合SHA分别冻结复核；Beta摘要对同一Prompt与规则身份去重，不能把同一专用规则重复显示为基础和氛围。

Beta开始建档前再次用`resolveLighting`读取、核验并归档卡片原件，执行时再次强制读原件校验冻结SHA。新预设加图的飞书版本字段带`prompt-and-reference`标识，旧历史文本不变；模式或原件变化不能混为同一任务。

既有链路复用参数、快照和版本字段。`workflow.promptCode/promptVersion/promptSha256/promptSource`与`ruleVersion/ruleSha256`在图文/上传均对应referenceRule3，图文仍保留preset身份以追溯原件。漂移或回读不一致不能标成功，不写旧模块。仅词为source-original/source:1，图文和上传为input-originals/source:1,atmosphere:2及真实第二图摘要，不冒充内部传输字节。

## 历史素材与验证边界

本次最终完整`npm test`1397/1397通过，Main4192已实测默认收起10卡/无清除、展开选卡自动收起/面板外渲染方式、预设后上传可用；WebP成功上传后关闭并锁模板、显示迁移v3，删图未选解锁且不恢复旧卡，无效文件保留旧卡，Escape收起并归还焦点。见`outputs/refined-lighting-collapsible-panel-20261027/ui-validation.json`、`selected.png`、`expanded.png`、`upload-locked.png`。Beta仅自动化，未点START或修改飞书，无收费图像生成或画质结论。三路后台和资产不变；常显卡片/清除/双向禁止及1394留作原阶段证据。

此前1394/1394与三路实际workflow＋client替身仍证明后台合同：纯词base读2次/1图；图文及上传base读0/2图，同rule3＋补充逐字一致，不含旧段，归档一致，卡图SHA与身份冻结。见`outputs/refined-lighting-final/evidence.json`及三个`*-final-compiled.txt`，不代替新面板验证。

此前Main模式版本切换见同目录`preset-ui-validation.json`、`preset-reference-simple.png`，仅代表当时UI；Beta该阶段仅自动化。rule3不变，无收费模型调用/画质优劣结论。旧“同文只加图”、1391及更早回执均为历史。

上轮完整`npm test`1391/1391通过，上传v3零base/旧氛围读取、库1读、规则＋补充/双图/真实身份归档已验证，见`outputs/refined-lighting-final/evidence.json`、`uploaded-compiled.txt`。当时预设图文还包含base/textRule/preset/角色段，现已由用户纠正；以下为历史阶段证据。

旧上传冻结base编码实际HTTP409、GET job404未入队，见同目录`runtime-config.json`与`http-rejection.json`。Main上传显示只读“参考图光影迁移 · v3”、START可用；清除恢复基础v1和来源解锁，再上传回v3，未生成，见`ui-validation.json`、`upload-reference.png`。Beta本轮仅自动化。预设A/B以同一当前基础替换旧快照基础后逐字匹配，规则v2/卡片v2/角色正文和拼接行为未改；线上基础外部改写已单独记录，不称整个Prompt与旧快照相同。无新收费模型调用，不宣称真实画质或加图更优。下列1376项及更早记录仅为对应阶段证据。

首批五张用户图发布、命名副本和原件字节/SHA/尺寸核验见 `outputs/refined-lighting-final/evidence.json/`。羽果设计、木色将至和STUDIO LIANG分别收入斜阳长影、暖灯静夜及已下架自然柔光记录的候选列，只收藏、不送模；唐忠汉图用于暗调洗墙。该阶段四附件核验及旧10卡双图发布见 `outputs/refined-lighting-final/evidence.json`，不代表本轮文本单图合同通过。

2026-10-27误增的强度×色调六组合已撤销；独立六组合v1和当时公共规则v2下架，恢复参考规则v1，正文保留。撤销回执见 `outputs/refined-lighting-final/evidence.json`。效果图美化原有六预设不受影响；光影库不读取该表。

此前预设双链路完整`npm test`1376/1376通过，包含Beta原卡图建档与漂移前置阻断，使用CLI和图像模型替身。4192当时公开两种`presetExecutions`。实时base v1/rule v2/card v2两路经实际workflow＋client替身分别1/2图，基础/规则/卡片文字相同，加图只新增角色段，归档一致；prepare与execute各强制刷新一次原件。暗调洗墙原卡WebP为35018字节、1080×721，SHA`c397dd515c4a441ee722ae0e8d157a372a9d254bc191a7b3bc8a9ba145c28612`。见`outputs/refined-lighting-final/evidence.json`、`prompt-*-compiled.txt`及`reference-original.webp`。

Main实际使用同底图、暗调洗墙、Banana 2.1切换两模式，START均可用但未点击；两按钮边框/背景/阴影一致，仅字重表示选择，没有高亮框，上传仍禁用。见同目录`ui-validation.json`、`prompt-only.png`与`prompt-and-reference.png`。Beta仅自动化，没有额外视觉验收；本轮无新收费模型调用，未认定加图优于仅提示词，真实质量仍待用户同图比较。以下1366项起为此前单图预设阶段证据。

此前独立基础阶段完整`npm test`1366/1366通过。4192运行新基础，`/api/styles`仅列新code@v1；旧编码同v1和旧版本10实际HTTP409，GET job404确认未入队。实时飞书基础与暖灯静夜、暗调洗墙、上传参考三路通过实际workflow＋图像client替身核验基础＋氛围组合、1/1/2图、品质要求及实际正文归档一致，无旧`renderPrompt/moduleKeys`。见`outputs/refined-lighting-final/evidence.json`、`base-compiled-validation.json`、`base-*-compiled.txt`；`main-base.png`确认当时页面选项“精模基础渲染 · v1”。未调用真实图像模型，夜景及其他氛围质量仍需真实精模图验收。

15个主功能面板的常态说明和维护链接可见数均为0，见`outputs/panel-copy-inline-cards-20261027/qa.json`。机械检查降级使用HTML正则，保留两处既有动态img警告，没有新增可见坏图，不声称零问题。

同轮曾发布v13中性modular MAIN止血（`reczz28SMb0CWdgy`，四块SHA`65a21fafd64bc44a5003c3f4635c69c7dbce4ad1e63419cc03fabf9d41572b2a`）；其“唯一上架13”和“新路径要求modular”已被独立基础Prompt替代，旧回执保留在`outputs/refined-lighting-final/evidence.json/`。此前1362项、下列1360项及下拉截图仅为相应阶段历史证据。

此前白模同款上下分区/共享下拉全量测试1360/1360通过；清除焦点小修后9项精模UI复测通过，3个UI文件机械扫描无发现。Main4192实测常显上传在上、十项下拉在下，选择预设/上传图片分别锁住另一来源，清除后焦点回下拉，删图后解锁并禁用START；刷新返回配置已更新，仍为10个预设。整体参数栏538→458可读且无溢出，验证后恢复538，仅证明窄容器布局，不能称为移动端验收。截图 `main.png`、`preset.png`、`reference.png`、`narrow.png` 见 `outputs/refined-lighting-final/evidence.json/`。Beta本轮仅自动化，未视觉验收；未真实生图或写飞书。以下并排版1360项及4192截图为历史证据。

此前并排按钮版互斥全量测试1360/1360通过；Main在4192实测两边禁用及缩略摘要×清除/删图解锁，清除后回未选并禁用START。失效预设、无图草稿及禁用/清除中断文件读取由自动化覆盖，Beta仅自动化。证据见 `outputs/refined-lighting-final/evidence.json/`，未真实生图、未写飞书。

此前十卡v2与新规则发布读回成功，上传参考规则v1资产深相等；该阶段全量 `npm test` 1356/1356通过、0失败，Beta仅自动化。十卡原件下载后的字节、SHA和尺寸10/10一致。真实资产通过内存 `imageClient` 编译截获，十个预设均为原模型单图，上传参考为双图；模型HTTP调用0次、归档写入0次，未进行真实生图。

此前Main `http://127.0.0.1:4214/?feature=refinedModel` 已实机确认：初始两个入口均存在、未选START禁用；十卡及新增四图可见。选“冷调日光”后START启用，卡片仅显示“· 已选”，没有高亮框。上传本地测试图可进入直接双图参考且START启用；删除上传图回未选并禁用START。`main.png`、`library.png`、`upload.png` 保存在 `outputs/refined-lighting-final/evidence.json/`。这些结果不等同本次互斥交互或真实成图质量验收。

此前移除原始光影入口/目标必选阶段全量 `npm test` 为1354/1354，Main4212有视觉验证、Beta仅自动化；它们是旧双图预设合同的历史证据，不能覆盖本轮预设改为文本单图及十卡v2。

离线接口、资产冻结、归档、界面和真实成图验收分别记录。真实验收应使用同组精模图检查设计/材质/机位保持、光影区分、亮暗细节、颗粒与总体质感。API成功、文本编译或版本读回不能替代这些结论。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

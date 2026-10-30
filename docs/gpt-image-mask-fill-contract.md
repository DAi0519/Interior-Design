# GPT Image 2.5 Sunburst 二次编辑开发对接

核对日期：2026-10-29；当前适配器版本2026-10-29.sunburst.16。接入模型 `gpt-image-2.5-sunburst`，通道为公司OneAPI；Flare未接入本功能。工作台入口：`http://127.0.0.1:4192/?feature=imageMaskFill` → 编辑模型选择 GPT Image 2.5 Sunburst。

局部消除独立使用`maskFillMode:"prompt"`加`maskFillOperation:"remove"`。默认最终Prompt只有“去除框选区域的物品，其余保持不变，最后去掉蓝色框。”；涂抹默认“去除涂抹区域的物品，其余保持不变。”。实际送模直接使用去首尾空白后的指令，不拼接下述编辑模板、`User instruction`或输出规则。消除必须有有效框选/圈选或真实遮罩，禁止携带参考图；仅凭正文出现“消除”不会切换操作。该操作由前端与后端共同校验，归档生成参数保存`maskFillOperation`与`removalPromptVersion`，最终Prompt记录实际短词。普通提示词编辑与参考图编辑行为保持各自合同。能力目录须声明`removalPromptVersion:"2026-10-29.removal.1"`，旧服务未声明时阻断局部消除。

## 尺寸与容量，分层理解

| 层 | 合同 | 证据与含义 |
| --- | --- | --- |
| 官方编辑文件 | mask可选；提供时与主图格式、宽高一致，有alpha，文件小于50MB | [官方图像指南](https://developers.openai.com/api/docs/guides/image-generation)。这不是本地上传额度 |
| 官方JSON编辑 | 最多16张输入图；`images[].image_url`、`mask.image_url`各最多20,971,520字符 | [Images edits参考](https://developers.openai.com/api/reference/resources/images/methods/edit)。Base64编码后的URL长度，不能当20MB原文件。纯Base64 data URL约可容纳15MiB原始字节，含前缀后略少 |
| 官方输入像素 | 上述编辑文档未明确给出输入每轴硬上限 | 不将输出3840px限制套到输入，不宣称4096是模型输入硬上限 |
| 官方自定义输出 | 两轴16倍数；长短边比≤3；每轴≤3840；655,360≤宽×高≤8,294,400 | 官方指南；高于2560×1440标为实验性。必须同时满足所有条件，不能仅检查长边 |
| 当前工作台上传 | 主图/绘制mask/参考图分别≤6MiB；每轴≤4096；≤16,777,216像素；PNG/JPEG/WebP单帧，mask仅PNG | 应用限制。真实字节解码；EXIF先归一化再核对mask宽高；不能信前端声明尺寸。HTTP JSON总请求≤30MiB |
| 当前实际提交 | 主图/参考图转PNG；mask可省略，提供时与主图保持原宽高，不先缩至2048/3840，不强制输入16对齐；每个实际PNG data URL再核20,971,520字符 | 转PNG可能增大文件，上传≤6MiB不保证转换后必过；超限在付费POST前400，不自动有损压缩 |
| 当前原生请求 | 1K/2K/4K输出；low/medium/high/xhigh/max质量，默认1K/medium；PNG，n=1 | 常用比例用模型真源尺寸矩阵；其他比例按最近比例档位像素预算保持原比例并适配16px网格。原图比例>3:1前置400 |
| 当前最终交付 | 完整原生PNG逐字节交付；不按mask裁切、回贴、调色、缩放或重编码；不统一限制2K | 512×512源图选择1K交付1024×1024，选择4K交付2880×2880；尺寸受上游原生边长/总像素限制 |

合法原生输出示例：1024×640为像素下限，3840×2160和2880×2880均为像素上限；4096×2160超边长，3840×3840超总像素，2048×512超比例，512×512低于总像素下限，均不合法。例子是公式校验，不代表每个尺寸已通过公司OneAPI真实调用。

## 开发对接：编辑模板与独立消除指令

蓝色框选和自由圈选的完整模板见 [交接表](gpt-image-edit-handoff.html) 与 [可直接读取的模板JSON](gpt-image-edit-prompts.json)，均与当前 `sunburstMaskPrompt` 保持一致。下表为普通提示词编辑；局部消除使用JSON的`templates.removal`直接传指令。

| maskFillMode | 图片输入 | 固定模板 |
| --- | --- | --- |
| `prompt` | 图1＝带蓝色定位线的完整原图 | `templates.prompt.template`；`userPromptRequired:true`，用户指令必填，不接受 fillReferenceImage |
| `reference` | 图1＝同上；图2＝独立参考图 | 按`purposes.object`或`purposes.material`选完整模板；`userPromptRequired:false`，无文字用`defaultTemplate` |

“无参考图”指不提供图2，两种模式都必须有原图。以模式字段选模板并校验附件一致，不能仅删图2却沿用有参考图模板。GPT无参考图模式的用户指令仍必填（去除首尾空白后1–8000字符）；GPT参考图模式可省略`prompt`，也可传空字符串或纯空白，非空时最多8000字符。后端先按`fillReferencePurpose`选择`templates.reference.purposes[purpose]`；有文字才使用该分支`template`并替换`{{USER_PROMPT}}`，没有文字直接使用该分支`defaultTemplate`，不添加`User instruction`行、空行或虚构的用户原文。例如替换使用`template.replace("{{USER_PROMPT}}", () => userPrompt.trim())`，保留正文中的字面字符，无需额外调用模型。

`fillReferencePurpose`仅用于`maskFillModel=gptImage25Sunburst`且`maskFillMode=reference`：`object`为换物品（省略时默认），`material`为换材质。由调用方明确选择并冻结，不自动猜分类；无参考图模式和Flux/Qwen不提交此字段。换物品使用图2对应物品替换目标；换材质使用图2材质并保留目标原有形态、结构和位置，匹配表面尺度、透视、光照与阴影。JSON的`templates.reference.template/defaultTemplate`继续作为默认object兼容值，新增的`defaultPurpose`为`object`；两用途分别读取`purposes`中的完整正文。

这两份导出专用于蓝色定位线。没有蓝线的纯指令编辑、独立透明mask涂抹仍由同一生产函数使用各自的定位段，不能让提示词假称有蓝色圈选；透明mask继续走同步Images edits。sunburst.15保持prompt/reference两内容模式，仅GPT参考图模式新增`fillReferencePurpose`用途字段；蓝圈、透明mask及无选区均可不填补充指令。无参考图模式与Flux/Qwen仍必填。固定规则按明确所选用途使用图2编辑图1目标，有补充指令时再跟随，不额外调用模型改写指令，本次未新增出图验证。

## 请求合同

sunburst.15沿用sunburst.10按实际是否存在透明mask分流的两条路径。没有mask的蓝色矩形框选、自由圈选及纯指令编辑使用后台Responses；仍然编辑完整图1，参考图保持独立图2，不是拼图。沿用当前业务指令拼接、真实PNG输入和原生结果直出，不额外调用模型改写Prompt。

无mask：`POST https://oneapi.qunhequnhe.com/v1/responses`，`background:true`；`input`消息依次包含一个完整`input_text`和原图、可选参考图的`input_image`。第一个`input_image`对应图1，第二个对应图2，`image_url`保持实际提交的PNG data URL。输出配置移到`tools`的`image_generation`，字段为`size`、`quality`、`n:1`、`image_format:"png"`、`response_format:"b64_json"`。完整蓝色圈选＋参考图、默认换物品object且未填写补充指令、3:2原图、1K/medium示例：

```json
{
  "model": "gpt-image-2.5-sunburst",
  "background": true,
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Image 1 is the image to edit. The temporary blue outline identifies the edit target. Edit this selected target and preserve unrelated content. The outline is a guide, not part of the scene or a hard boundary for editing. Keep the scene's composition, perspective and lighting consistent. Remove all blue guide marks from the final image.\nReplace the selected target in image 1 with the corresponding object from image 2. Match image 1's scale, perspective and lighting, and preserve unrelated content. If additional instructions are provided, follow them. Do not copy unrelated content or background from image 2.\nReturn one complete image without blue selection outlines, guide marks, labels or a collage."
        },
        {
          "type": "input_image",
          "image_url": "data:image/png;base64,{{SOURCE_WITH_SELECTION_PNG_BASE64}}"
        },
        {
          "type": "input_image",
          "image_url": "data:image/png;base64,{{REFERENCE_PNG_BASE64}}"
        }
      ]
    }
  ],
  "tools": [
    {
      "type": "image_generation",
      "size": "1536x1024",
      "quality": "medium",
      "n": 1,
      "image_format": "png",
      "response_format": "b64_json"
    }
  ]
}
```

提示词模式同时改用无参考图模板并省略第二个`input_image`；纯指令仍保留原图，且固定Prompt不假称存在蓝色标记。提交返回HTTP 202、`id:resp_...`及`status:queued`或`in_progress`后，使用同一OneAPI鉴权`GET /v1/responses/{id}`查询，轮询间隔1.5秒，提交及查询总等待600秒。整个任务只允许一次POST；超时不代表上游取消，上游仍可能继续执行或计费，不自动重发或重新创建任务。

有mask：透明mask在已核对的Responses文档中没有对应支持合同，继续使用`src/oneapi-client.mjs`的`editImage`，同步JSON `POST https://oneapi.qunhequnhe.com/v1/images/edits`。不得为了后台任务省略mask，也不得把mask塞进Responses的input/tools。同步参数保持：

```json
{
  "model": "gpt-image-2.5-sunburst",
  "images": [
    {
      "image_url": "data:image/png;base64,{{SOURCE_PNG_BASE64}}"
    },
    {
      "image_url": "data:image/png;base64,{{REFERENCE_PNG_BASE64}}"
    }
  ],
  "mask": {
    "image_url": "data:image/png;base64,{{ALPHA_MASK_PNG_BASE64}}"
  },
  "prompt": "Edit image 1 only in the transparent area of the supplied mask. Preserve its composition, perspective, lighting and all protected areas.\nReplace the target in the masked region of image 1 with the corresponding object from image 2. Match image 1's scale, perspective and lighting, and preserve unrelated content. If additional instructions are provided, follow them. Do not copy unrelated content or background from image 2.\nReturn one complete image, without borders, labels or a collage.",
  "size": "1536x1024",
  "quality": "medium",
  "n": 1,
  "output_format": "png",
  "response_format": "b64_json"
}
```

工作台任务输入新增 `outputResolution`（1K/2K/4K，省略为1K）和 `quality`（省略为medium）。旧显式 `inferenceTier=2k` 保留2K；与新输出字段冲突则400。送上游时输出档位解析为实际 `size`，质量原样发送；`fillReferencePurpose`仅选择固定Prompt，不作为额外OneAPI字段发送。常用例：方图1K=1024×1024、2K=2048×2048、4K=2880×2880；16:9的1K=1536×864、4K=3840×2160，不能把K统一解释成长边。

输入没有拼图：提示词模式发一张完整主图，参考图模式第二张是独立参考图。自sunburst.4起mask可选：未涂抹或清空画布后请求完全省略mask字段，只按原图和编辑指令生成；不上传空白/全白遮罩，也不在Prompt中假称存在mask。有涂抹时仍单独发送mask，仅作用于第一张。无mask时有效maskExpand=0，hasMask=false，maskConvention与三个mask摘要均为null。原始画笔PNG白色为编辑、黑色为保护；按原图像素扩展白区后转换为alpha：`alpha=255-red`，0编辑、255保护。JPEG主图转PNG后再搭配PNG mask。参考图不要求与主图同宽高。

模型mask只用于上游生成引导，遮罩外也可能变化。当前sunburst.15沿用.3整图直出：只校验返回PNG格式、单帧及实际尺寸，然后完整交付上游原始字节；不再提取编辑区贴回原图，也不做羽化或色彩匹配。原生结果与交付的SHA-256必须相同，元数据protectedAreaComposited/protectedSourceResampled/outputResized均为false。非预设比例存在16px网格近似，不裁剪源图。

## 蓝色圈选与涂抹工具

GPT保留画笔/擦除和矩形框选，新增“圈选”：按住鼠标或触屏自由画轮廓，松开自动闭合。涂抹、框选、圈选分别保存历史，按当前工具提交、撤销和清空；切换恢复各自区域，更换原图全部清空。两种编辑模式均支持圈选；不选区域仍可纯指令编辑。框选/圈选入口始终可见，Flux/Qwen下禁用并提示先选择GPT Image 2.5 Sunburst；白色画笔仍是涂抹遮罩。

矩形合同不变：`editRegion={x,y,width,height}`。自由轮廓提交 `editRegion={type:"polygon",points:[{x,y},...]}`，坐标按方向归一后的原图归一到0–1，左上角为原点。3–2048个有限坐标点，去除连续重复及尾部重复首点后必须形成非零面积；前端长轨迹自动降采样。后端映射到实际像素后再次拒绝退化或宽高小于3px的轮廓。任何editRegion均不能与maskImage同时提交，其他模型不接收该字段。

公开GPT目录分别以supportsBoxSelection=true和supportsLassoSelection=true声明能力。旧服务缺少对应标记时仅阻断该工具，提示重启并保留当前工具/区域；画笔和已支持工具仍可用。加载、网络和权限失败原因优先显示。

后端仅在送模副本上画#3b82f6空心蓝线：矩形沿内侧绘制，自由轮廓按实际点位闭合绘制，不替换成外接矩形。原始上传及飞书原图附件不变。首图是完整带标记底图，参考图仍为独立第二张，不拼图、不带mask。sunburst.15的Prompt明确图1是待编辑图，蓝色轮廓定位目标，保留无关内容、构图、透视与光照一致；参考图模式按换物品／换材质的明确用途使用图2编辑目标，有补充指令时再跟随，不复制无关内容或背景。轮廓不是场景内容或硬像素边界，全部蓝色标记由模型移除，不追加本地擦框或原图回贴。独立alpha遮罩仍走原mask分支，并共用相同的参考图说明。

冻结editRegion、editRegionPixels、regionAnnotation和实际标记输入SHA。矩形像素合同仍为{left,top,width,height}；多边形为{type:"polygon",points:[{x,y},...],bounds:{left,top,width,height}}，点坐标按round(归一化值×宽高)并限制在图内，bounds包含端点像素。多边形regionAnnotation记录shape=polygon、placement=centered-on-contour。hasMask=false、mask附件留空，实际带蓝色轮廓的完整PNG复用“框选原图”附件列且与送模字节一致。收费POST仍单次，结果PNG逐字节原样交付。

## 返回、归档与错误

Responses后台任务只在`status:completed`后读取`output`中`type:image_generation_call`的`result`，该字段可为完整PNG的Base64或图片URL；queued/in_progress仅继续查询，failed/cancelled/incomplete明确失败，不能把任务ID当结果。透明mask同步路径仍从Images edits的data结果中读取PNG。两条路径最终都从结果字节确认单帧PNG并重新读取原生尺寸，必须等于请求尺寸；格式或尺寸异常502且不归档为成功。至少保留 `sourceWidth/Height`、`inputWidth/Height`、`requestedSize`、`nativeOutputWidth/Height`、`outputWidth/Height`，分别表示方向归一原图、实际API输入、请求原生、实际原生和交付。另存原始上传宽高/EXIF事实、原件/提交主图/提交mask/原生结果/最终结果SHA-256、`requestId`、真实`usageCost`，费用未知为null。

未填补充指令时，`sourcePrompt`保留为空字符串；最终Prompt仍包含实际固定规则，不把固定默认语句伪造为用户原文。归档分别保存原始指令与实际完整Prompt。

后台任务冻结 `maskFillModel=gptImage25Sunburst`、模式、输出档位、质量、扩展像素和Prompt；入队及执行前复核当前Key目录。400为输入/尺寸不符；409为模型权限或飞书Schema未就绪；上游错误透传诊断，收费POST不自动重试。目录30秒超时；有mask同步编辑最多600秒；无mask后台Responses提交加轮询共600秒、每1.5秒查询同一resp任务，不重复POST。本地等待超时不等于上游取消，也不代表未收费。

飞书遮罩专属合同为七列和五类附件，模型字段为GPT Image 2.5 Sunburst、provider=oneapi；“遮罩图”仅在实际提交mask时存alpha PNG；无mask时附件留空、manifest为空数组，hasMask=false与输入一致，“参考图”存原始上传，参考图单独存，“结果图”存最终交付。“框选原图”仅在GPT框选或自由圈选时存实际送模PNG，与submittedSourceSha256逐字节一致；原始上传仍在“参考图”，不替换原件。无视觉圈选时该列留空，不重新画框或编码。参数中保留原生结果摘要/尺寸及费用。“局部推理尺寸（px）”在本模型下是整图原生请求长边，不是Flux局部crop尺寸。同步失败保留结果，不自动重跑生成。

## 验证状态

sunburst.15当前改动：GPT参考图模式新增明确的换物品object／换材质material用途，默认object，补充指令仍可不填。两用途固定段均从生产函数导出，换材质保留目标形态、结构与位置；不自动猜用途。本次仅核对合同测试与导出一致性，尚未新增真实出图。

sunburst.14历史：参考图模式允许无补充指令，未新增真实出图。

sunburst.13历史：曾简化固定模板，未新增真实出图。

sunburst.12历史：曾扩展参考规则，仅完成合同与导出核对，未新增真实出图。

sunburst.11历史Prompt改动（当时状态）：圈选定位优先于用户指令中的期望物体类别，禁止为匹配类别名改动圈外物体；图2在替换、添加或重新设计中提供造型、材质与颜色，仅移除时不强加参考物。完整Prompt直接从`sunburstMaskPrompt`导出到交接HTML、两份JSON和HTTP示例。本版本尚未新增真实出图，不能据Prompt改动宣称目标遵循或替换质量已修复；参考款式采用与圈选目标遵循必须分别验收。

sunburst.10后续用户真实异步样本（2026-10-22）：[飞书记录reczz28QMnGOzzIg](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28QMnGOzzIg)，上游任务`resp_0cb1013f7299336e866903bd55571a7cabdf75159934e377`经GET返回HTTP 200、`status:completed`。原图2176×1344，蓝色圈选位于左下脚凳（像素bounds为left=52、top=889、width=440、height=383）；图2为954×1072的木扶手白色拉扣椅；用户指令“换一下椅子”；实际结果1600×992。视觉检查发现圈内脚凳保留，圈外右侧两把黑色金属扶手椅被换成图2木扶手款式：参考款式被采用，但圈选目标定位失败。

该样本已核对原始上传主图、原始参考图、实际带蓝线送模主图与对应冻结摘要一致；OneAPI GET返回的结果原始字节、飞书结果附件与`workflow.outputSha256`一致。因此该错误不能归因为漏传参考图、漏传选区或本地按区域回贴。证据保存在[verification.json](../outputs/mask-fill-reference-target/verification.json)、[实际送模原图](../outputs/mask-fill-reference-target/source-blue.png)、[原始参考图](../outputs/mask-fill-reference-target/reference.png)及[原始结果](../outputs/mask-fill-reference-target/result-sunburst-10.png)。此例证明后台任务完成及对应附件字节一致，不代表所有画质项通过，也没有提供单笔上游供应商路由日志；当前Key的腾讯Sunburst实际路由仍待独立确认。

sunburst.10初次实现时的历史状态：新增无mask后台Responses，蓝色矩形、自由圈选、纯指令两种内容模式均以完整Prompt和原PNG data URL顺序提交，`background:true`及image_generation工具；透明mask保留同步Images edits原参数。当次已核对官方帮助中的请求结构与任务查询方式，但未执行真实异步出图，也未确认当前Key的腾讯Sunburst路由；当次不宣称202建任务、腾讯路由实际命中、真实完成耗时、去标记质量或飞书异步归档已验收。后续真实样本单列于上，不回写为初次实现已实跑。以下sunburst.9及更早证据保持其原版本和同步传输边界。

sunburst.9新增自由圈选：真实闭合轮廓送模，保留画笔与矩形框选；独立工具历史及能力标记，归一化与像素退化校验，完整标记图复用现有附件归档。104项相关离线回归通过（另24项面板回归通过），涵盖双模式真实凹轮廓描边而非外接框、2048点容量、取消/独立历史/旧服务能力保护、归一化与像素取整退化拒绝、队列深拷贝和送模归档字节一致。4190已重启，公开GPT目录回读available及两种选区能力均为true；本次不请求收费模型，不以合同测试宣称实际去标记或编辑画质已验收。

sunburst.8历史改动：圈选线与实际送模标记统一蓝色，Prompt不再使用red rectangle而使用blue outline/selected region，并保留目标物体及增删改换操作语义。交接HTML、JSON和HTTP导出同步此模板；当前工作台矩形交互保持原契约，未实现套索。100项相关离线回归通过，含UI描边与实际送模像素同蓝色、目标物体与操作语义、任意形状Prompt、去标记及真实输入附件归档；4190已加载本版并回读GPT框选可用。本次未请求收费模型。

sunburst.7历史验证：100项遮罩、OneAPI及飞书相关离线回归通过；覆盖双模式实际送模框图独立归档、原件保留、缺框图/坏摘要/错字节数/非框注入阻断、无框附件留空和两次回读。真实飞书已创建“框选原图”附件列fld4pCrtRl并通过当前Schema校验。当前1448×1086客厅画布预览另行留存（未执行生成），原图及带框预览附件已回读并下载逐字节核对SHA一致；[素材留存记录](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28QI4mZvI9t)。4190已重启加载本版并回读GPT框选可用；后续正式生成保存的是实际送模PNG。

sunburst.6历史验证：框选Prompt改为修改红框标识的物体，参考模式替换或修改同一目标物体；移除only inside及框外场景硬限制，保留无关物体/背景和最终去框要求。15项OneAPI离线回归通过，包含两模式实际请求Prompt断言；4190已重启并回读GPT及框选可用。未新增收费请求，实际物体编辑和去框效果仍待试用。

sunburst.5历史验证：98项遮罩、OneAPI及飞书相关离线回归通过，新增框选输入标记、框外输入像素不变、独立图2身份、去框指令、区域冻结归档及原生PNG逐字节交付；补充旧服务能力标记后UI18项再次通过。4190公开目录已回读supportsBoxSelection=true。浏览器实测画笔与框选切换、两份历史独立撤销/清空、更换原图清除区域；新页面保留用户原图、参考图和指令，验证用笔画已清理，原结果页保留。未提交收费请求，真实模型去框、框外保真和参考物体一致性仍待试用。

sunburst.4历史验证：91项遮罩、OneAPI和飞书相关离线回归通过。覆盖GPT无mask双模式请求完全省略mask、不伪造空白遮罩、完整原生PNG字节交付与mask外模型像素保留，Flux/Qwen仍必填；无mask飞书附件为空并两次回读字段/附件一致。4190已加载本版，公开目录返回maskRequired=false，浏览器显示可不涂抹、扩展置灰。本次未提交收费请求，OneAPI真实无mask出图质量仍待试用。

sunburst.2历史记录：105项相关合同测试通过（含Flux/Qwen遮罩、任务、OneAPI及飞书回归）。本地测试覆盖三输出档位原生交付、五质量原样传递、缺省1K/medium与旧显式2k兼容、参数冲突零付费拒绝、真实输入/透明mask/黑区保护、容量及无自动重试。

sunburst.2历史真实请求省略输出档位与质量，默认解析1K/medium：512×512输入及mask，原生返回与交付均为1024×1024，18.43秒，费用回执USD0.01875；[飞书记录回读成功](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28Q2ujUhKnU)。872,616个保护像素与同尺寸重采样原图逐像素一致，变化数0。证据在 `outputs/gpt-mask-fill-1k-medium-20261021/`。

界面按模型/方式/输出与质量/指令分组，实测组间20px、模式按钮间8px。1280px桌面输出与质量并排；390px窄屏抽屉改为单列，页面宽390px无横向溢出，仍保持1K/medium。布局检测无发现；截图与真实布局读数存同一证据目录。其他档位/质量的本版本合同测试不等于真实画质已经验收。

sunburst.3历史改动：输入合同保持不变，移除收到结果后的原图回贴。69项遮罩及OneAPI相关测试通过：提示词/参考图双模式验证交付字节与替身上游结果完全一致，包括模型在mask外的修改；另覆盖三档尺寸与五质量透传，非PNG返回前置502。4190已重启到本次代码，并回读模型可用性与新页面说明。旧版保护像素测试仅是历史证据，不适用于整图直出。尚未为本次改动重新提交收费请求，不能据此宣称历史灯图已修复或模型自身色差消失。

以下为2026-10-21的sunburst.1历史证据（当时固定2K/medium并最高2K交付），不能当作.2三档/五质量全部实跑通过。公司OneAPI真实测试，所有调用均为同一Sunburst模型、单张PNG、Images edits，以下为实际返回字节尺寸。边界测试固定low质量以验证通道尺寸，不能当作medium画质结论。

| 测试 | 实际API输入/请求输出 | 结果 |
| --- | --- | --- |
| 提示词局部重绘，medium | 4096×3072输入；请求2048×1536 | 原生2048×1536，交付2048×1536；19.45秒；费用回执USD0.0244；飞书成功 |
| 参考图局部重绘，medium | 主图/参考图各512×512；请求2048×2048 | 原生2048×2048，交付512×512；25.22秒；费用回执USD0.037785；飞书成功 |
| 输出像素下限，low | 97×65输入；请求1024×640 | 成功，原生1024×640，恰为655,360像素 |
| 输出像素上限，low | 97×65输入；请求3840×2160 | 成功，原生3840×2160，恰为8,294,400像素 |
| 超输出边长 | 请求3856×2160 | 上游400：最长边≤3840 |
| 低于输出像素下限 | 请求1024×624 | 上游400：低于最小像素预算 |
| 输出未16对齐 | 请求1025×640 | 上游400：宽高都需16整除 |
| 输出比例越界 | 请求3072×1008 | 上游400：最大3:1 |
| 超输出总像素 | 请求3840×2176 | 上游400：超过总像素预算，虽两轴均≤3840 |
| 工作台最大输入，low | 原尺寸4096×4096输入及mask；请求1024×1024 | 成功返回1024×1024；证明4096输入可用，不能反推上游输入硬上限就是4096 |
| 极小输入，low | 1×1输入及mask；请求1024×640 | 成功返回1024×640；97×65也证明输入不要求16对齐 |

两条工作台任务通过既有飞书六列、模型/provider身份、实际Prompt、三类/四类附件字节数的完整回读后，才返回同步成功：

- [提示词记录](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28Q2U7tFtbq)
- [参考图记录](https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblFWdK9RlSiZRKC&record=reczz28Q2UFUb7RE)

本地逐像素核对：提示词交付图2,703,198个保护像素、参考图交付图138,214个保护像素，变化数均为0；相对于缩放至交付尺寸的原图比较，判断范围为扩展后mask的黑区。合成样例已移除冰箱/替换为蓝花瓶，但提示词样例编辑边缘仍有可见色差，真实室内图边缘融合和参考物体一致性尚需业务图评测。

原始证据在忽略目录 `outputs/gpt-mask-fill-20261021/`：`size-boundaries.json`、`results.json`、`pixel-verification.json`、两条`*-job.json`及输入/实际提交mask/结果PNG。历史4K边界为独立通道探测；.2版本开放工作台4K，当前三档具体尺寸以实时配置与模型真源为准。

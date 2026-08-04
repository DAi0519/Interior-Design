# Canvas Lab Workbench v18 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-93641ead-f20e-484a-ac21-165584470034.png`
- Multiline regression source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-e6f2df08-25e4-41ac-8511-f216c4d9bcc7.png`
- Chat panel regression source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-11749354-0b96-4b7b-9974-cf0bb1fda4cf.png`
- Model note removal source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-967fe6dc-1b95-4b60-b460-eeacfd101bb2.png`
- Iteration baseline: `/tmp/canvas-lab-style-dna-layout-v4-final.png`
- Browser-rendered implementation: `/tmp/canvas-lab-style-dna-layout-v5-final.png`
- Multiline browser capture: `/tmp/canvas-lab-composer-max-after.png`
- Multiline normalized comparison: `/tmp/canvas-lab-composer-comparison.png`
- Bounded chat implementation: `/tmp/canvas-lab-chat-panel-bounded.png`
- Bounded chat normalized comparison: `/tmp/canvas-lab-chat-panel-comparison.png`
- Model note removal implementation: `/tmp/canvas-lab-model-note-removed.png`
- Model note removal normalized comparison: `/tmp/canvas-lab-model-note-comparison.png`
- Panel alignment source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-bc8513d8-2a53-4a50-9558-6a97c74ab94d.png`
- Panel alignment implementation: `/tmp/canvas-lab-panel-alignment-after.png`
- Panel alignment normalized comparison: `/tmp/canvas-lab-panel-alignment-comparison.png`
- Equal-height source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-1471df83-b147-4a03-a4cb-95fbed1358ab.png`
- Prompt table placement source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-50362033-db2d-45f3-9820-6b1c25f9a342.png`
- Equal-height implementation: `/tmp/canvas-lab-panel-equal-height-final.jpg`
- Equal-height normalized comparison: `/tmp/canvas-lab-panel-equal-height-comparison.jpg`
- Fixed generation panels source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-25b67d74-35ec-46a6-a1ce-bf6005cb0513.png`
- Fixed generation panels source crop: `/tmp/canvas-lab-fixed-panels-source-crop.png`
- Fixed white-model implementation: `/tmp/canvas-lab-fixed-panels-white-final-1280x720.png`
- Fixed white-model scrolled implementation: `/tmp/canvas-lab-fixed-panels-white-scrolled-final-1280x720.png`
- Fixed free-generation implementations: `/tmp/canvas-lab-fixed-panels-free-final-1280x720.png`、`/tmp/canvas-lab-fixed-panels-free-final-1440x900.png`、`/tmp/canvas-lab-fixed-panels-free-final-720x900.png`
- Fixed generation panels normalized comparison: `/tmp/canvas-lab-fixed-panels-comparison.png`
- Source pixels: 2160 × 1440
- Implementation pixels: 1280 × 720；CSS viewport 1280 × 720
- Multiline source pixels: 1334 × 240；focused implementation pixels: 620 × 216
- Multiline normalization: 实现截图仅为组件局部，比较图将其等比缩放至 1334px 宽后与源图纵向并置；只判断内容/工具栏分层、滚动边界和垂直节奏，不据此比较字体像素锐度
- Chat panel source pixels: 1326 × 1670；implementation pixels: 1280 × 720；CSS viewport 1280 × 720，devicePixelRatio 2
- Chat panel normalization: 将实现截图等比缩放至源图宽度后纵向并置；比较重点是面板高度、标题/composer 固定位置及内部滚动边界
- Model note source pixels: 834 × 240；implementation crop: 370 × 125；比较图将实现等比缩放至 834px 宽后纵向并置
- Panel alignment source pixels: 2078 × 294；implementation viewport: 1040 × 900 CSS pixels、devicePixelRatio 2；比较图裁取实现中对应的 1006 × 142 CSS 区域并统一到源图尺寸后纵向并置
- Equal-height source pixels: 1920 × 1050；implementation pixels: 1912 × 980；CSS viewport 1920 × 980、devicePixelRatio 1
- Equal-height normalization: 源图移除顶部 73px 浏览器栏并归一到 1912 × 980，与实现纵向并置；源图包含既有草稿而实现为空会话，只比较用户指定的面板外框高度、共同底边与标题区分隔线，不比较动态消息内容
- Fixed generation panels normalization: 源图裁去浏览器与 Codex 侧栏得到 1726 × 977 应用区域，白模实现为 1280 × 720 像素与 1280 × 720 CSS 视口、`devicePixelRatio=1`；同一对照图将两者等宽缩放后并排，只比较固定双栏、共同底边、左栏内容裁切边界和右栏稳定性，不比较不同模式的字段数量。
- State: 桌面端、风格反推模式、飞书服务端 Prompt、0 个附件、0 字附加要求
- Multiline state: 1117 × 837 CSS 视口、devicePixelRatio 2、0 张附件、3 行与 12 行文字两种输入状态
- Chat panel state: 4 轮完整 Style DNA 草稿、消息流停在底部、空 composer；使用生产样式的临时只读验收夹具，验收后已删除
- Model note state: 桌面端、风格反推模式、Gemini 3.1 Pro 已选、API 等待连接
- Panel alignment state: 1040 × 900 CSS 视口、风格反推模式、空消息区
- Equal-height state: 超宽桌面、风格反推模式、服务端 Prompt；实现为空消息区，源图为已有草稿状态
- Comparison method: 在同一视觉比较输入中打开用户标注截图与浏览器最终实现；因两张图视口不同，整体只比较信息层级，并以浏览器实际 CSS 测量验证 Prompt 满高、滚动和 composer 尺寸，不做虚假的逐像素判定

## Full-view Comparison

- 原有双栏工作台、模式切换、反推模型和右侧消息流保持不变。
- 左栏反推配置改成纵向弹性布局：模型区保持固定，Prompt 区占满剩余高度，底部说明距面板底边 21px。
- Composer 仍固定在消息区底部，没有侵入消息流；本轮在紧凑版基础上回增 4px，缓解文字区与工具栏的拥挤感。
- 第八轮源图中每增加一轮草稿都会继续拉长右侧结果面板；修复后 4 轮草稿仍保持 600px 面板高度，页面本身 `scrollHeight` 与视口同为 720px。
- 修复后标题和 composer 始终位于固定面板的顶部与底部，只有中间消息流显示滚动条并停在最新一轮。
- 第九轮只删除反推模型下方的图片探针说明；标题、连接状态、模型选择框、Gemini 3.1 Pro 名称和分割线位置均保持不变。
- 第十轮移除右栏结果面板与对话头部之间的重复内边距；左右首标题现在同为 `y=125px`，相对各自面板左边均为 `21px`，首层分隔线同为 `y=217px`。
- 右栏补上与左栏同语法的首层分隔线，两个首区共同使用 112px 高度；右栏不再像一张漂浮在独立留白中的标题卡。
- 第十一轮以左栏作为大屏双栏高度基准：1920 × 980 视口下左右面板均从 `y=104px` 延伸到 `y=964px`，高度同为 `860px`。
- 右栏标题区下方的分隔线已移除；标题顶线和 20px 内容内缩保持不变，右栏不再被横线切成独立工具栏。
- 第十二轮移除左栏完整 System Prompt、默认版本、恢复入口和编辑说明；左栏仅保留反推模型，飞书 Prompt 的正文与版本不进入浏览器。
- 1280 × 720 视口下左右面板仍从 `y=104px` 延伸到 `y=704px`，高度均为 `600px`；移除 Prompt 后没有破坏共同顶线、底线或引入横向溢出。
- 第十三轮纠正版本测试边界：左栏恢复脱敏 `Prompt 版本` 下拉和独立刷新，但不恢复正文编辑器；反推模型与 Prompt 版本使用同一配置语法。
- 第十四轮统一飞书信息架构：风格反推版本资产落在现有 `AI 生图` Base 的独立 `风格反推prompt` 表，不再把同一产品域拆成额外 Base；前端版本选择与服务端脱敏边界保持不变。
- 第十五轮收敛表结构：删除 `Agent 名称`、`创建时间`、`创建人`，将 `Agent 编码` 作为主字段；展示名称由服务端按编码派生，避免同一身份维护两份真源。
- 第十八轮把风格反推的稳定工作区范式扩展到白模与自由生图：桌面双栏占满顶栏下方可用视口，左右共享底边，只有左侧配置栏承接纵向滚动；窄屏继续使用自然单栏页面流。

## Focused Prompt Comparison（v11 历史记录）

- System Prompt 编辑器由固定 280px 改为弹性满高；当前 720px 视口下实际高度 348px，更高视口会继续随面板增长。
- 编辑器 `resize: none`，内部 `overflow-y: auto`；实测 `scrollHeight > clientHeight`，长 Prompt 可完整滚动。
- “默认 v1.0.0”与“恢复默认”并列置于标题行；底部只保留会话编辑说明。
- 编辑后恢复按钮启用、状态变成“已编辑”；点击后内容精确恢复并重新进入默认状态。

## Focused Composer Comparison

- 空态高度由 71px 回调到 75px；附件态高度由 127px 回调到 131px。
- 左侧附件入口从 32px 收敛到 28px，右侧发送按钮从 36px 收敛到 32px。
- 加号与上箭头继续使用既有 Heroicons 外部 SVG；没有引入新的装饰或无业务能力按钮。
- 1 张附件且文字为空时发送按钮保持可用。
- 第七轮源图暴露固定 70px textarea 与绝对定位工具栏互相覆盖；长文本需要 108px 时仍只能在 70px 内滚动，文字、滚动条和按钮处于同一覆盖区域。
- 修复后工具栏进入正常纵向布局：3 行文字时 textarea 为 75px、composer 为 114px；12 行文字时 textarea 在 160px 封顶、composer 为 199px，并仅在文字区内部滚动。
- 浏览器测得两种长文本状态下文字区与工具栏重叠量均为 0px；清空后 composer 精确收回 75px，不受多行 placeholder 影响。

## Findings

- 无 P0、P1 或 P2 视觉与可用性问题。
- 字体与排版：延续现有 system-ui 与等宽 Prompt 字体；标题行新增操作没有挤压标题或产生异常换行。
- 间距与布局：Prompt、说明与面板底部形成连续纵向节奏；composer 圆角从 14px 收敛为 12px，密度更接近工作台其他控件。
- 色彩与令牌：恢复按钮与输入表面复用现有 `--panel`、`--panel-soft`、`--line` 与 `--quiet` 令牌。
- 图片与图标：附件预览保持清晰；既有 Heroicons 资产未被字符、CSS 图形或内联 SVG 替代。
- 文案：恢复入口上移后保持明确；底部说明仍解释默认 Prompt 的来源和会话编辑边界。
- 多行输入：此前的工具栏覆盖属于 P1 核心输入可用性回归；修复后已无内容穿透、按钮遮挡或滚动条越界。
- 长对话面板：此前消息内容直接撑高外层面板属于 P1 工作区布局回归；修复后消息区 `clientHeight 386px / scrollHeight 1281px`，外层面板保持 600px。
- 模型说明：用户明确要求移除的句子已从 DOM 删除，不以隐藏文本或空占位保留；未产生新的 P0、P1 或 P2 问题。
- 模型卡表面：移除未选模型卡的顶部内高光，避免浅色卡片在高倍缩放下形成脱离边界的伪缝；选中态、圆角、尺寸与交互反馈保持不变。
- 双栏对齐：此前右栏叠加通用结果面板 20px 与对话头部 24px 内缩，标题相对面板偏移 44px，且没有首层分隔线；修复后两栏标题内缩、顶线和分区底线全部一致。
- 大屏等高：此前右栏固定在 600–760px，左栏由 Prompt 与工作区高度决定，超宽屏底边明显断开；修复后桌面右栏参与网格拉伸并跟随左栏，动态消息仍只在中间消息流滚动。
- Prompt 隔离：当前 DOM 中 `#styleDnaSystemPrompt`、`#styleDnaPromptState`、`#styleDnaPromptResetButton` 与 `.style-dna-prompt-section` 数量均为 0；页面可见文本不含 `System Prompt`。
- 生成模式固定双栏：源图与最终白模实现的同输入对照确认顶栏、双栏起点、共同底边和稳定右侧结果区一致；左栏超出内容在面板边界内裁切并可滚动，没有继续拉长页面。
- 白模生成入口在首次成功前保持单一全宽深色按钮；提示词可复用后原位显示“再次渲染 / 重新融合”两个独立按钮，两者共享高度、字号、图标尺度和低投影，主次层级只由深色与中性浅色块表达，没有隐藏菜单。

## Interaction Verification

- Prompt 正文编辑与恢复交互保持删除；浏览器保留反推模型、脱敏版本选择和附件策略。
- 点击加号可添加参考图；1 张附件、输入为空时发送按钮 enabled。
- 首轮没有参考图时拒绝发送；首轮有图时允许不填附加要求。
- 草稿生成成功后清空本轮附件；已有草稿上下文时，纯文字补充要求可直接发送，无需重复上传图片。
- 新对话同时清空消息与未发送附件，恢复首轮必须有图的状态。
- 白模渲染、自由生图与风格反推在桌面端均使用视口等高双栏；白模和自由生图滚动整个左侧配置栏，风格反推继续只滚动中间消息流。
- 页面无横向溢出，浏览器控制台无 error 或 warning。
- 状态机由浏览器与服务端双重校验，OneAPI 请求层确认纯文字续改不会重复附加历史图片。
- 后端已重启并加载新校验；公开反推配置接口返回正常。重启清空了内存 API Key，真实模型回归留待重新连接后执行。
- 多行输入实测“空态 75px → 3 行 114px → 12 行 199px → 清空回到 75px”，全部状态工具栏保持独立底栏且控制台无 error 或 warning。
- 四轮草稿实测向上滚动到 `scrollTop 0`、再向下滚动到 `scrollTop 894.5`；标题、composer 与 600px 面板高度均未移动，控制台无 error 或 warning。
- 反推模型区域实测 `#styleDnaModelNote` 不存在，区域文本不再包含“已通过白模图片输入探针”；模型选择仍为 Gemini 3.1 Pro。
- 桌面端实测左/右首区均为 `112px` 高、标题均位于 `y=125px`、标题相对面板内缩均为 `21px`（含 1px 面板边框）。
- 720 × 900 窄屏实测为单栏 `696px`，页面 `scrollWidth=720px`，右栏外层 padding 为 `0px` 且对话头部自然收为 `85.546875px`，没有横向溢出或桌面强制定高残留。
- 1920 × 980 超宽屏实测左/右面板高度均为 `860px`，上下边界完全一致，右栏标题区 `border-bottom-width=0px`，页面没有横向溢出。
- 720 × 900 单栏继续保持 `760px` 对话高度，未把桌面“跟随左栏”规则泄漏到窄屏；标题区分隔线同样为 `0px`。
- v13 公开配置接口返回 `referenceAttachment` 与脱敏 `promptAgent.versions`，不含 `systemPrompt` 或 Agent 正文；反推请求只提交 `promptVersion`。
- v13 实际 Base 当前只有 `Style DNA 反推 Agent · v1`，页面默认选中 v1；刷新版本后目录仍正常，页面刷新后所选 v1 保持，控制台无 error 或 warning。
- 场景融合 Agent 真实 Base 当前有 v5、v6 上架，页面版本目录只显示这两个版本并默认选中 v6；v1–v4 下架版本不进入接口和页面。
- 融合基模自定义下拉实测 `Gemini 3.1 Pro → Doubao Seed 1.8 → Gemini 3.1 Pro` 双向切换，值、触发器文案与探针说明同步。
- 出图模型已由四卡片改为自定义下拉，实测 `GPT Image 2 → Seedream 5.0 → GPT Image 2` 双向切换；生成质量区随 GPT 显示、随 Seedream 隐藏，画幅与分辨率保持合法。
- 1280px 页面 `scrollWidth = clientWidth = 1280px`，控制台无 error 或 warning。
- 白模上传 `491 × 923` 非标准竖图后，四个出图模型均自动选择各自合法的 `9:16`：Banana Pro/Banana 2 为 `1536 × 2752`、GPT Image 2 为 `1152 × 2048`、Seedream 5.0 为 `1600 × 2848`。
- 自动状态徽标显示 `0.53:1 → 9:16 · WxH`；手动改为 `4:3` 后箭头提示消失并回显 `2400 × 1792`，继续切换到 `4K` 得到 `4800 × 3584`，证明分辨率不会继承原图且与比例独立。
- 手动覆盖后切换出图模型会重新按原图进入自动适配；浏览器控制台无 error 或 warning，完整参数区无溢出。
- 自由生图以第一张参考图为画幅基准，上传后自动进入最近合法比例；手动覆盖后继续添加第二张图不改写比例，移除首图或切换模型后按新的首图重新适配。
- 1280 × 720 桌面端实测工作区、左栏和右栏高度均为 `600px`，上下边界为 `y=104–704px`；白模左栏 `scrollTop 0 → 629.5px`、自由生图左栏 `scrollTop 0 → 266px`，页面始终 `scrollTop=0` 且 `scrollHeight=clientHeight=720px`。
- 1440 × 900 桌面端实测双栏随视口增长到 `780px`，页面 `scrollHeight=clientHeight=900px`；720 × 900 窄屏恢复自然单栏，页面高度 `1746px` 且无横向溢出。
- 风格反推回归仍为左右 `600px`，消息流保持 `overflow-y:auto`；三种模式和三档视口的控制台均无 error 或 warning。
- 第十九轮浏览器实测：白模模式显示“开始渲染”主体和“打开更多生成方式”次级触发区，菜单可由真实指针打开，Escape 与点击结果区均关闭；自由生图隐藏次级入口且主按钮恢复 `6px` 四角，切回白模后右上角为 `0px` 并恢复分裂结构。
- 第十九轮服务端测试确认相同输入普通重试命中缓存、`forcePromptRegeneration=true` 显式重算、融合条件变化自动失效；浏览器控制台无 error 或 warning，未执行真实模型生成以避免消耗额度。
- 第二十轮自动化测试 83/83 通过：首次白模、同指纹复用、融合输入变化失效、自由生图隔离、忙碌态，以及服务端普通复用/强制重算链路全部通过。
- 第二十轮 1280 × 720 浏览器实测：首次白模只有全宽“开始渲染”，`#regeneratePromptButton` 保持隐藏且旧菜单节点数量为 0；真实指针完成白模 → 自由生图 → 白模切换，自由生图始终显示“开始生成”，页面结构与左栏滚动正常。
- 本轮未执行真实模型生成以避免消耗额度和写入飞书；成功后的双按钮由纯状态测试覆盖，真实页面验收边界为首次态、模式切换、DOM 清理与视觉布局。
- 第二十一轮真实页面加载 `generation-actions.css?v=2`，重新融合按钮包含 1 个同尺度线性图标，旧菜单节点仍为 0；真实指针再次完成自由生图 → 白模双向切换，首次态与模式隔离没有回归。
- 第二十一轮未调用真实模型触发成功态；双按钮视觉改进依据用户提供的成功态截图、实际 360px 左栏尺寸与已加载 CSS 结构验收，不把隔离预览受限或未执行的模型调用记为运行时证据。

## Comparison History

- 第五轮问题：Prompt 固定高度导致高面板下方留白，原生伸缩柄与已有滚动条重复；恢复默认位于底部且过于隐晦；composer 和按钮仍略大。
- 第五轮修复：Prompt 改为弹性满高且禁止拖拽，恢复默认移至标题行；composer 空态压缩至 71px，附件/发送动作收敛至 28px/32px。
- 第六轮问题：71px 空态在实际使用中略显拥挤。
- 第六轮修复：仅将文字区和内部上下间距增加 4px，空态回调到 75px；按钮、圆角、宽度和其余布局保持不变。
- 修复后证据：Prompt 底部说明距面板底部 21px、内部可滚动、恢复交互通过；composer 无横向溢出且附件态仍支持仅图片发送。
- 第七轮问题：textarea 固定 70px，工具栏绝对定位覆盖其底部 32px；多行文字只能滚到按钮下方。
- 第七轮修复：textarea 按内容在 36–160px 内自适应，工具栏改为 flex 正常流底栏；空值单独回到 36px，避免 placeholder 换行撑高空态。
- 第七轮修复后证据：3 行与 12 行状态重叠量均为 0px；上限状态 `scrollHeight 268px / clientHeight 160px` 且 `overflow-y: auto`，清空后恢复 75px composer。
- 第八轮问题：消息流虽然声明了 `overflow-y: auto`，但 420px 强制最小高度与没有高度上限的结果面板让内容持续撑开外层，滚动边界实际不成立。
- 第八轮修复：风格反推结果面板按视口固定在 600–760px，消息流 `min-height` 归零并独立滚动；标题与 composer 保持正常 flex 固定区。
- 第八轮修复后证据：4 轮草稿时外层 600px、消息区 `386/1281px`，真实滚轮完成底部 → 顶部 → 底部双向回归，外层与页面高度不变。
- 第九轮问题：反推模型下方“已通过白模图片输入探针”属于不必要的实现说明。
- 第九轮修复：删除说明节点及其 `aria-describedby` 和控制器写入逻辑，不影响模型目录和可用性状态。
- 第九轮修复后证据：浏览器 DOM、局部截图与规范化对照均确认该行及其占位消失，其余控件保持原样。
- 第十轮问题：右栏同时继承结果面板 20px padding 与自身 24px padding，标题横向偏移达到 44px；左右标题顶线和首层分区底线均不共线。
- 第十轮修复：风格反推状态下清除结果面板通用 padding，左右首区统一为 20px 内容内缩与 112px 高度，右栏增加同色 1px 分隔线；900px 以下取消桌面首区定高。
- 第十轮修复后证据：同状态 DOM 测量确认标题顶线、相对内缩和分隔线三组数值完全一致；源图与最终实现已在同尺寸比较输入中完成复核。
- 第十一轮问题：大屏下左栏高于右栏，右栏 760px 固定上限造成底边断裂；标题区下方分隔线也增加了不必要的区域切割。
- 第十一轮修复：桌面端移除右栏固定高度，让网格以左栏内容和工作区高度生成共同轨道；删除标题区分隔线，并仅在 900px 以下恢复原有 600–760px 单栏高度。
- 第十一轮修复后证据：超宽屏 DOM 测量、最终截图和归一化前后对照均确认双栏同高、共同底边且分隔线消失；窄屏回归无溢出。
- 第十二轮决策：System Prompt 改由飞书独立数据表做版本管理，前端不再显示或允许会话内覆盖。
- 第十二轮修复：删除 Prompt 区 DOM、CSS 和浏览器状态；服务端执行时读取最高已上架版本，并继续保持双栏共同轨道。
- 第十二轮修复后证据：65/65 自动化测试通过；1280 × 720 页面实测 Prompt 节点为 0、双栏均为 600px、无横向溢出，公开配置响应无 Prompt 正文。
- 第十三轮问题：将“正文不在前端显示”误解为“版本也不可选”，阻断了新旧 Prompt 的工作台回归测试。
- 第十三轮修复：恢复与 Style DNA 同语法的已上架版本选择和刷新；服务端支持默认最高版本及指定历史上架版本，仍不向浏览器返回正文。
- 第十三轮修复后证据：67/67 自动化测试通过；真实接口返回 v1 脱敏目录，1280 × 720 页面显示版本选择且双栏同高 600px，正文节点仍为 0。
- 第十四轮问题：白模上传后仍固定使用模型默认 `4:3`，用户必须手动理解并选择画幅，容易改变原始构图边界。
- 第十四轮修复：浏览器读取图片宽高并在四个模型各自合法比例矩阵中选择最近项；服务端从真实 PNG/JPEG/WebP 图片头重复计算，显式手选后才使用手动画幅，分辨率保持独立。
- 第十四轮修复后证据：75/75 自动化测试通过；真实上传、四模型切换、手动覆盖、分辨率切换和重新自动适配均通过，参数徽标完整显示且控制台无错误。
- 第十五轮问题：白模场景融合 Agent 始终隐式使用最高版本，无法在工作台选择历史已上架版本；出图模型仍占用四张卡片，不符合其余配置项的下拉语法。
- 第十五轮修复：服务端公开不含正文的完整 Agent 版本目录，前端显示全部版本并禁用下架/空正文项，默认和记忆最高可用版本；白模请求精确透传所选版本，出图模型统一改为自定义下拉。
- 第十五轮修复后证据：75/75 自动化测试通过；真实 Base v1–v6 目录、刷新、版本禁用态、融合基模与出图模型双向鼠标选择、参数联动、1280px 无溢出及零控制台错误均通过。
- 第十六轮决策：场景融合 Agent 下拉不承担版本运营状态展示，只展示可实际执行的已上架完整版本，下架版本不返回前端。
- 第十六轮兼容修复：已打开的旧页面仍按 `published/validPrompt` 判断可选项，而新版接口一度省略这两个恒真字段，导致刷新后误过滤全部版本；服务端对已上架目录保留恒真兼容标记，并提升静态资源版本，旧页面刷新与新页面重载均可显示 v5、v6。
- 第十七轮问题：自由生图上传参考图后仍固定使用手选画幅，只有白模模式进入原图最近合法比例链路。
- 第十七轮修复：自由生图以前端首图尺寸即时适配，并由服务端从首图真实图片头重复计算；无图保持手选，手动覆盖、追加参考图、移除首图与切换模型遵循和白模一致的状态规则。
- 第十七轮修复后证据：76/76 自动化测试通过；首图/次图顺序、服务端可信宽高、手动覆盖及真实页面上传链路均完成回归。
- 第十八轮问题：白模与自由生图仍由左栏全部配置内容撑高网格，1280 × 720 下双栏达到 `866.046875px`、页面 `scrollHeight=986px`；右栏结果画布的 `600px` 最小高度也阻止其收进可用视口。
- 第十八轮修复：桌面工作区使用 `100dvh - 120px` 固定轨道并禁止页面级滚动，左栏设为独立纵向滚动容器，右侧结果画布 `min-height` 归零；`900px` 以下不继承这些约束。
- 第十八轮修复后证据：白模和自由生图在 1280 × 720 下左右均为 `600px`，真实滚轮只改变左栏 `scrollTop`；1440 × 900 自动增长至 `780px`，720 × 900 回退自然单栏，风格反推等高与消息流滚动回归通过，归一化同输入对照无 P0/P1/P2 差异。
- 第十九轮问题：相同融合条件自动复用提示词后，页面没有主动忽略缓存的入口，用户只能改输入、等待过期或重启服务。
- 第十九轮修复：白模主操作改为分裂按钮，主体继续复用最终提示词，右侧菜单显式传递 `forcePromptRegeneration=true`；菜单控制独立为 generation-menu JS/CSS，支持键盘、Escape、外部点击与模式隔离。
- 第十九轮修复后证据：78/78 自动化测试通过；1280 × 720 真实指针、键盘、白模 → 自由生图 → 白模双向切换、菜单向上展开、圆角与控制台回归通过。
- 第二十轮问题：分裂按钮仍把“重新融合”藏进更多菜单，用户无法直接看见当前可执行的两种生成语义，也难以判断提示词是否已经可复用。
- 第二十轮修复：生成动作改为输入指纹驱动；首次为全宽“开始渲染”，白模成功后切换为“再次渲染 / 重新融合”，任一融合输入变化立即恢复首次状态，自由生图与输出参数保持隔离。
- 第二十轮修复后证据：83/83 自动化测试、1280 × 720 首次态截图、真实模式双向切换、旧菜单 DOM 清理与静态资源加载均通过；未把未执行的真实模型调用记为产品级证据。
- 第二十一轮问题：双按钮虽然语义清楚，但深色主按钮使用图标、数量胶囊和投影，描边次按钮只有居中文字，形成两个组件体系拼接的割裂感。
- 第二十一轮修复：次按钮改为中性浅色块并增加循环融合图标；双按钮统一为 48px 高、13px 字号、17px 图标、6px 圆角、低投影和 `scale(0.97)` 按压反馈，主次只通过色阶区分。
- 第二十一轮修复后证据：83/83 自动化测试、CSS v2 静态资源、真实页面图标 DOM、旧菜单清理和模式双向切换通过；成功态未再次消耗模型额度。
- 第二十二轮问题：系统没有多张生成能力，主按钮仍固定显示“1 张”，属于没有对应控制能力的伪状态信息，并让主按钮内容被迫左右分散。
- 第二十二轮修复：删除数量 DOM 与全部 `.button-meta` 死样式，主按钮恢复居中的“图标 + 文案”结构；CSS 版本提升至 v3，避免旧胶囊样式缓存。
- 第二十二轮修复后证据：83/83 自动化测试通过，公开 HTML 已加载 CSS v3，`public/` 内 `.button-meta` 与固定数量节点均为 0，主按钮居中规则已由服务端静态资源返回。
- 第二十三轮需求：融合基模新增 Model Link 卡片 `doubao-seed-2-0-lite-260215`，实际请求使用 `/v1/models` 返回的 `doubao-seed-2.0-lite` 路由别名，同时保留已有 Seed 1.8 兼容候选。
- 第二十三轮修复：沿用 Prompt Agent 模型白名单与图片输入门槛，新增 `Doubao Seed 2.0 Lite` 候选，不改页面渲染与选择状态机。
- 第二十三轮修复后证据：105/105 自动化测试通过；独立 4273 端口真实页面显示 10 个融合基模选项，可选择 `Doubao Seed 2.0 Lite` 并同步显示图片输入能力说明，控制台零 error/warn；当前已保存 Key 的真实模型目录包含请求别名且可用性检查返回 `available/selectable=true`。未执行真实模型生成，未把未发生的计费调用记为完成证据。

## Follow-up Polish

- 暂无阻塞项；重新连接 API Key 后即可按“首轮传附件 → 后续纯文字续改”的真实路径验收。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

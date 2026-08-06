<!--
[INPUT]: 依赖用户截图、浏览器渲染证据、真实指针/键盘交互与自动化回归结果
[OUTPUT]: 对外提供 Canvas Lab 与 Benchmark 视觉实现的分轮验收记录、问题优先级和最终结论
[POS]: 项目根目录的视觉验收历史，与 DESIGN.md 的设计契约形成实现证据闭环
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Benchmark Failed Run Recovery v16 Design QA

## Evidence

- User-reported source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-7b2d64fa-c8f5-4170-8564-06aef0f9ab13.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-run-retry/retry-and-comparison-link.jpg`
- State: 4173 单端口真实服务、当前持久化实验 `EXP-20260805T072053Z-8A5E`、4 个 Run 中 1 张失败。

## Findings

- 初始 P1：Runner 已支持成功 Run 跳过与失败 Run 新尝试，但完成态任务卡没有重试入口，用户无法调用既有能力。
- 初始 P1：“横评对比”仅绑定页面内存中的预演计划；概览同步或刷新后 `state.plan` 归零，已落库实验的链接被错误禁用。
- 修复后任务卡按持久化结果显示“重试 1 张失败出图”；重试输入沿用原实验 ID、Case 范围与冻结草稿，Runner 只为失败 Run 创建下一次尝试。
- 横评入口改为优先读取当前预演实验、否则读取任务持久化实验 ID，页面刷新后仍可用。

## Interaction Verification

- 真实页面读回：任务文案“任务完成，1 张出图失败”，重试按钮可见，横评按钮 `disabled = false`，进度保持 `4 / 4`。
- 未点击重试，避免产生模型费用；执行级回归确认两张成功、一张失败时只发生 1 次图像调用，失败 Run 写入 attempt 2 并保留重试来源。
- 真实点击横评入口无 toast/控制台错误；视图准备接口返回 HTTPS 目标并定位横评表与展示视图。
- 页面无错误覆盖层；自动化测试 `183/183` 通过。

final result: passed

---

# Flux2 Klein Intelligent Resolution Routing v15 Design QA

## Evidence

- User correction: Flux2 Klein 不能因尺寸能力不同而排斥其他候选模型，需支持同组多选。
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/flux-resolution-fix/flux-adaptive-routing.jpg`
- State: 4173 单端口真实服务、Benchmark 已连接、实验配置与只读预演链路。

## Findings

- v14 的互斥方案虽然消除了空分辨率，却破坏了“唯一变量为出图模型”的同组横评目标，因此被用户否决。
- v15 将分辨率提升为共享语义策略“智能适配”：Flux2 Klein 冻结为原图尺寸，Banana 2、GPT Image 2、Seedream 5.0 分别冻结为共同默认 2K。
- Runner 仅允许 Provider 尺寸能力导致的 `source / 2K` 差异；格式、质量、比例与原图画幅策略仍要求完全一致，不放松控制变量。
- 每个 Run 使用自身冻结配置的具体输出规格，记录、请求、结果附件格式与失败记录不再误读横评组的聚合分辨率。

## Interaction Verification

- 真实点击 Flux2 Klein 后，Banana 2、GPT Image 2、Flux2 Klein、Seedream 5.0 四个候选同时保持选中；分辨率显示“智能适配 · Flux 原图 / 其他 2K”。
- 真实点击“生成只读预演”通过：9 Cases、4 模型、9 Prompt 批次、144 个出图 Run；该动作未调用模型、未写入 Base。
- 页面有内容、无错误覆盖层、浏览器错误数组为空；自动化测试 `180/180` 通过。

final result: passed

---

# Flux2 Klein Resolution Compatibility v14 Design QA

## Evidence

- User-reported source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-9fee093a-67d3-4d29-a2fa-f82252d66bb2.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/flux-resolution-fix/flux-original-resolution.png`
- State: 4173 真实服务、实验配置面板、Flux2 Klein 已选、Benchmark 已连接。

## Findings

- 初始 P1：Flux2 Klein 的 `source` 原图尺寸与其他候选模型的 `2K/4K` 求交后为空，分辨率下拉显示“请选择”，但候选卡仍伪装成兼容。
- 修复后选择 Flux2 Klein 会自动取消固定分辨率模型，分辨率明确显示“原图尺寸”，格式为 PNG、质量档为“不适用”；选择 Banana 2 等固定分辨率模型时会自动取消 Flux 并恢复 2K。
- Flux 候选卡补充“原图尺寸 · 选择后单独成组”，使互斥行为与 Provider 能力在操作前可见。

## Interaction Verification

- 真实点击 `Banana 2 / GPT Image 2 / Seedream 5.0 → Flux2 Klein` 后，仅 `aiTextureEnhancement` 保持选中，分辨率值为 `source / 原图尺寸`。
- 再真实点击 Banana 2 后，仅 `banana2` 保持选中，分辨率恢复 `2K`。
- 浏览器日志为空；自动化测试 `177/177` 通过。

final result: superseded by v15

---

# Benchmark Vertical Flow v13 Design QA

## Evidence

- Source visual truth: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-vertical-flow/01-current-left-layout.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-vertical-flow/06-vertical-final-1440x900.png`
- Full normalized comparison: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-vertical-flow/07-before-after-comparison.png`
- Focused navigation comparison: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-vertical-flow/08-navigation-focused-comparison.png`
- Responsive evidence: `04-vertical-1280x720.png`、`05-vertical-720x900.png`
- Source and implementation pixels: `1440 × 900`；CSS viewport `1440 × 900`，devicePixelRatio `1`，无需密度归一。
- State: 真实服务、Benchmark 已连接、样本集面板、9 个已录入样本。

## Full-view Comparison

- 旧版用 `360px` 左侧流程面板与右侧工作面板并排，流程标题、暖灰分组和白色选中键帽形成三层视觉嵌套；右侧标题只能与左侧流程标题机械对齐。
- 新版把主体改为纵向轨道：`1408 × 66px` 单层流程条位于 `y=104px`，完整工作面板位于 `y=186–884px`，两者共享 `x=16–1424px` 左右边界。
- 当前工作面板独占整行后，样本录入和数据表仍保持原有比例与共同顶线；业务字段、真实数据和顶部产品导航没有改变。

## Focused Region Comparison

- 字体与排版：流程标题保持 `13px / 500`，步骤名保持 `12px / 600`，序号继续使用等宽字体；横向等分后五个步骤扫描路径更短。
- 间距与布局：流程条只保留一道外边界和一条标题分隔线；步骤容器不再使用暖灰套框或内阴影，当前步骤仅用同层暖灰填充与细微内描边。
- 色彩与令牌：继续使用暖白面板、暖灰选中态、近黑文字和既有边框令牌，没有引入新色系。
- 图片与资产：继续复用现有 Canvas Lab Logo；本轮没有新增、替换或伪造图片、图标与装饰资产。
- 文案与内容：五步名称、顺序、序号和“5 个阶段”均保持不变。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 上下结构消除了左侧空白占高、容器套容器和左右标题基线竞争；流程与内容成为两个职责明确的同级区域。
- 1280 × 720 页面保持固定视口，流程条 `66px`、工作面板 `518px`；工作面板独立滚动 `scrollTop 0 → 117.5px`，页面保持 `scrollTop = 0`。
- 720 × 900 恢复自然页面流，`scrollWidth = clientWidth = 720px`，没有横向溢出。

## Interaction Verification

- 真实点击依次完成 `样本集 → 实验配置 → 批量运行 → AI 评分 → 数据分析 → 样本集`；每次只有一个面板 active，所有面板共同使用 `y=186–884px` 边界。
- 真实数据读取为 9 行，连接状态为“Benchmark 已连接”；浏览器日志为空，无 error 或 warning。

## Comparison History

- 初始 P1：左侧流程外层面板、内部标题分区、暖灰步骤分组和白色选中键帽形成多重嵌套；流程与内容并排后，左右顶部虽然数值对齐，但语义层级和视觉重量不对等。
- v13 修复：移除左侧轨道与步骤内套框，改为全宽单层横向流程条；当前工作面板下移并独占整行，桌面剩余高度仍由工作面板承接。
- 修复后证据：同视口完整页纵向对照、导航聚焦对照、五步真实切换、两档响应式、滚动边界、真实数据与浏览器日志检查均通过。

final result: passed

---

# Canvas Lab Product UI Unification v12 Design QA

## Evidence

- Before: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/product-unification-audit/01-benchmark-before.png`、`02-generation-reference.png`、`03-before-comparison.png`
- Final source / implementation: `10-qa-generation-reference.png`、`11-qa-benchmark-implementation.png`
- Normalized comparisons: `12-qa-full-comparison.png`、`13-qa-header-comparison.png`、`14-qa-left-panel-comparison.png`
- Responsive: `15-qa-compact-1280x720.png`、`16-qa-narrow-720x900.png`
- State: 真实服务、Benchmark 已连接、9 个已录入样本；生图工作台为白模渲染模式。

## Full-view Comparison

- 两个工作台都使用 `x=16 / y=16 / 1408×56px` 顶栏；品牌固定在左、产品切换固定在视觉中心、连接状态固定在右。
- 1440×900 桌面端两页左面板均为 `x=16 / y=104 / 360×780px`，右侧内容从 `x=392px` 开始，共享 16px 外间距和 32px 区块间距。
- 主动作恢复近黑底白字，管理动作保持白底黑字细边框；层级由职责决定，不再因页面不同而切换语言。

## Focused Region Comparison

- 字体与排版：两页品牌、导航和面板标题统一为 system-ui；左面板标题均为 `13px / 500`。
- 间距与布局：顶部三列网格保证中间切换不受左右内容长度影响；评测流程与生图功能区都使用 20px 内边距。
- 色彩与令牌：沿用 Canvas Lab 暖白画布、白色面板、暖灰分组、近黑文字和细边框。
- 图片与资产：继续复用现有 Canvas Lab Logo，没有新增、替换或伪造资产。
- 文案与内容：品牌副标题统一为 `IMAGE COMMAND CENTER`；业务字段、流程步骤与样本数据不变。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 旧版顶部切换位置漂移、品牌排布变化、评测侧栏过窄且字号不一致的问题已经消除。
- 评测侧栏保留“流程导航”职责，生图侧栏保留“配置表单”职责；结构差异是业务差异，表面语言保持一致。

## Interaction Verification

- 真实指针完成 `数据分析 → 样本集` 双向切换；顶部 `生图工作台 → 模型评测` 双向跳转通过。
- 1440×900 与 1280×720 均满足 `body.scrollWidth = body.clientWidth`、`body.scrollHeight = body.clientHeight`；活动评测面板独立滚动，页面 `scrollTop` 保持 0。
- 720×900 恢复自然单列页面流，五步导航转为横向五列，`scrollWidth = clientWidth = 720px`。
- 浏览器控制台无 error 或 warning。

## Comparison History

- 初始 P1：两页顶栏把产品切换放在不同位置，品牌副标题不一致，评测侧栏为 220px 且使用 9px 眉题，与 360px 生图侧栏形成割裂。
- v12 修复：新增共享顶部导航样式，使用左品牌 / 中切换 / 右状态的稳定三列结构；评测侧栏统一宽度、表面、字号和选中态，并让桌面面板填满可用视口。
- 修复后证据：同视口完整页、顶部和左面板三组对照，以及两档响应式、真实交互、滚动边界和控制台检查均通过。

final result: passed

---

# Benchmark Viewport-height Panels v11 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-0c0cc918-89bf-4925-b29e-c6d826527a82.png`
- Desktop implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-panel-height-1510x968.png`
- Compact desktop implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-panel-height-1280x720.png`
- Narrow implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-panel-height-720x900.png`
- State: Benchmark 已连接、样本集面板、9 个已录入样本；Codex 内置浏览器真实页面与真实滚轮验收。

## Findings

- 1510 × 968 桌面视口下，主外壳、步骤导航与当前内容面板均为 `y=88–952px`、高度 `864px`，完整填满顶栏以下的可用视口。
- 页面 `scrollHeight = clientHeight = 968px`、`scrollWidth = clientWidth = 1510px`，没有新增页面级纵向或横向溢出。
- 1280 × 720 紧凑桌面下，外壳与面板高度均为 `616px`；内容超过面板时由当前面板以 `overflow-y: auto` 承接，真实滚轮使面板 `scrollTop 0 → 19.5px`，页面保持 `scrollTop = 0`。
- 720 × 900 窄屏下，桌面定高规则不生效；步骤导航恢复横排，内容面板恢复自然高度，页面 `scrollWidth = clientWidth = 720px`。
- 真实点击“实验配置 → 样本集”双向切换后，两类活动面板都保持共同底边 `y=952px`；浏览器控制台无 error 或 warning。

final result: passed

---

# Benchmark White Button Language v10 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-f5bf78b7-bbbf-4ada-8b84-68d57250cc07.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/04/019fcd40-7306-7e20-b11e-4e2a35d10671/benchmark-buttons-after.png`
- Focused normalized comparison: `/Users/dai/.codex/visualizations/2026/08/04/019fcd40-7306-7e20-b11e-4e2a35d10671/benchmark-buttons-comparison.png`
- Source pixels: `448 × 169`
- Implementation pixels: `1280 × 720`；CSS viewport `1280 × 720`、devicePixelRatio `1`
- State: 桌面端、Benchmark 已连接、样本集面板、9 个已录入样本
- Normalization: 源图是生图工作台功能分段控件局部，比较图左侧保留源图、右侧并置评测页步骤选中态与样本集动作组；仅比较按钮表面、前景色、边框、阴影与层级，不对不同组件结构做逐像素判断。

## Full-view Comparison

- 评测页保持原有五步信息架构、暖灰画布、单层面板和紧凑密度，没有因按钮纠偏改变布局或业务流程。
- 原本黑底白字的步骤选中态与主动作改为白底黑字；同步、新建、重命名、删除及顶部工作台切换也使用同一中性表面。
- 按钮主次继续由位置、字重和文案表达，禁用态保留降透明度，危险动作不再默认铺黑。

## Focused Region Comparison

- 字体与排版：沿用 system-ui，按钮为 `12px / 500–600`，黑色文字与参考图的轻量中性选中态一致。
- 间距与布局：保留 `32px` 基线、`6px` 圆角和原有 padding；步骤导航增加透明占位边框，状态切换不产生位移。
- 色彩与令牌：所有动作按钮默认实测为 `rgb(255, 255, 255)` 背景、`rgb(25, 26, 28)` 前景和 `rgb(207, 204, 197)` 边框。
- 图片与资产：本轮没有新增或替换产品图片、图标、SVG 或装饰资产。
- 文案与内容：按钮文案与业务语义全部保持不变。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 白底黑字已经覆盖 quiet、primary、secondary、danger 四类动作及当前步骤选中态；表单、下拉、状态徽标等非按钮组件保持既有语义。
- 页面 `scrollWidth = clientWidth = 1280px`，没有新增横向溢出。

## Interaction Verification

- 真实点击“实验配置”后只有实验配置面板 active；再点击“样本集”后只有样本集面板 active，双向切换通过。
- 指针按压反馈、键盘焦点圈、禁用态规则保持；默认视觉不显示焦点圈，键盘/自动化聚焦时仍有可辨识轮廓。
- 浏览器控制台无 error 或 warning。

## Comparison History

- 初始 P1：当前步骤、保存样本、正式运行与 AI 评分等主动作使用黑底白字，与用户提供的生图工作台白底黑字按钮语言明显割裂。
- v10 修复：四类动作统一为白底黑字细边框；当前步骤改为白底黑字并以低阴影和边框表达选中；加入一致的轻量 hover，保留 press、focus-visible 与 disabled 状态。
- 修复后证据：同视口浏览器截图、源图/实现同输入对照、步骤双向点击、计算样式、控制台和横向溢出检查均通过。

## Follow-up Polish

- 无阻塞项；本轮不扩展到下拉菜单选项、状态徽标或模型候选卡，避免把“按钮纠偏”扩大成无关重设计。

final result: passed

---

# Style DNA Workbench v15 Design QA

## Evidence

- Flux2 Klein live API canary: `http://maas-workflow-app-50-prodtestzwapp50.k8s-zhongwei.qunhequnhe.com/`，17 个所需节点全部存在，Prompt ID `7c070726-1dbc-4d9c-86a3-24b32929f49d` 成功，端到端 26.9s、排队 0.14s、执行 23.5s，1.67MB 输入返回 2.84MB PNG
- Flux2 Klein UI verification: `http://127.0.0.1:4319`，真实浏览器选择自由生图并用指针完成 Seedream 5.0 → Flux2 Klein 双向切换；六项模型目录、`必填 · 1张`、单文件上传、`跟随原图 / 原图尺寸` 禁用态、PNG 输出与空态徽标同步更新，console 无 error/warning
- Seedream 4.5 live verification: `http://127.0.0.1:4318`，主工作区代码、当前本机 OneAPI Key、白模模式；下拉显示五个最终出图模型并可选择 Seedream 4.5，参数联动为 8 种比例、2K / 4K、PNG，结果徽标为 `Seedream 4.5 · 2304 × 1728`，浏览器控制台无 error 或 warning
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

- Flux2 Klein 沿用现有模型下拉，不新增独立卡片或第二套连接中心；选择后只收紧参考图与尺寸能力，右侧结果结构、顶部连接状态和其他模式布局不变。
- 新增 Seedream 4.5 后沿用现有自定义模型下拉与参数区，不新增卡片或入口；实测从默认 Seedream 5.0 切换到 Seedream 4.5 后，模型说明、可选数量、比例、分辨率、格式与结果徽标同步更新，工作区结构和白模状态未改变。
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
- 第二十三轮修复后证据：105/105 自动化测试通过；独立 4273 端口真实页面显示 10 个融合基模选项，可选择 `Doubao Seed 2.0 Lite` 并同步显示图片输入能力说明，控制台零 error/warn；当前已保存 Key 的真实模型目录包含请求别名且可用性检查返回 `available/selectable=true`；飞书“Prompt融合”单选字段已保留原 8 个选项并追加 `Doubao Seed 2.0 Lite`，字段读回与连接状态均正常。未执行真实模型生成，未把未发生的计费调用记为完成证据。

## Follow-up Polish

- 暂无阻塞项；重新连接 API Key 后即可按“首轮传附件 → 后续纯文字续改”的真实路径验收。

final result: passed

---

# Benchmark Direct AI Review v12 Design QA

## Evidence

- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/04/benchmark-review-direct/benchmark-review-direct-viewport.jpg`
- Browser viewport: `877 × 837`；`scrollWidth = clientWidth = 877px`
- Live review source: Benchmark Base 成功结果目录；当前样本集命中 `EXP-20260804T081921Z-5ECA` 的 12 张结果

## Findings

- AI 评分不再复用实验配置页持续生成的新草稿 ID，而是从当前样本集已有成功结果中选择评分实验；默认项是最近完成实验。
- 表单明确显示“12 张成功结果可评分 / 12 张已有评分 / 评分不会重新出图”，已完成评分时主按钮使用“重新评分”而不是误导性的首次评分文案。
- 评分实验、评分模型、评审批次和三维协议保持单一纵向节奏；任务进度卡按任务类型归入 AI 评分页，不再跳回批量运行。

## Interaction Verification

- 点击“AI 评分”后面板保持 active，已完成实验 `EXP-20260804T081921Z-5ECA` 自动选中；未点击真实评分按钮，避免重复模型调用。
- 任务归属纯函数覆盖 `review → AI 评分`、`generation → 批量运行`；当前样本集没有成功结果时，服务端在保存空评审批次和调用模型前阻断。
- 服务重启后 `/api/setup/status` 报告 `ready=true`、`lark-cli 1.0.77`、Benchmark Base 可读；浏览器控制台无 error 或 warning。
- `npm test` 通过：129 tests，0 fail；前端与服务端模块语法检查、`git diff --check` 通过。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Sample Category Source v23 Design QA

## Evidence

- Current-flow baseline: `/Users/dai/Work_qunhe/Interior Design/PRD-Outputs/sample-flow-audit/01-current-sample-flow.jpg`
- Updated classified-batch flow: `/Users/dai/Work_qunhe/Interior Design/PRD-Outputs/sample-flow-audit/02-updated-sample-flow.jpg`
- Unclassified AI flow: `/Users/dai/Work_qunhe/Interior Design/PRD-Outputs/sample-flow-audit/03-unclassified-ai-mode.jpg`
- Combined before/after comparison: `/Users/dai/Work_qunhe/Interior Design/PRD-Outputs/sample-flow-audit/04-before-after-comparison.jpg`
- State: 4187 本地真实服务、Benchmark 已连接、当前样本集 9 条；没有上传图片、调用标签模型或写入 Base。

## Findings

- [Resolved P1] 原流程把 AI 模型放在第一位，并在返回时直接覆盖“类别默认值”，错误假设所有素材都是未分类原图。
- [Resolved P1] 添加样本现在先声明空间类型来源，默认“已分好类，沿用本批设置”；本批空间类型成为人工事实，AI 只补五维。
- [Resolved P1] “未分类，由 AI 识别”是独立显式路径；切换后隐藏无效的批次空间类型，并说明 AI 将完成“分类 + 五维”。
- [Resolved P2] AI 模型降为从属配置，准入与来源并排，沿用既有 38px 控件、暖灰面板、低圆角和双栏密度，没有增加卡片层级。
- 逐图状态区分“AI 五维”和“AI 分类 + 五维”；人工修改空间类型不进入五维模型元数据清空范围。

## Interaction Verification

- 真实指针交互完成“已分好类 → 未分类 AI → 已分好类”的往返切换；本批空间类型显示/隐藏和作用域说明同步变化。
- 真实指针把本批空间类型改为“卧室”，说明同步为“空间类型固定为‘卧室’”，没有触发模型调用或 Base 写入。
- 合并截图确认原有导航、样本表密度、左右轨道与视觉令牌未漂移；改动仅重排添加样本内的决策顺序。
- Browser console warnings/errors: `0`。
- Automated verification: `208` tests pass；`git diff --check`、两个浏览器模块语法检查通过。

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark AI 评分说明卡收敛 v25 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-8b298b11-1793-4e87-be2a-2b2c705eb017.png`
- Desktop implementation: `/Users/dai/.codex/visualizations/2026/08/06/benchmark-review-compact/benchmark-review-compact-1480x900.png`
- Narrow implementation: `/Users/dai/.codex/visualizations/2026/08/06/benchmark-review-compact/benchmark-review-compact-390x844-viewport.png`
- Focused normalized comparison: `/Users/dai/.codex/visualizations/2026/08/06/benchmark-review-compact/benchmark-review-before-after.png`
- Source pixels: `1480 × 589`; desktop implementation pixels and CSS viewport: `1480 × 900` at `devicePixelRatio=1`; narrow implementation pixels and CSS viewport: `390 × 844` at `devicePixelRatio=1`.
- Normalization: focused comparison uses equal-width `1408 × 439` AI 评分 panel crops stacked vertically; the source crop shows the crossed-out protocol card, while the implementation crop shows the same configuration/result boundary after removal.
- State: isolated service on `127.0.0.1:4186`, live Benchmark Base selected `MODEL-COMPARE-001` with 81 results; no real AI scoring request was submitted.

## Full-view Comparison

- [Resolved P1] The static protocol card occupied the majority of the scoring configuration row without supporting any action. It is removed from the DOM, and its unused base/responsive CSS is removed with it.
- [Resolved P2] The former narrow vertical form is replaced by one full-width horizontal action band on desktop. Experiment, model, batch ID and the primary action now share one line; the three dimensions remain as small secondary labels below.
- The scoring-result section and its six summary metrics remain unchanged in hierarchy and begin immediately after the compact configuration band.
- Desktop form height is `159.5px` across `1406px`, the review grid resolves to one column, and both body and active panel horizontal overflow are `0`.

## Required Fidelity Surfaces

- Fonts and typography: existing Inter/system and monospace ID/metric families, weights and line heights are unchanged; no new wrapping appears at desktop width.
- Spacing and layout rhythm: the protocol half-column and divider are gone; control heights remain `38px`, panel padding remains `20px`, and the desktop configuration/result boundary moves up to `y=403px`.
- Colors and visual tokens: all controls continue to use the existing warm-neutral panel, border, ink, muted and disabled tokens; no new color or elevation language was introduced.
- Image quality and asset fidelity: this control-only change adds or replaces no visible image, logo, illustration or icon asset.
- Copy and content: redundant protocol prose is removed; action labels, experiment status, three score dimensions and result semantics remain visible.

## Interaction Verification

- Real pointer navigation `AI 评分 → 数据分析 → AI 评分` returned to exactly one active review panel.
- The live experiment remained selected, the score action was enabled, and `.protocol-card` count was `0`.
- At `390 × 844`, the form becomes one column, experiment details become a stacked action group, and body/panel horizontal overflow remain `0`.
- Browser console warnings/errors: `0`; automated verification: Canvas Lab `203/203`; `git diff --check` passes.

## Comparison History

- Initial P1: a non-interactive protocol explanation consumed roughly 64% of the top scoring area and forced the real controls into a narrow vertical column.
- v25 fix: remove the card and dead styles, promote the controls to a responsive full-width action band, then compare the same AI 评分 region at equal width.
- Post-fix evidence: the desktop and focused comparison show the reclaimed space, while desktop, 720px and 390px browser checks show no horizontal overflow or console error.

## Follow-up Polish

- No remaining P0, P1, P2 or P3 visual finding in the requested region.

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark seven_evaluate_v3.1 单次评分修正 v24 Design QA

## Evidence

- Updated rule source: `/Users/dai/Work_qunhe/seven_evaluate_v3_source`
- Browser implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fd175-0e09-7002-9fbb-a4f1629958c3/benchmark-review-v3.1-single-pass.png`
- State: isolated service on `127.0.0.1:4186`, Benchmark `AI 评分`; no OneAPI key or Benchmark Base token, so no real scoring request was submitted.

## Findings

- [Resolved P1] The updated source requires one normal VLM request per candidate. Eligibility and all three dimensions now share one strict JSON response; a second request occurs only when the first response violates the JSON contract and needs one repair retry.
- [Resolved P1] Dimension evidence is isolated: consistency compares source and generated images; style/material uses the generated image as primary evidence; rendering quality uses only the generated image. The same defect is not deducted across dimensions without independent evidence.
- [Resolved P1] The internal protocol is now `white-model-review@v3.1-single-pass`, keeping results produced by the earlier two-stage implementation out of the current aggregate.
- Existing local severity calibration, `40% / 30% / 30%` weighting and `>= 3.0` availability threshold remain unchanged.

## Interaction Verification

- Real pointer navigation activated `AI 评分`; `reviewActive=1`, the protocol card displayed `seven_evaluate_v3.1 · 单次评测`, and the result eyebrow displayed `正式三维 · 单次严评`.
- Body and panel horizontal overflow: `0`; browser console/page/HTTP errors: `0`.
- Automated verification: Canvas Lab `196/196`; updated source-rule project `24/24`; syntax checks and `git diff --check` pass.

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark seven_evaluate_v3.1 评分接入 v23 Design QA

## Evidence

- User source: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-b646ee30-7fc2-4027-8f60-b4f59df574fc.png`
- Browser implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fd175-0e09-7002-9fbb-a4f1629958c3/benchmark-review-v3.1-verified.png`
- State: isolated service on `127.0.0.1:4186`, Benchmark `AI 评分`; no OneAPI key or Benchmark Base token and no real scoring action. One synthetic v3.1 result row was injected only after load to verify the completed-result layout.

## Findings

- [Resolved P1] The former protocol card incorrectly required all three dimensions to be at least 3. The page now states the governing local rule: `40% / 30% / 30%` weighted score `>= 3.0`.
- [Resolved P1] The one-call generic rubric is replaced by an explicit two-stage contract: white-model eligibility/consistency first, style-material/rendering quality second.
- [Resolved P1] Completed results now expose the weighted score and structured severity issue; local calibration is visible without replacing the three retained dimension scores.
- Six summary cards stay aligned on desktop. The nine-column result table remains inside its own scroll container on narrow screens instead of widening the page.

## Interaction Verification

- Real pointer navigation activated `AI 评分`; `reviewActive=1` and the protocol card contained `seven_evaluate_v3.1` and `三维加权分 ≥ 3.0`.
- Desktop `1365px`: six summary cards, nine table headers, body/panel horizontal overflow `0`.
- Mobile `390px`: body horizontal overflow `0`; the wide detail table scrolls internally by `506px` as designed.
- Browser console warnings/errors: `0`; HTTP responses `>=400`: `0` after adding the page-local empty favicon.
- Automated verification: Canvas Lab `195/195`; source-rule project `21/21`; `git diff --check` passes.

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

# Benchmark Generic Experiment Factor v20 Design QA

## Evidence

- User correction: every quality configuration can become a later A/B test point, not only Prompt and image model.
- Browser implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-generic-factor/ratio-factor-compact.jpg`
- State: Benchmark `实验配置`, service connected, `输出比例` selected as the factor; existing model template loaded.

## Findings

- [Resolved P1] The prior two-item switch still encoded product policy in UI branches. The page now exposes one `对比维度` selector backed by an eight-item registry: Style DNA, Prompt version, fusion model, image model, ratio, resolution, format and quality.
- Selecting a factor hides only its matching fixed field and moves its available values into the candidate area; all remaining fields stay visible as controls. At runtime, prompt-stage factors isolate Prompt generation while image-stage factors reuse the same frozen Prompt.
- Candidate values remain a compact three-column grid with `48px` minimum row height. The nine ratio values occupy `3 × 3` rows without horizontal overflow; the fixed-parameter grid reflows after any field is removed.
- Prompt batches and images per candidate remain outside the factor registry because they define sample size rather than image quality.

## Interaction Verification

- Real browser selection changed `出图模型 → 输出比例 → 融合基模`; the hidden field IDs were respectively `experimentFixedImageModelField`, `experimentRatioField` and `experimentFusionModelField`.
- Fusion-model plan generation succeeded in read-only mode with `9 Cases / 9 Prompt batches / 36 Runs`; the page reported `计划已生成`. Formal execution was not started, so no model generation or Base write occurred.
- Browser measurements report no horizontal overflow; console log collection is empty.
- `npm test`: `191` tests, `0` failures. Coverage includes all eight factor normalizations plus image-stage Prompt sharing and separate comparison rows.

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Single Plan Action v18 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-b26200d9-41bd-4e01-8103-a6f274086934.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-plan-action/single-generate-plan-button.jpg`
- State: Benchmark `实验配置` panel, service connected, configuration loaded, before plan generation.

## Findings

- [Resolved P1] “生成只读预演”和“尚未生成实验计划”把同一动作拆成两个概念及两个视觉对象，制造了并不存在的中间步骤。
- 实验配置底部现在只保留一个“生成实验计划”按钮；辅助说明和重复空计划卡已删除。
- 状态语义统一为“等待计划 / 计划已生成”，固定参数明确在正式运行时冻结；只读安全边界保留在运行逻辑和操作文档中，不再占用主界面层级。

## Interaction Verification

- 真实浏览器测得实验配置动作区按钮数为 `1`、文本仅为“生成实验计划”，DOM 中不存在 `planResult`，页面无可见错误。
- 点击按钮后直接进入“批量运行”，状态显示“计划已生成”，计划为 `9 Cases / 9 Prompt 批次 / 108 Run`，“确认并开始”可用；本次验收未点击正式运行，因此没有调用出图模型或写入 Base。
- 单实例服务运行于 `127.0.0.1:4173`；`npm test` 通过：`184` tests，`0` fail；`git diff --check` 通过。

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---


# Benchmark Experiment ID & Failure Guidance v12 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-d6464d6d-6592-4aea-a061-436106f06c0a.png`
- Browser-rendered failure card: `/Users/dai/.codex/visualizations/2026/08/04/benchmark-experiment-id-error-ui/benchmark-failure-guidance-v2.jpg`
- Browser-rendered experiment ID control: `/Users/dai/.codex/visualizations/2026/08/04/benchmark-experiment-id-error-ui/benchmark-generated-experiment-id.png`
- Normalized before/after comparison: `/Users/dai/.codex/visualizations/2026/08/04/benchmark-experiment-id-error-ui/benchmark-failure-before-after-default.png`
- Source pixels: `1615 × 330`，用户截取的冻结配置失败卡片
- Implementation failure pixels: `803 × 317`；CSS 视口 `877 × 837`、devicePixelRatio `1`
- Experiment ID control pixels: `803 × 190`；同一 CSS 视口
- Normalization: 将实现卡片按源图宽度等比放大后纵向并置；源图为旧版局部裁切，不据此比较页面整体宽度，只比较错误信息层级、间距、色彩和可读性
- State: 桌面端、历史 `config-write` 失败、`CFG-EE85E8007EA1` 冻结配置冲突、`0 / 12`

## Full-view Comparison

- 旧版把原始配置错误做成整行红色主内容，用户只能看到“失败”，无法知道是否已调用模型以及下一步怎么处理。
- 新版在同一任务卡片内建立“发生了什么 → 本次影响 → 下一步 → 技术详情”的阅读顺序；标题、阶段、终态和 Base 状态仍保留原位置，没有引入新的外层卡片。
- 新增实验 ID 控件与模板选择器、最多 Case 数共用同一三列网格和 `38px` 控件基线；ID 只读，辅助说明与“换一个”动作不覆盖输入内容。

## Focused Region Comparison

- 字体与排版：延续 system-ui 与等宽任务/实验 ID 字体；业务解释使用 `13px` 标题和次级正文，技术错误降为折叠后的 `10px` 等宽文本。
- 间距与布局：解释区使用 `14–16px` 内边距和单一道分隔线；动作保持右对齐，`877px` 视口下卡片宽 `803px`，页面 `scrollWidth = clientWidth = 877px`。
- 色彩与令牌：继续复用暖灰面板、`--line`、`--muted` 与 `--danger`；危险色只用于标签、边框和技术详情，不再形成抢占主层级的整条高饱和错误带。
- 图片与资产：本轮没有新增图片、图标、SVG 或装饰资产，不存在占位图、字符图标或清晰度退化。
- 文案与内容：明确“模型没有被调用，也没有产生结果图”；配置阶段冲突提供“生成新实验 ID”，出图阶段失败则提示保留 ID 断点续跑，避免给出相反操作。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 新版卡片相较源图高度增加是承载业务影响和恢复动作的有意变化；分区边界清晰，技术详情默认折叠，没有恢复成多层套卡或拥挤警报。
- 实验 ID 使用秒级时间戳加四位随机后缀，减少同一分钟内重复；模板载入不改写 ID，预演与正式运行仍共用一个稳定实验边界。

## Interaction Verification

- 页面初始化生成 `EXP-YYYYMMDDTHHMMSSZ-XXXX`；实测点击“换一个”由 `EXP-20260804T075614Z-F1A7` 更新为 `EXP-20260804T075635Z-4517`。
- 失败卡片“生成新实验 ID”实测切回实验配置，并生成 `EXP-20260804T080049Z-81AA`；不会覆盖历史实验。
- “查看技术详情”默认关闭，点击后精确显示 `CFG-EE85E8007EA1 已存在但冻结参数不同`。
- 实时 Base 快照与当前草稿复核后，`CFG-EE85E8007EA1` 的稳定配置一致性结果为 `true`；展示名称和隐含默认 `medium` 不再造成假冲突。
- `npm test` 通过：125 tests，0 fail；浏览器控制台无 error 或 warning，页面无横向溢出。

## Comparison History

- 初始 P1：展示名称漂移被当成冻结参数差异，触发假冲突；前端只显示原始错误，没有解释影响或恢复路径。
- v12 修复：一致性校验改为稳定编码、数值和规范化输出规格；失败卡片新增业务解释、阶段化恢复动作与折叠技术详情；实验 ID 改为系统生成并提供轻量换新入口。
- 修复后证据：自动化测试、真实 Base 只读等价校验、浏览器 ID 换新/失败恢复/技术详情交互、同屏前后视觉比较和控制台检查全部通过。

## Follow-up Polish

- 无阻塞项；进入出图阶段后的失败继续保留原实验 ID，不自动换新，以维护 Base 断点续跑语义。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

# Benchmark Dataset UI v6 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-8a2c2fdc-54d4-4461-bf88-6d449f8ca75a.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-ui-final.png`
- Normalized full-view comparison: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-ui-comparison.png`
- Source pixels: `2196 × 1474`，对应 `1098 × 737` CSS 视口、devicePixelRatio 2
- Implementation pixels: `1098 × 737`，CSS 视口 `1098 × 737`、devicePixelRatio 1
- Normalization: 源图以高质量插值缩小到 `1098 × 737`，与实现同状态并排；只消除像素密度差异，不裁切页面内容
- State: 桌面端、`000` 空样本集、Benchmark 已连接、Gemini 3.5 Flash 已选

## Full-view Comparison

- 左侧流程导航与右侧工作面板从同一 `y=88px` 起始，并在 `y=713px` 共享底边；此前导航被 sticky top 额外下推且只包裹自身内容。
- 添加样本与样本表格从同一 `y=251.5px` 起始，均在 `y=712px` 结束；Grid 子面板高度差为 `0px`。
- AI 模型选择器改为 38px，与其余输入控件统一；API 状态进入下一级辅助行，与选择器垂直间距 8px，不再覆盖模型说明或穿入右侧数据区。
- 样本集工具栏、表头、表单标题与导航步骤沿用原有暖灰、近黑、6/12px 圆角和 8px 基础节奏，没有引入新的卡片层级。

## Focused Region Comparison

- 原图中模型选择器的内容宽度越过自身 Grid 轨道，API 胶囊和“管理 API”压在触发器上，并继续侵入右栏表格；修复后选择器宽 `260px`、辅助状态宽 `260px`，分别占据两行，重叠量为 `0px`。
- 自定义选择器根节点、主值与辅助说明均允许收缩；主值和说明只在自身轨道内省略，chevron 固定 14px，不被长模型说明挤压。
- `1024px` 临界桌面下，数据区由硬编码 `480px` 下限改为可收缩轨道，页面 `scrollWidth = clientWidth = 1024px`，右侧表格不再被面板裁切。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 字体与排版：保持 Inter/system-ui 与技术编号等宽字体；标题、标签、辅助状态层级未发生异常换行。
- 间距与布局：导航/工作面板、录入/表格均严格等高；模型控件与 API 辅助状态形成 8px 次级间距，全部表单控件统一 38px 基线。
- 色彩与令牌：继续复用 `--bg`、`--panel`、`--panel-soft`、`--line`、`--ink` 与 `--quiet`；状态仍只用近黑与中性色。
- 图片与图标：页面没有新增图片资产；既有品牌图标与 chevron 保持原实现，没有用字符或 CSS 图形替代产品资产。
- 文案与内容：所有既有产品文案、样本数据和空态内容保持不变；长模型说明通过局部截断保留完整可访问名称。

## Interaction Verification

- 模型下拉可打开，8 个候选完整呈现；`aria-expanded` 在打开/关闭间正确切换，Escape 关闭后菜单恢复隐藏。
- “实验配置 → 样本集”双向导航切换后，active step 与 active panel 始终一致。
- `640 / 720 / 1000 / 1024 / 1098 / 1280px` 视口均无横向页面溢出；`1000px` 以下自然切换为单栏内容区。
- `1098 × 737` 同状态实测模型/API 重叠量、导航顶线差、导航底线差、录入/表格顶线差和底线差均为 `0px`。
- `npm test` 通过：110 tests，0 fail；浏览器控制台无 error 或 warning。

## Comparison History

- 初始 P1：自定义选择器由内容撑宽到超过 Grid 轨道，覆盖 API 状态并侵入样本表格。
- 初始 P2：自定义选择器 36px、普通输入 38px，控制基线不一致；sticky top 让导航相对工作面板下移，导航与主面板底边断开。
- 补充 P2：`1024px` 附近 `300px + 480px` 的硬最小列宽超过可用面板宽度，右栏被 `overflow: hidden` 裁切。
- 修复：约束 Grid 子项和选择器的最小宽度；把 API 状态放到辅助行；统一 38px 控件高度；导航参与主 Grid 拉伸；右栏改为可收缩轨道并保留表格内部滚动。
- 修复后证据：同状态全屏对照、六档响应式测量、下拉与步骤导航交互、自动化测试及控制台检查全部通过。

## Follow-up Polish

- 无阻塞项；后续若增加更长的模型名称，继续沿用“主值局部省略 + 完整 aria-label”的同一规则即可。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

# Benchmark Dataset UI v7 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-b5b3954a-3616-4c8d-a3da-83b3f6f905aa.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-api-row-removed.png`
- Focused before/after comparison: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-api-row-comparison.png`
- Source pixels: `1316 × 368`，用户截取的模型/API/默认值局部区域
- Implementation pixels: `877 × 837`，CSS 视口 `877 × 837`、浏览器报告 devicePixelRatio 2
- Normalization: 实现从同一区域裁取 `843 × 175`，等比放大到 `1316 × 273` 后与源图纵向并置；只判断信息层级、遮挡和垂直节奏，不据此比较字体像素锐度
- State: 桌面窄视口、Benchmark 已连接、Gemini 3.5 Flash 已选、9 个样本

## Full-view Comparison

- 模型区不再重复全局连接信息；`API 已连接`、`管理 API` 及其容器均从 DOM 删除，而不是通过 CSS 隐藏。
- AI 打标模型后直接进入“类别默认值 / 类型默认值”，删除了无业务输入价值的中间状态行。
- 页面其余样本集工具栏、双栏/单栏断点、表格、上传区和保存动作保持不变。

## Focused Region Comparison

- 修复前：38px 模型选择器后插入独立 API 胶囊与管理链接，状态重复且占据一整层垂直节奏，在窄表单里形成明显拥挤。
- 修复后：模型选择器底边为 `y=443.5px`，默认值控件从 `y=480px` 开始，间距 `36.5px` 完整承载下一组字段标签，不再有漂浮状态或操作链接。
- DOM 实测 `#labelApiStatus`、`#labelApiLink`、`.sample-api-state` 数量均为 `0`。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 字体与排版：保留原有 Inter/system-ui、标签权重和模型辅助说明；删除状态行后没有异常换行。
- 间距与布局：模型控件与下一组标签恢复统一表单节奏；没有残留空高度、负 margin 或占位节点。
- 色彩与令牌：删除了局部第二个近黑胶囊，近黑连接状态只在顶部全局层出现。
- 图片与图标：本轮没有新增或替换任何图片、品牌资产或图标。
- 文案与内容：移除重复的“API 已连接 / 管理 API”；API 未连接和无可用模型仍由模型下拉占位文案明确表达。

## Interaction Verification

- AI 打标模型下拉仍可打开并显示 8 个可用候选；Escape 可关闭，`aria-expanded` 正确恢复为 false。
- API 状态 DOM 删除后，模型目录、默认 Gemini 3.5 Flash、样本数据和禁用逻辑均正常。
- `npm test` 通过：110 tests，0 fail；浏览器控制台无 error 或 warning。

## Comparison History

- 初始 P2：模型配置区重复呈现全局 API 连接状态和管理入口，形成额外视觉层并挤压默认值字段。
- 修复：删除对应 HTML、CSS 与控制器写入逻辑，保留模型下拉自身的连接/可用性占位语义；同步提升静态资源版本。
- 修复后证据：同屏局部对照、DOM 数量检查、下拉交互、自动化测试及控制台检查全部通过。

## Follow-up Polish

- 无阻塞项；连接管理继续由全局连接中心统一承载，不再向局部模型区复制状态。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Topbar Sync UI v8 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-c2f9f47a-7e9a-4ad0-87a6-5a4501cbaf52.png`
- Source pixels: `1032 × 210`，顶部操作区局部截图
- Browser-rendered implementation: 当前 Codex Desktop 会话未暴露 in-app Browser 控制接口，无法生成修复后截图
- State: Benchmark 已连接、顶部操作区显示“刷新 / Benchmark 已连接 / 生图工作台”

## Findings

- [P2] 顶栏“刷新”使用与页面跳转相同的 32px 描边按钮语法，和连接状态在同一层抢占横向空间；局部截图中三个动作形成连续高密度控件带。
- Fix applied: 从顶栏完整移除“刷新”，顶栏只保留全局连接状态与工作台切换；将动作改名为“同步”并移动到样本集标题行，使用 24px 无边框轻量文字按钮与原位“同步中”反馈。
- Typography: “同步”使用 10px 次级操作字号，不与 11px 状态及 12px 工作台跳转竞争。
- Spacing/layout: 顶栏由三项收敛为两项；样本集标题行以 14px 间距组织“同步”和样本计数。
- Colors/tokens: 继续复用 `--quiet`、`--panel-soft`、`--ink`，没有新增颜色或表面层级。
- Image quality/assets: 本轮没有新增图片或图标资产。
- Copy/content: “刷新”改为更符合远端数据语义的“同步”，执行态为“同步中”。

## Interaction Verification

- 静态资源版本已提升；`refreshOverview()` 在请求期间禁用按钮并在成功/失败后恢复“同步”。
- 自动化测试与语法检查可验证行为代码，但不能替代浏览器视觉与控制台验收。

## Comparison History

- 初始 P2：顶栏大号描边刷新按钮造成拥挤并破坏全局操作层级。
- 第一轮修复：移除顶栏按钮，将同步降级到样本集标题行。
- Post-fix evidence: 缺少修复后浏览器截图，无法完成同视口并排比较。

## Follow-up Polish

- 需要刷新后的同区域截图，才能确认顶栏剩余两项的真实间距、裁切、字号和响应式表现。

final result: blocked

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Dataset Sync Group v9 Design QA

## Evidence

- Annotated visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-1aa619c6-f0a3-4c04-a783-576799f003a5.png`
- Source pixels: `1684 × 358`，样本集标题与管理工具栏局部截图
- Browser-rendered implementation: 当前 Codex Desktop 会话未暴露 in-app Browser 控制接口，无法生成移动后的截图
- State: `0` 个样本、同步位于标题计数旁、工具栏含“新建 / 重命名 / 删除”

## Findings

- [P2] “同步”虽然已从全局顶栏移除，但落在样本计数旁形成孤立次级动作；它管理的是当前样本集数据，应与新建、重命名和删除共同构成一个动作组。
- Fix applied: 将“同步”移动到 `.dataset-actions` 首位，与其余三个动作共用 `quiet-button` 的 38px 高度、6px 间距、描边、圆角和交互状态；标题行恢复只显示样本计数。
- Typography: 四个动作统一 12px，标题和计数层级恢复纯信息表达。
- Spacing/layout: 桌面端四项保持同一 flex 行；680px 以下改为四等分 Grid，避免第三项加孤行。
- Colors/tokens: 四项全部复用既有中性描边按钮令牌，没有新增强调色。
- Image quality/assets: 本轮没有新增图片或图标资产。
- Copy/content: 保留“同步 / 新建 / 重命名 / 删除”，只调整归属与排列。

## Interaction Verification

- 静态 HTML 实测管理动作顺序为“同步 / 新建 / 重命名 / 删除”，顶栏和标题行均不再包含同步按钮。
- 112 项自动化测试通过；`refreshOverview()` 的“同步中”与禁用态保持不变。
- 缺少浏览器渲染截图与控制台检查，不能据静态 DOM 宣称视觉验收通过。

## Comparison History

- v8 初始修复：同步从顶栏降级到样本标题行。
- v9 用户纠偏：同步应与样本集 CRUD 动作成组，而不是成为标题旁孤立操作。
- v9 修复：并入 `.dataset-actions` 首位，并补齐窄屏四列规则。
- Post-fix evidence: 缺少移动后的浏览器截图。

## Follow-up Polish

- 需要刷新后的同区域截图，确认四项按钮实际宽度、基线和工具栏剩余空间。

final result: blocked

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Experiment Config UI v10 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-b3be527f-34a6-475a-ae23-806a38c23b5d.png`
- Browser-rendered implementation: `/tmp/benchmark-experiment-config-v10.png`
- Normalized full-view comparison: `/tmp/benchmark-experiment-config-compare.png`
- Source pixels: `2128 × 1302`；用户截图展示缺少可编辑参数的桌面实验配置页
- Implementation pixels: `867 × 1261`；CSS 视口 `867 × 837`、devicePixelRatio 2
- Comparison pixels: `2126 × 900`；两图等高并排，只比较信息架构、层级和密度，不做不同视口下的逐像素判断
- State: Benchmark 已连接、`000` 样本集、奶油法式 v4、白模渲染融合 Agent v7、Gemini 3.1 Pro、3 个可执行出图模型

## Full-view Comparison

- 原页只有实验 ID、横评组、最多 Case 数与模型卡，无法在前端控制实际生成参数；实现补齐 Style DNA、融合 Agent、融合基模、比例、分辨率、格式、质量档、Prompt 批次和每批出图数。
- 配置区明确分成“实验元信息 / 固定参数 / 候选出图模型 / 只读预演”四层，并以“唯一变量：出图模型”锁定横评边界。
- 867px 窄桌面下导航自然转为顶部五步栏，表单保持两列，候选模型保持 `2 × 2` 网格；页面 `scrollWidth = clientWidth = 867px`，无横向溢出。
- Banana Pro 因当前横评表缺少对应图片列而保留为禁用态，并直接显示原因；其余三模型默认选中。

## Focused Region Comparison

- 模型选择会实时收敛跨模型公共参数：取消 Seedream 5.0 后分辨率恢复 `1K / 2K / 4K`，重新选择后收敛为 `2K / 4K`。
- 禁用模型卡需要额外一行原因，初版使第一行高度 `67px`、第二行 `56px`；最终统一四张卡为 `67px`，两行基线和底边完全一致。
- 所有输入继续复用现有自定义选择器、暖灰表面、6px 圆角和近黑选中态，没有引入新的视觉语言。

## Findings

- 无剩余 P0、P1 或 P2 视觉与可用性问题。
- 字体与排版：标题、标签、辅助说明和模型原因形成四级层次；长值只在各自选择器内省略。
- 间距与布局：固定参数采用 10px 网格间距，分区使用 20px 层级间距；四张模型卡最终等高。
- 色彩与令牌：继续复用 `--panel-soft`、`--line`、`--ink` 与 `--muted`；禁用态只降透明度，不新增警告色。
- 图片与图标：本轮没有新增图片资产；既有品牌图标、勾选状态和 chevron 保持不变。
- 文案与内容：预演明确说明“不调用模型、不写入 Base”；真实运行入口明确说明会调用 OneAPI 并写入 Benchmark Base。

## Interaction Verification

- 只读预演以 `1 Case × 1 Prompt 批次 × 3 模型 × 4 张`生成 `12` 个计划任务，可断点跳过 `0`。
- 预演前后 `/api/benchmark/overview` 的配置记录数均为 `3`，证明预演没有创建 Base 生成配置。
- 正式运行前会再次检查协议漂移、OneAPI 模型可用性和横评表图片列；未点击“确认并开始”，没有触发真实模型调用。
- 浏览器控制台 `error / warning` 均为 `0`；最终页面无横向溢出。
- `npm test` 通过：117 tests，0 fail；前端模块语法检查通过。

## Comparison History

- 初始产品缺口：实验配置只能选历史横评组，无法像生图工作台一样配置真实生成参数。
- 第一轮实现：新增可编辑实验草稿、资源目录复用、跨模型参数交集、稳定配置 ID、只读预演和正式运行时冻结。
- 视觉复核问题：Banana Pro 的不可用原因使四张模型卡高度不一致。
- 最终修复：实验卡片统一 67px 最小高度并提升静态资源版本；截图、联动、预演、零写入和控制台回归全部通过。

## Follow-up Polish

- 无阻塞项；若要启用 Banana Pro，只需在横评表新增其图片附件列，页面会在下次同步后自动解除禁用。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Task Failure UI v11 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-c2c87214-fafa-4286-9598-a7925e1655d9.png`
- Browser-rendered implementation: `/tmp/benchmark-task-failure-v11.png`
- Normalized comparison: `/tmp/benchmark-task-failure-comparison-v11.png`
- Source pixels: `1674 × 1234`；原任务卡只有“任务失败 / failed”和一条无含义进度线
- Implementation pixels: `867 × 837`；CSS 视口 `867 × 837`
- Comparison pixels: `2018 × 837`；左侧原图等高缩放，右侧为浏览器实渲结果

## Findings

- 任务状态拆成“冻结生成配置失败 / 冻结生成配置 / 失败”三个互补层级，不再重复同一个英文终态。
- 原始错误独占浅红详情区，Base 落库状态和任务 ID 位于次级元信息行，错误可诊断但不压过页面主层级。
- 失败卡高度 `158px`、宽度 `793px`，与上方执行卡共用内容起止线；页面 `scrollWidth = clientWidth = 867px`，无横向溢出。
- 批量确认文案明确：冻结配置、Prompt、逐 Run、结果图与错误持续写入 Benchmark Base，本地只保留任务状态。
- 运行状态样式已从基础样式拆成独立 `benchmark-run.css`，基础和浏览器控制器均保持低于 800 行。

## Interaction Verification

- 后台任务公开 `preflight / config-write / generation / review` 阶段、`persisted` 落库标记、起止时间和具体错误；浏览器刷新后优先恢复活动任务，任务注册表过期后回退到本地实验终态。
- 冻结生成配置写入失败会持久化 `phase=\"config-write\"`，且测试证明不会继续调用出图模型。
- 服务重启后 `/api/setup/status` 报告 `ready=true`、`lark-cli 1.0.77`、Benchmark Base 可读；未触发真实模型调用或飞书写入。
- `npm test` 通过：121 tests，0 fail；前端与服务端模块语法检查、`git diff --check` 通过；浏览器控制台无 error 或 warning。

## Comparison History

- v10：失败只暴露通用终态，用户无法判断失败发生在哪一段、是否已经写入 Base，也看不到原始错误。
- v11：增加阶段化失败、Base 落库状态、错误上下文、任务恢复和固定 CLI 运行时保护。

## Follow-up Polish

- 当前不创建独立飞书“任务编排”表；生成业务数据以既有五张 Benchmark Base 主表为真源，实验任务状态与 AI 评分版本继续由当前 worktree 本地保存。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Score Results v13 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-1281b08d-e045-498e-8561-2a5cad417b57.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/04/benchmark-score-results/benchmark-score-results-v13-final3.jpg`
- Focused normalized comparison: `/Users/dai/.codex/visualizations/2026/08/04/benchmark-score-results/benchmark-score-results-focused-comparison-final.jpg`
- Source pixels: `1738 × 1470`，按宽度归一化为 `877 × 742`；源截图从步骤导航起始，不包含全局顶栏
- Implementation pixels: `877 × 837`；CSS 视口 `877 × 837`，`devicePixelRatio = 2`，截图按 CSS 像素输出
- State: 当前样本集 `000`、实验 `EXP-20260804T081921Z-5ECA`、最新评审批次 `REVIEW-20260804T0756`

## Findings

- 源界面只显示“12 张已有评分”，没有任何数值、结论或原因，核心任务无法闭环；实现新增五项摘要和 12 条逐 Run 最新评分结果。
- 评分摘要紧接主操作，显示已评分、可用图、指令遵循、生图效果、专项评分；三维指标保持原始均分，不制造额外综合分。
- 明细表展示模型、三维分数、可用结论、问题标签、评分原因与置信度；技术 Run ID 在宽屏保留，在当前紧凑视口隐藏，避免挤压业务信息。
- 字体、暖灰色令牌、6px 圆角、边线、近黑主操作与源页面一致；没有新增图片或替代资产，文案直接使用真实评分数据。

## Interaction Verification

- 点击“AI 评分”后仍停留在评分面板；当前实验自动展示 12 条结果，摘要为 `12 / 12 / 4.83 / 5.00 / 4.83`。
- 页面 `scrollWidth = clientWidth = 877px`；明细表 `scrollWidth = clientWidth = 801px`，当前视口无页面或表格横向溢出。
- 刷新后评分结果从脱敏概览恢复；按实验、样本集筛选并为同一 Run 只展示最新评分版本。
- 浏览器控制台无 error 或 warning；未触发重新评分、模型调用或飞书写入。
- `npm test` 通过：130 tests，0 fail；前端/服务端模块语法检查与 `git diff --check` 通过。

## Comparison History

- Pass 1：结果区位于协议说明之后，首屏只能看到结果标题；摘要使用 `3 + 2` 排列，末行不对称。修正为紧凑视口先展示结果、协议后置，并让五项摘要单行对齐。
- Pass 2：技术 Run ID 让表格产生横向滚动，评分原因可读宽度不足。修正为 `≤1000px` 隐藏 Run 列并将表格收敛到容器宽度。
- Pass 3：最终截图中摘要和首条明细均进入首屏，页面与表格无横向溢出，无剩余 P0/P1/P2 问题。

# Benchmark Formal Review Dimensions v14 Design QA

## Evidence

- Feishu field truth verified read-only from the configured Benchmark result table: `保持一致性 / 风格与材质 / 渲染质量` are number fields; `加权分 / 业务合格` are formula fields.
- User evidence: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-6775c3d2-0635-407d-9d4f-e37c1d541af4.png`

## Findings

- Previous browser copy and AI JSON used `指令遵循 / 生图效果 / 专项评分`, which did not match the governing Feishu rubric; those scores cannot be fixed by renaming labels.
- Formal protocol is now versioned as `white-model-review@v2` and outputs only `保持一致性 / 风格与材质 / 渲染质量` raw scores.
- Existing unversioned reviews are retained as historical facts but marked incompatible, excluded from formal result tables, reviewed counts, usable-image funnels, and analysis.
- When legacy reviews exist, the page explicitly reports the count and changes the action to “按正式三维评分”; it does not silently delete history or trigger paid model calls.

## Verification

- `npm test`: 131 tests, 0 failures; domain, UI, and workbench coverage includes formal parsing, legacy isolation, result projection, and current-sample scoping.
- Live overview reports `white-model-review@v2`, 12 successful results, 0 formal reviews, and 12 isolated legacy reviews for `EXP-20260804T081921Z-5ECA`.
- Live browser shows the three Feishu labels, “按正式三维评分 12 张结果”, and a visible legacy-protocol notice; page horizontal overflow is 0, form/results widths both 843px, and console has no warning or error.
- Browser QA did not click the scoring action, so no model call or Feishu write was triggered.

# Custom Select Full-Width Copy v15 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-02fc4bc9-92c6-4c73-b323-ea6a74eddbd4.png`
- Browser implementation: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-review-dropdown-v15.png`
- Side-by-side comparison: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-dropdown-comparison-v15.png`
- Source and implementation pixels: `1413 × 794`; implementation CSS viewport: `1413 × 794`. The source is visibly captured at a higher browser zoom/crop, so the focused comparison uses the same AI-scoring dropdown-open state and exact copy rather than treating page-scale differences as layout drift.
- State: Benchmark `AI 评分` panel, scoring-model custom select expanded, `Gemini 3.1 Pro` selected.

## Findings

- [Resolved P1] The label had `max-width: 55%` inside a content-sized flex container. A 75px `Gemini 3.1 Pro` copy box therefore limited the actual label to 41px despite hundreds of available pixels, producing `Gemi…` in the trigger and every menu row.
- The trigger value and option-copy containers now flex into the actual remaining width; the arbitrary 55% cap is removed. Ellipsis remains only as a last-resort overflow behavior when the component is genuinely narrower than its content.
- Focused post-fix measurements confirm all eight scoring-model labels have `scrollWidth <= clientWidth` and `max-width: none`. The longest visible label, `Doubao Seed 1.8`, uses 90px inside a 371px control without truncation.
- The sample-labeling model dropdown also passes: all eight labels and all detail strings are complete in the same 371px control, including `Gemini 3.5 Flash · 最新 Flash 候选，已通过真实截图图片输入探针`.

## Required Fidelity Surfaces

- Fonts and typography: existing family, weight, size, and line height are unchanged; only the erroneous artificial truncation boundary was removed.
- Spacing and layout rhythm: control height, padding, option gaps, menu width, radius, shadow, and alignment are unchanged; page horizontal overflow remains `0`.
- Colors and visual tokens: selected, hover, text, quiet text, border, and background tokens are unchanged.
- Image quality and assets: this control contains no raster imagery; existing chevron and check assets are unchanged.
- Copy and content: selected values, model names, and explanatory details now render their complete existing copy; no product text was rewritten.

## Interaction Verification

- Real pointer sequence `Gemini 3.1 Pro → Claude Sonnet 5 → Gemini 3.1 Pro` updates both the native select and visible trigger, closes the menu after selection, and preserves the earlier pointer-focus stabilization.
- Browser console: no warnings or errors.
- Automated verification: `132` tests pass, including a stylesheet regression that rejects the former `max-width: 55%` rule and requires both text containers to consume remaining flex width.

## Comparison History

- Pass 1: source evidence and live computed styles identified the P1 truncation. The 803px review control rendered a 75px content box but clipped its label to 41px because the percentage was resolved against content width.
- Pass 2: after removing the percentage cap and assigning remaining-width flex behavior, all trigger/menu labels and detailed model copy render completely; no new overflow, spacing drift, interaction regression, or console issue remains.

## Final Result

final result: passed

## Follow-up Polish

- P3：未来可在结果量明显增大后增加模型/问题标签筛选；当前 12 条结果无需提前引入额外控件。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Experiment Layout v17 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-972f7f28-ba6e-4c0f-b406-b2d86c017ef0.png`
- Browser-rendered implementation: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-experiment-layout-after-v17.jpg`
- Side-by-side normalized comparison: `/Users/dai/.codex/visualizations/2026/08/03/019fc722-22b7-7751-8d2d-29613e711992/benchmark-experiment-layout-comparison-v17.jpg`
- Source pixels: `1632 × 1494`; implementation pixels and CSS viewport: `1580 × 1496`, device density follows the in-app browser capture.
- Normalized comparison: source and focused implementation regions both resized to `800px` width, composed as `1624 × 732`. The source is defect evidence rather than a prescriptive mock, so QA judges the requested alignment, density and overflow corrections instead of preserving its three-column orphan layout.
- State: Benchmark `实验配置` panel, service connected, template/config values loaded, no plan generated.

## Findings

- [Resolved P1] Four candidate-model cards previously used three equal tracks, leaving `Seedream 5.0` as an isolated second-row card and breaking the panel rhythm. The model region is now an equal `2 × 2` grid; measured card widths are all `539px` and row starts align.
- [Resolved P1] The original panel mixed `3 / 4 / compact-2 / 3` unrelated grids, so the run-volume inputs occupied only part of a row while the model cards overflowed the visual hierarchy. The implementation now uses stable `ID / template / Case`, `3`, `4`, `2`, and `2 × 2` groups with one shared content boundary.
- [Resolved P2] The experiment ID action and template field were cramped by equal-width metadata columns. The metadata grid now reserves `5 / 5 / 2` tracks, while the ID action owns a stable `78px` track.
- No actionable P0/P1/P2 finding remains. At `1580px`, the document reports `scrollWidth = clientWidth = 1580px`; the form reports `scrollWidth = clientWidth = 1128px`.

## Required Fidelity Surfaces

- Fonts and typography: family, weights, sizes, line heights, label hierarchy and complete dropdown copy are unchanged; no new truncation is introduced.
- Spacing and layout rhythm: metadata gap is `16px`, parameter gaps are `12px`, section separation is `22px`, and the preview action is separated by one top rule. All controls in each row share the same top and bottom coordinates.
- Colors and visual tokens: existing warm-gray surfaces, near-black selected state, border and quiet-text tokens are reused without a new accent system.
- Image quality and assets: the panel contains no product raster imagery; existing brand asset, checkmarks and chevrons are unchanged.
- Copy and content: all experiment labels, values and safety copy are unchanged; this iteration only reorganizes presentation.

## Interaction Verification

- Real browser click opened the `融合基模` custom select at `355 × 272px` without page overflow; `Escape` closed it and restored `aria-expanded=false`.
- Reload, DOM snapshot, layout measurement, dropdown open and close completed without a browser-reported page exception. Historical console collection is not exposed by this browser surface; no visible error state appeared.
- Automated verification: `133` tests pass, including a new regression for semantic grid classes, two-column model cards and single-column small-screen fallback.

## Comparison History

- Pass 1: source and live pre-fix evidence showed cramped equal metadata tracks, a half-empty run-volume row, a three-column four-card orphan, and horizontal clipping risk.
- Pass 2: after introducing the semantic grid hierarchy and two-column model layout, the full panel fits within the viewport, every row shares stable boundaries, and the candidate cards form a complete rectangle.

## Final Result

final result: passed

## Follow-up Polish

- P3: if this panel later exceeds six candidate models, add model search or grouping instead of shrinking the cards below the current two-column readable width.

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Experiment Variable v19 Design QA

## Evidence

- Source visual truth: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-7fb79e1a-ded0-4fb2-a3a1-2f2cf61b9915.png`
- Model-variable implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-experiment-variable/compact-model-variable.jpg`
- Prompt-variable implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-experiment-variable/compact-prompt-variable.jpg`
- State: Benchmark `实验配置`, service connected, existing model-comparison template loaded.

## Findings

- [Resolved P1] “唯一变量：出图模型”是硬编码业务规则，无法表达固定模型后比较 Prompt 版本。实验变量现在是显式维度，首期支持“出图模型 / Prompt 版本”，且两个固定项互斥。
- [Resolved P1] 六张大卡在两列布局中占据三行并压过固定参数。候选项收敛为 65px 内的紧凑三列列表，六项稳定形成 `3 × 2`；选中计数独立展示，页面横向溢出为 `0`。
- 模型模式固定一个 Prompt 版本并共享 Prompt；Prompt 模式固定一个出图模型并为每个版本生成独立 Prompt/Run，服务端拒绝双变量组合。
- 当前发布目录只有 `white-model-fusion@v7`，Prompt 模式如实显示“已选 1 / 可用 1”，生成计划时提示至少需要两个已发布版本，不生成伪比较。

## Interaction Verification

- 真实指针完成“出图模型 → Prompt 版本 → 出图模型”双向切换；固定 Prompt/固定模型字段互斥显示，模型候选的原三项选择在往返后完整保留。
- 模型模式生成只读计划成功：`9 Cases / 9 Prompt 批次 / 108 Run`，状态为“计划已生成”；未点击正式运行，没有触发出图或 Base 写入。
- Prompt 模式候选不足时停留在实验配置并显示“Prompt 版本实验至少选择两个已发布版本”。
- `npm test` 通过：`189` tests，`0` fail；`git diff --check` 通过。

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Factor-first Configuration v21 Design QA

## Evidence

- Source defect evidence: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-5287979e-fd2b-4416-a4f8-01d837c2f54c.png`
- Factor-first implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-factor-elegance/factor-first.jpg`
- Compact fixed-parameter implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-factor-elegance/compact-fixed-parameters.jpg`
- Combined source/implementation comparison: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-factor-elegance/source-implementation-comparison.jpg`
- Source pixels: `1448 × 693`; browser viewport: `1280 × 720` at device scale `2`. The source is annotated defect evidence, so the combined review compares hierarchy, density, typography and alignment instead of reproducing its incorrect order.
- State: Benchmark `实验配置`, service connected, model comparison template loaded, `出图模型` selected as the experiment factor.

## Findings

- [Resolved P1] The old page made users parse fixed values before choosing what the experiment changes. The complete factor block now precedes fixed parameters and keeps the candidate set attached to that decision.
- [Resolved P1] The former helper copy incorrectly described a limited Prompt/model rule and the black “一次只改变一个维度” pill repeated an invariant. Both are removed; the single `实验因子` label and selected value carry the hierarchy.
- [Resolved P2] The factor selector previously used visually smaller text and a one-off inline layout. It now reuses the product custom-select component at `38px` height with a measured `12px` value, matching the established control language.
- [Resolved P2] Fixed parameters previously stretched across the panel and looked like primary actions. Desktop layout is now four `220px` tracks with a `916px` maximum content width; responsive breakpoints reduce to two columns and then one column without horizontal overflow.
- Candidate rows are reduced to `44px` minimum height while preserving full labels, disabled reasons, native checkbox state and three-column desktop rhythm.

## Interaction Verification

- Real pointer interaction opened the custom experiment-factor list, changed `出图模型 → 输出比例`, then returned `输出比例 → 出图模型`; the native value updated each time and the menu closed with `aria-expanded=false`.
- Browser measurements: factor value `12px`; fixed tracks `220px`; fixed grid `916px`; `scrollWidth = clientWidth = 1280px`; removed annotation nodes count `0`.
- Browser console warnings/errors: `0`.
- Automated verification: `191` tests pass, including factor order, removed-copy, selector typography, compact grid and candidate-height regressions; `git diff --check` passes.

## Comparison History

- Pass 1: source comparison exposed reversed decision order, redundant/misleading copy, a visually weak factor selector and full-width fixed controls.
- Pass 2: factor-first hierarchy, shared selector styling and compact fixed grid resolved all visible P1/P2 findings without changing experiment semantics.

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

---

# Benchmark Inline Factor Meta v22 Design QA

## Evidence

- Source annotation: `/var/folders/fq/7kdrpfyd68s_vtzh1fv5tl9m0000gn/T/codex-clipboard-ca1ec13f-8d5b-4bd1-a6c0-10e85d4700c8.png`
- Browser implementation: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-factor-meta-inline/prompt-factor-inline-meta.jpg`
- Focused source/implementation comparison: `/Users/dai/.codex/visualizations/2026/08/05/019fcf9c-3d01-73d2-8a73-e1bc0e1ad8c3/benchmark-factor-meta-inline/source-implementation-comparison.jpg`
- Source pixels: `1482 × 295`; implementation pixels: `1280 × 720`; CSS viewport: `1280 × 720`, device scale `2`. The focused comparison normalizes the same Prompt-version factor state and includes the first fixed-parameter row.
- State: Benchmark `实验配置`, `Prompt 版本` selected, one published candidate available and selected.

## Findings

- [Resolved P2] The selection count was detached at the far edge of the panel. It now sits `12px` after the `220px` factor selector and shares the control's `38px` vertical alignment.
- [Resolved P2] The visible “候选 Prompt 版本” legend repeated the selected factor and created a dead text row. It is visually removed while remaining the fieldset's accessible name.
- Candidate cards, fixed parameters, colors, typography, selected state and business behavior are unchanged; page horizontal overflow remains `0`.

## Required Fidelity Surfaces

- Typography: selector stays `12px`; compact count stays quiet `10px`; no new wrapping or truncation.
- Layout: selector, count and candidate card now form one compact left-aligned group; fixed-parameter rhythm is unchanged.
- Colors and tokens: existing ink, quiet text, border and warm-gray tokens are reused.
- Image quality: the edited region contains no raster product assets.
- Copy: redundant visible legend is removed; its dynamic factor name remains available to assistive technology.

## Interaction Verification

- Real pointer selection changed the experiment factor to `Prompt 版本`; the native select and visible trigger agree, the count reads `已选 1 / 可用 1`, and the fieldset is announced as `候选Prompt 版本`.
- Browser console warnings/errors: `0`.
- Automated verification: `191` tests pass; `git diff --check` passes.

## Comparison History

- Pass 1: the source annotation identified the remote count and redundant visible legend.
- Pass 2: the focused combined comparison confirms the count is adjacent to the selector and no duplicate candidate heading remains; no actionable P0/P1/P2 issue remains.

## Final Result

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

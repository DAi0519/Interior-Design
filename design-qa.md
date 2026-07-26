# Style DNA Workbench v9 Design QA

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
- Source pixels: 2160 × 1440
- Implementation pixels: 1280 × 720；CSS viewport 1280 × 720
- Multiline source pixels: 1334 × 240；focused implementation pixels: 620 × 216
- Multiline normalization: 实现截图仅为组件局部，比较图将其等比缩放至 1334px 宽后与源图纵向并置；只判断内容/工具栏分层、滚动边界和垂直节奏，不据此比较字体像素锐度
- Chat panel source pixels: 1326 × 1670；implementation pixels: 1280 × 720；CSS viewport 1280 × 720，devicePixelRatio 2
- Chat panel normalization: 将实现截图等比缩放至源图宽度后纵向并置；比较重点是面板高度、标题/composer 固定位置及内部滚动边界
- Model note source pixels: 834 × 240；implementation crop: 370 × 125；比较图将实现等比缩放至 834px 宽后纵向并置
- State: 桌面端、风格反推模式、默认 System Prompt、1 张附件、0 字附加要求
- Multiline state: 1117 × 837 CSS 视口、devicePixelRatio 2、0 张附件、3 行与 12 行文字两种输入状态
- Chat panel state: 4 轮完整 Style DNA 草稿、消息流停在底部、空 composer；使用生产样式的临时只读验收夹具，验收后已删除
- Model note state: 桌面端、风格反推模式、Gemini 3.1 Pro 已选、API 等待连接
- Comparison method: 在同一视觉比较输入中打开用户标注截图与浏览器最终实现；因两张图视口不同，整体只比较信息层级，并以浏览器实际 CSS 测量验证 Prompt 满高、滚动和 composer 尺寸，不做虚假的逐像素判定

## Full-view Comparison

- 原有双栏工作台、模式切换、反推模型和右侧消息流保持不变。
- 左栏反推配置改成纵向弹性布局：模型区保持固定，Prompt 区占满剩余高度，底部说明距面板底边 21px。
- Composer 仍固定在消息区底部，没有侵入消息流；本轮在紧凑版基础上回增 4px，缓解文字区与工具栏的拥挤感。
- 第八轮源图中每增加一轮草稿都会继续拉长右侧结果面板；修复后 4 轮草稿仍保持 600px 面板高度，页面本身 `scrollHeight` 与视口同为 720px。
- 修复后标题和 composer 始终位于固定面板的顶部与底部，只有中间消息流显示滚动条并停在最新一轮。
- 第九轮只删除反推模型下方的图片探针说明；标题、连接状态、模型选择框、Gemini 3.1 Pro 名称和分割线位置均保持不变。

## Focused Prompt Comparison

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

## Interaction Verification

- Prompt 不可拖拽、可内部滚动并自动撑满左栏。
- 恢复默认完成“编辑 → 启用 → 点击恢复 → 禁用”的完整状态回归。
- 点击加号可添加参考图；1 张附件、输入为空时发送按钮 enabled。
- 首轮没有参考图时拒绝发送；首轮有图时允许不填附加要求。
- 草稿生成成功后清空本轮附件；已有草稿上下文时，纯文字补充要求可直接发送，无需重复上传图片。
- 新对话同时清空消息与未发送附件，恢复首轮必须有图的状态。
- 白模渲染、自由生图仍使用原布局；只有风格反推模式将左栏切换为满高弹性布局。
- 页面无横向溢出，浏览器控制台无 error 或 warning。
- 状态机由浏览器与服务端双重校验，OneAPI 请求层确认纯文字续改不会重复附加历史图片。
- 后端已重启并加载新校验；公开反推配置接口返回正常。重启清空了内存 API Key，真实模型回归留待重新连接后执行。
- 多行输入实测“空态 75px → 3 行 114px → 12 行 199px → 清空回到 75px”，全部状态工具栏保持独立底栏且控制台无 error 或 warning。
- 四轮草稿实测向上滚动到 `scrollTop 0`、再向下滚动到 `scrollTop 894.5`；标题、composer 与 600px 面板高度均未移动，控制台无 error 或 warning。
- 反推模型区域实测 `#styleDnaModelNote` 不存在，区域文本不再包含“已通过白模图片输入探针”；模型选择仍为 Gemini 3.1 Pro。

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

## Follow-up Polish

- 暂无阻塞项；重新连接 API Key 后即可按“首轮传图 → 后续纯文字续改”的真实路径验收。

final result: passed

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

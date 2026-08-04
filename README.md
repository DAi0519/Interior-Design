# Canvas Lab

一个在运营或开发者电脑本地运行的图像模型工作台。页面与 Node 服务只监听
`127.0.0.1`，项目固定安装 `lark-cli` 并使用当前电脑上的飞书用户身份。
当前适配：

- Banana Pro：`gemini-3-pro-image`（稳定版）
- Banana 2：`gemini-3.1-flash-image-preview`
- GPT Image 2：`gpt-image-2`
- Seedream 4.5：`doubao-seedream-4.5`（当前 OneAPI Key 真实开放的上一代对照；未开放 Seedream 4.0）
- Seedream 5.0：`doubao-seedream-5.0`
- Flux2 Klein：`comfyui:ai-texture-enhancement`（兼容历史路由 ID；ComfyUI 单张参考图工作流，保持原图尺寸）

工作台提供“白模渲染 / 风格反推 / 自由生图”功能切换，进入页面时仍默认选择白模渲染。三个模式的图片、输入与选择状态相互隔离；风格反推是工作台预览，不改变白模或自由生图请求。白模渲染与风格反推都可以选择多模态模型，候选 ID 来自公司 Model Link，连接 API 后会实时检查当前 Key 是否开放：

- DeepSeek 4 Pro：`deepseek-v4-pro`，当前路由不接受图片输入，因此禁用。
- Gemini 3.1 Pro：`gemini-3.1-pro-preview`，已通过图片输入探针。
- Gemini 3.5 Flash：`gemini-3.5-flash`，已通过真实截图图片输入探针。
- GPT 5.5：`gpt-5.5`（Model Link 上游名 `openai/gpt-5.5`），已通过图片输入探针。
- Claude Sonnet 5：`claude-sonnet-5`，已通过图片输入探针。
- Qwen 3.5 Plus：`qwen3.5-plus`，综合能力候选，已通过图片输入探针。
- Qwen3-VL Plus：`qwen3-vl-plus`，已通过真实截图图片输入探针。
- Doubao Seed 1.8：`doubao-seed-1.8`，保留现有兼容候选，已通过真实截图图片输入探针。
- Doubao Seed 2.0 Lite：请求使用 `/v1/models` 暴露的 `doubao-seed-2.0-lite` 路由别名，对应 Model Link 卡片 `doubao-seed-2-0-lite-260215`，目录标注支持图片输入。
- Kimi K2.5：`kimi-k2.5`，中文与长上下文候选，已通过图片输入探针。

Claude 仅保留 Sonnet 5，不纳入 Opus 系列；Doubao 同时保留 Seed 1.8 兼容候选与 Seed 2.0 Lite 新候选。

最终出图模型与 Prompt Agent 使用不同的可用性策略：五个 OneAPI 模型和一个 ComfyUI 工作流启动后统一显示并允许选择，实际请求结果负责最终裁决，不向使用者暴露模型目录、ComfyUI 地址或工作流正文；Prompt Agent 需要处理参考图，继续同时检查目录可见性与图片输入能力。

所有模型、版本和参数下拉共用原生 `select` 渐进增强；鼠标或触控板按下选项时先把焦点稳定在菜单内，再由 click 提交选择，避免 macOS 浏览器在焦点短暂回到页面时提前关闭菜单。键盘方向键、Home、End、Escape 与确认操作保持可用。

场景融合 Agent 与融合基模选择不改变自由生图请求。白模渲染已经接入完整执行链：服务端按 Agent 编码读取所选已上架版本，结合 Style DNA 调用多模态 Prompt Agent 生成结构化 Prompt；选择 OneAPI 模型时继续通过 Responses 图生图，选择 Flux2 Klein 时由服务端上传原白模到 ComfyUI、把当前 Prompt 原样写入正向节点、注入随机 Seed、排队轮询并下载输出，工作流内只保留固定负向 Prompt。未显式选择时仍默认最高可用版本。首次白模成功前只显示“开始渲染”；成功后同一组融合输入会显示“再次渲染 / 重新融合”，前者复用最终 Prompt，后者重新运行 Prompt Agent。API Key 重连、配置刷新或服务重启会清空复用状态，浏览器不接收 Prompt 正文、ComfyUI 地址或执行图。自由生图选择 Flux2 Klein 时可以不连接 OneAPI，但必须上传且只允许一张图片；没有参考图的 OneAPI 纯文生图仍使用 Images Generations API。

风格反推首轮接受接口支持的同风格图片或 PDF，并用对话持续收敛形态与空间、材质与色彩、家具与细节、灯光四组变量。附件数量不设产品上限，当前支持 PNG、JPEG、WebP、GIF、PDF，单文件 8MB、合计 20MB；参考附件是首轮唯一必填输入，用户可以只上传附件直接发送。生成草稿后会清空本轮附件，后续可直接输入文字继续修改，也可按需添加新附件。输入框左下角加号添加附件，图片显示缩略图，PDF 显示文件卡。System Prompt 在现有 `AI 生图` Base 的独立 `风格反推prompt` 表中做版本管理；前端只展示已上架版本目录，默认最高版本且可以切回历史上架版本测试，当前标签页刷新后保持所选版本；正文仍只由服务端读取且不能被浏览器覆盖。每轮输出都是未发布草稿，可复制 JSON，但当前不会写入飞书风格库或自动发布。

白模渲染的“风格”下拉框读取飞书“AI 生图 / 风格库”。服务端将飞书基础编码与版本合成为唯一运行时编码，例如 `cream-french@v1`、`cream-french@v2`；各已上架完整版本均可选择并默认最新版本，当前标签页刷新后保持用户已选版本。前端只接收名称、版本化编码、标签、摘要和上下架状态，完整 Style DNA 由执行链按唯一编码在服务端读取。“场景融合 Agent”同样使用版本下拉，但只返回已上架且正文完整的版本，下架版本不进入前端目录；默认最高版本并记住当前标签页选择。融合基模与最终出图模型也统一使用下拉，最终出图模型进入工作台时默认 Seedream 5.0。Style DNA 与 Prompt Agent 配置在服务端缓存 5 分钟；两处标题旁都提供“刷新”，点击任意一个都会同时读取最新 Style DNA 与融合 Agent，无需重启服务。

每次生成成功后，图片会立即返回工作台，用户输入的“原始 Prompt”、实际提交给出图模型的“最终 Prompt”、最终出图模型（“生图模型”字段）、白模融合基模（“Prompt融合”字段）、模型参数、工作流元数据、结果图和参考图随后在后台同步到飞书多维表格“AI 生图记录”。ComfyUI 记录额外保存 Workflow ID/版本、模型、Seed、Prompt ID、排队时间和执行时间；成本没有可靠来源时不推算。结果区会显示同步状态，飞书失败不影响已经生成的图片。图片通过系统临时目录中转，上传结束后立即删除，不进入本机“下载”目录。

“耗时（秒）”只记录生成主链路：自由生图为出图模型耗时，白模渲染为 Prompt Agent 开始到出图模型完成的总耗时。Style DNA/Agent 配置读取、模型目录检查和飞书同步耗时均不计入，也不会另行写入飞书。

## 首次运行

### 前置条件

- Windows 或 macOS。
- Node.js 24 或更高版本。
- 私有 GitHub 仓库或 Release 源码 ZIP 的访问权限。
- 运营自己的 OneAPI Key。
- 运营飞书账号已拥有共享 `AI 生图` Base 中风格库、白模 Prompt Agent、风格反推 Prompt 与生成记录表的读取权限。

### 一键启动（推荐）

解压发布包后直接双击对应文件：

- macOS：`start-macos.command`。如果系统首次拦截，右键该文件选择“打开”。
- Windows：`start-windows.cmd`。

启动器会检查 Node.js 24、按 `package-lock.json` 首次执行 `npm ci`，并在依赖变化时
自动重装；若飞书 CLI 尚未初始化，会打开浏览器引导完成一次应用初始化。随后启动
Canvas Lab 并自动打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。再次双击时，
已安装的依赖不会重复安装，已经运行的工作台会直接打开。

Node.js 属于系统运行时，启动器不会静默安装或提权修改电脑。缺少 Node.js 24 时会
打开官方下载页，安装完成后重新双击启动文件即可。OneAPI Key 不由脚本写入；页面
打开后在“连接中心”完成飞书用户授权并填写自己的 Key。

### 命令行启动（备用）

也可以在项目目录执行：

```bash
npm ci
```

该命令会安装项目固定版本的 `lark-cli`，不需要全局安装。项目同时固定
`package-lock.json` 与 CLI 安装脚本审批，Windows 和 macOS 使用同一条安装命令。

如果这台电脑从未配置过飞书 CLI，执行：

```bash
npm run lark:init
```

在浏览器中完成飞书 CLI 应用初始化。应用初始化涉及用户显式操作，不会在
`npm start` 时静默创建。初始化后启动工作台：

```bash
npm start
```

然后打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。页面首次运行会打开
“连接中心”：

1. 点击“登录飞书”，打开原始授权链接或扫描二维码。
2. 完成授权后点击“我已完成授权”。
3. 页面会检查 CLI、用户 Token、必要 Scope 与共享 Base 可读性。
4. 填写自己的 OneAPI Key。
5. 如需跨重启保留，选择“记住在这台电脑”。

连接中心启动时自动检测同步所需的最小用户权限：读取 Base 字段与记录、创建和更新
记录、上传文档附件。缺少权限时页面使用中文能力名称说明原因并显示“补充授权”；
旧版本已经登录的用户完成一次增量授权即可，不需要清除已有登录。

飞书登录凭据由 `lark-cli` 自己管理，不写入项目 `.env.local`。OneAPI Key
默认只保存在 Node 进程内；只有用户显式选择后才写入项目根目录的
`.env.local`。该文件已被 Git 忽略，但仍是本机明文文件，不适合共用电脑。
Flux2 Klein 默认连接项目内配置的公司 ComfyUI 服务，不需要在浏览器填写 Key；如服务迁移，可用 `.env.local` 的 `COMFYUI_BASE_URL` 覆盖。

可以随时检查飞书登录：

```bash
npm run lark:status
```

Windows PowerShell 与 macOS Terminal 使用以上相同的 npm 命令。关闭一键启动打开的
终端或运行 `npm start` 的终端都会停止本地服务；服务退出时尚未完成的飞书同步可能
中断。

## 开发者后台启动

在 Codex 中点击“运行工作台”会通过 `npm start` 将服务放到后台，并自动打开
[http://127.0.0.1:4173](http://127.0.0.1:4173)。运行命令结束后可以关闭终端标签；重复点击只会打开已经运行的工作台。需要结束服务时点击“停止工作台”。后台日志位于 `/tmp/canvas-lab.log`。

也可以只把密钥注入当前进程：

```bash
ONEAPI_API_KEY='你的密钥' node server.mjs
```

Windows 和 macOS 设置临时环境变量的语法不同，因此运营流程优先使用连接中心，
不要求在终端注入 Key。

## 参数边界

模型参数来自公司 Model Link 的图片生成说明：

- Banana Pro：10 种比例，1K / 2K / 4K，PNG / JPEG。
- Banana 2：14 种比例，512 / 1K / 2K / 4K，PNG / JPEG。
- GPT Image 2：9 种比例，1K / 2K / 4K，PNG / JPEG / WebP，并支持质量档位；白模渲染与自由生图都默认选择“中”。
- Seedream 4.5：8 种比例，2K / 4K，PNG / JPEG。
- Seedream 5.0：8 种比例，2K / 3K / 4K，PNG / JPEG。
- Flux2 Klein：必须且只允许一张 PNG / JPEG / WebP；工作流内部将输入宽度处理到 1920 并保持比例参与推理，最终输出恢复原图宽高，只输出 PNG，不开放比例和分辨率下拉。

白模或自由生图上传参考图后，浏览器会按第一张图片的宽高从当前模型合法比例中选择
最近项；服务端再次从真实 PNG/JPEG/WebP 图片头读取首图宽高并完成同一适配，避免
信任客户端声明。用户手动改动画幅比例后以手选值为准；继续添加其他参考图不会覆盖
手选值，移除首图或切换出图模型后会按新的首图重新适配。分辨率档位始终独立选择，
不继承原图像素数。Flux2 Klein 是例外：尺寸控件锁定为“跟随原图”，服务端再次读取真实宽高并要求单图。没有参考图时，自由生图的 OneAPI 模型继续使用手选的“比例 + 分辨率档位”。

## 多参考图

可点击上传区或拖拽添加参考图：

- 最多 4 张。
- 支持 PNG、JPEG、WebP。
- 单张不超过 8MB，合计不超过 20MB。
- 浏览器先本地预览，后端会重新校验 MIME、Base64 和真实字节数。
- 浏览器按上传顺序提交参考图，服务端会继续保持该顺序。
- 服务端发现参考图后会转换为 Responses API 的 `input_image`；纯文生图才走 Images API，避免 TencentVOD 将 Data URL 误判为 `FileId`。

风格反推使用输入框内独立的附件入口，不设置固定数量上限；图片经 Responses `input_image` 发送，PDF 经 `input_file` 发送。没有附加文字时，服务端依据当前 System Prompt 补充最小触发消息。单文件 8MB、合计 20MB、MIME、真实字节及 PDF 文件签名仍由服务端安全边界校验。

## 验证

```bash
node --test
```

自动化测试不会消耗模型额度。真实出图只会在点击“开始生成”后发生。

## 飞书同步

默认目标为共享的“AI 生图记录 / 生成记录”。服务端通过当前电脑的飞书用户身份
调用项目本地 `lark-cli`，需要保持登录有效并拥有目标 Base 权限。可在
`.env.local` 中使用以下环境变量覆盖目标：

飞书同步使用本地进程内后台任务，并以 `generationId` 防止同一任务在进程内重复入队。关闭本地服务会中断尚未完成的同步；这是当前零依赖 MVP 的已知边界。

- `LARK_BASE_TOKEN`
- `LARK_BASE_URL`
- `LARK_TABLE_ID`
- `LARK_REFERENCE_FIELD_ID`
- `LARK_RESULT_FIELD_ID`
- `LARK_CLI_PATH`
- `LARK_AGENT_BASE_TOKEN`
- `LARK_AGENT_TABLE_ID`
- `LARK_STYLE_BASE_TOKEN`
- `LARK_STYLE_TABLE_ID`
- `LARK_STYLE_DNA_PROMPT_BASE_TOKEN`
- `LARK_STYLE_DNA_PROMPT_TABLE_ID`

风格反推 Prompt 使用现有 `AI 生图` Base 内的独立数据表 `风格反推prompt`。
服务端按 `Agent 编码=style-dna-reverse` 公开脱敏已上架版本目录；未指定时读取
数字版本最高的完整记录，指定版本时精确读取该记录。配置缓存 5 分钟，版本区刷新
会主动重读。白模场景融合表可用 `Agent 名称` 调整版本下拉展示名；`Agent 编码`
仍是稳定路由主键。飞书登录用户
必须拥有该 Base 的读取权限。

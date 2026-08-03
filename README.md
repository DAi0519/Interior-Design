# Canvas Lab

一个在运营或开发者电脑本地运行的图像模型工作台。页面与 Node 服务只监听
`127.0.0.1`，项目固定安装 `lark-cli` 并使用当前电脑上的飞书用户身份。
当前适配：

- Banana Pro：`gemini-3-pro-image`（稳定版）
- Banana 2：`gemini-3.1-flash-image-preview`
- GPT Image 2：`gpt-image-2`
- Seedream 5.0：`doubao-seedream-5.0`

工作台提供“白模渲染 / 风格反推 / 自由生图”功能切换，进入页面时仍默认选择白模渲染。三个模式的图片、输入与选择状态相互隔离；风格反推是工作台预览，不改变白模或自由生图请求。白模渲染与风格反推都可以选择多模态模型，候选 ID 来自公司 Model Link，连接 API 后会实时检查当前 Key 是否开放：

- DeepSeek 4 Pro：`deepseek-v4-pro`，当前路由不接受图片输入，因此禁用。
- Gemini 3.1 Pro：`gemini-3.1-pro-preview`，已通过图片输入探针。
- Gemini 3.5 Flash：`gemini-3.5-flash`，已通过真实截图图片输入探针。
- GPT 5.5：`gpt-5.5`（Model Link 上游名 `openai/gpt-5.5`），已通过图片输入探针。
- Claude Sonnet 5：`claude-sonnet-5`，已通过图片输入探针。
- Qwen 3.5 Plus：`qwen3.5-plus`，综合能力候选，已通过图片输入探针。
- Qwen3-VL Plus：`qwen3-vl-plus`，已通过真实截图图片输入探针。
- Doubao Seed 1.8：`doubao-seed-1.8`，只保留当前最新 Doubao 候选，已通过真实截图图片输入探针。
- Kimi K2.5：`kimi-k2.5`，中文与长上下文候选，已通过图片输入探针。

Claude 仅保留 Sonnet 5，不纳入 Opus 系列；Doubao 不保留旧版本测试位。

场景融合 Agent 与融合基模选择不改变自由生图请求。白模渲染已经接入完整执行链：服务端按 Agent 编码精确读取前端所选的已上架完整版本，结合已上架 Style DNA 调用所选多模态模型生成结构化 Prompt，再通过 Responses API 的 `input_image + image_generation` 把该 Prompt 与原白模图交给所选出图模型。未显式选择时仍默认最高可用版本。首次白模成功前只显示“开始渲染”；成功后同一组白模、Style DNA、补充要求、Agent 模型/版本会显示“再次渲染 / 重新融合”两个按钮，前者在一小时内复用最终 Prompt、只重新出图，后者显式忽略缓存并重新运行 Prompt Agent。任一融合条件变化会恢复“开始渲染”并自动重新融合，出图模型、画幅、分辨率、质量与格式变化不影响提示词复用；出图失败后的普通重试仍复用已经成功生成的 Prompt。API Key 重连、配置刷新或服务重启会清空复用状态，浏览器只持有输入指纹和复用状态，不接收 Prompt 正文。摄影参数只由当前飞书 System Prompt 定义，服务端不再额外注入第二套摄影基线。没有参考图的纯文生图仍使用 Images Generations API。

风格反推首轮接受接口支持的同风格图片或 PDF，并用对话持续收敛形态与空间、材质与色彩、家具与细节、灯光四组变量。附件数量不设产品上限，当前支持 PNG、JPEG、WebP、GIF、PDF，单文件 8MB、合计 20MB；参考附件是首轮唯一必填输入，用户可以只上传附件直接发送。生成草稿后会清空本轮附件，后续可直接输入文字继续修改，也可按需添加新附件。输入框左下角加号添加附件，图片显示缩略图，PDF 显示文件卡。System Prompt 在现有 `AI 生图` Base 的独立 `风格反推prompt` 表中做版本管理；前端只展示已上架版本目录，默认最高版本且可以切回历史上架版本测试，当前标签页刷新后保持所选版本；正文仍只由服务端读取且不能被浏览器覆盖。每轮输出都是未发布草稿，可复制 JSON，但当前不会写入飞书风格库或自动发布。

白模渲染的“风格”下拉框读取飞书“AI 生图 / 风格库”。服务端将飞书基础编码与版本合成为唯一运行时编码，例如 `cream-french@v1`、`cream-french@v2`；各已上架完整版本均可选择并默认最新版本，当前标签页刷新后保持用户已选版本。前端只接收名称、版本化编码、标签、摘要和上下架状态，完整 Style DNA 由执行链按唯一编码在服务端读取。“场景融合 Agent”同样使用版本下拉，但只返回已上架且正文完整的版本，下架版本不进入前端目录；默认最高版本并记住当前标签页选择。融合基模与最终出图模型也统一使用下拉，最终出图模型进入工作台时默认 Seedream 5.0。Style DNA 与 Prompt Agent 配置在服务端缓存 5 分钟；两处标题旁都提供“刷新”，点击任意一个都会同时读取最新 Style DNA 与融合 Agent，无需重启服务。

每次生成成功后，图片会立即返回工作台，用户输入的“原始 Prompt”、实际提交给出图模型的“最终 Prompt”、最终出图模型（“生图模型”字段）、白模融合基模（“Prompt融合”字段）、模型参数、工作流元数据、结果图和参考图随后在后台同步到飞书多维表格“AI 生图记录”。白模渲染未填写补充要求时原始 Prompt 留空；自由生图当前两列 Prompt 内容相同且“Prompt融合”留空。结果区会显示同步状态，飞书失败不影响已经生成的图片。图片通过系统临时目录中转，上传结束后立即删除，不进入本机“下载”目录。

“耗时（秒）”只记录生成主链路：自由生图为出图模型耗时，白模渲染为 Prompt Agent 开始到出图模型完成的总耗时。Style DNA/Agent 配置读取、模型目录检查和飞书同步耗时均不计入，也不会另行写入飞书。

## 首次运行

### 前置条件

- Windows 或 macOS。
- Node.js 24 或更高版本。
- 私有 GitHub 仓库或 Release 源码 ZIP 的访问权限。
- 运营自己的 OneAPI Key。
- 运营飞书账号已拥有共享 `AI 生图` Base 中风格库、白模 Prompt Agent、风格反推 Prompt 与生成记录表的读取权限。

在项目目录执行：

```bash
npm install
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

飞书登录凭据由 `lark-cli` 自己管理，不写入项目 `.env.local`。OneAPI Key
默认只保存在 Node 进程内；只有用户显式选择后才写入项目根目录的
`.env.local`。该文件已被 Git 忽略，但仍是本机明文文件，不适合共用电脑。

可以随时检查飞书登录：

```bash
npm run lark:status
```

Windows PowerShell 与 macOS Terminal 使用以上相同的 npm 命令。关闭运行
`npm start` 的终端会停止本地服务；服务退出时尚未完成的飞书同步可能中断。

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
- Seedream 5.0：8 种比例，2K / 3K / 4K，PNG / JPEG。

白模或自由生图上传参考图后，浏览器会按第一张图片的宽高从当前模型合法比例中选择
最近项；服务端再次从真实 PNG/JPEG/WebP 图片头读取首图宽高并完成同一适配，避免
信任客户端声明。用户手动改动画幅比例后以手选值为准；继续添加其他参考图不会覆盖
手选值，移除首图或切换出图模型后会按新的首图重新适配。分辨率档位始终独立选择，
不继承原图像素数。没有参考图时，自由生图继续使用手选的“比例 + 分辨率档位”。

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

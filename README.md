# Canvas Lab

一个零依赖、本地运行的图像模型测试工作台，当前适配：

- Banana Pro：`gemini-3-pro-image`（稳定版）
- Banana 2：`gemini-3.1-flash-image-preview`
- GPT Image 2：`gpt-image-2`
- Seedream 5.0：`doubao-seedream-5.0`

工作台提供“自由生图 / 白模渲染”功能切换。只有选择白模渲染时才显示紧凑的 Prompt Agent 模型选择；候选 ID 来自公司 Model Link，连接 API 后会实时检查当前 Key 是否开放：

- DeepSeek 4 Pro：`deepseek-v4-pro`，当前路由不接受图片输入，因此禁用。
- Gemini 3 Pro：`gemini-3.1-pro-preview`，已通过图片输入探针。
- GPT 5.5：`gpt-5.5`（Model Link 上游名 `openai/gpt-5.5`），已通过图片输入探针。
- Claude Sonnet 5：`claude-sonnet-5`，已通过图片输入探针。
- Qwen 3.5 Plus：`qwen3.5-plus`，综合能力候选，已通过图片输入探针。
- Doubao Seed 1.6 Vision：`doubao-seed-1.6-vision`，中文低成本候选，已通过图片输入探针。
- Kimi K2.5：`kimi-k2.5`，中文与长上下文候选，已通过图片输入探针。

Prompt Agent 选择不改变自由生图请求。白模渲染已经接入完整执行链：服务端按 Agent 编码读取最高已上架且 System Prompt 完整的版本，结合已上架 Style DNA 调用所选多模态模型生成结构化 Prompt，再通过 Responses API 的 `input_image + image_generation` 把该 Prompt 与原白模图交给所选出图模型。摄影参数只由当前飞书 System Prompt 定义，服务端不再额外注入第二套摄影基线。没有参考图的纯文生图仍使用 Images Generations API。

白模渲染的“风格”下拉框读取飞书“AI 生图 / 风格库”。服务端将飞书基础编码与版本合成为唯一运行时编码，例如 `cream-french@v1`、`cream-french@v2`；各已上架完整版本均可选择并默认最新版本，当前标签页刷新后保持用户已选版本。前端只接收名称、版本化编码、标签、摘要和上下架状态，完整 Style DNA 由执行链按唯一编码在服务端读取。Prompt Agent 标题显示当前融合 Agent 的只读版本，不提供版本选择。Style DNA 与 Prompt Agent 配置在服务端缓存 5 分钟；运营发布新版本后可点击旁边的“刷新”立即读取最新配置，无需重启服务。

每次生成成功后，图片会立即返回工作台，用户输入的“原始 Prompt”、实际提交给出图模型的“最终 Prompt”、模型参数、工作流元数据、结果图和参考图随后在后台同步到飞书多维表格“AI 生图记录”。白模渲染未填写补充要求时原始 Prompt 留空；自由生图当前两列内容相同。结果区会显示同步状态，飞书失败不影响已经生成的图片。图片通过系统临时目录中转，上传结束后立即删除，不进入本机“下载”目录。

“耗时（秒）”只记录生成主链路：自由生图为出图模型耗时，白模渲染为 Prompt Agent 开始到出图模型完成的总耗时。Style DNA/Agent 配置读取、模型目录检查和飞书同步耗时均不计入，也不会另行写入飞书。

## 启动

在 Codex 中点击“运行工作台”会将服务放到后台，并自动打开
[http://127.0.0.1:4173](http://127.0.0.1:4173)。运行命令结束后可以关闭终端标签；重复点击只会打开已经运行的工作台。需要结束服务时点击“停止工作台”。后台日志位于 `/tmp/canvas-lab.log`。

也可以在终端以前台方式启动：

```bash
node server.mjs
```

然后打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。

也可以只把密钥注入当前进程：

```bash
ONEAPI_API_KEY='你的密钥' node server.mjs
```

如果不设置环境变量，可在工作台连接面板中输入密钥。密钥只会发送到
`127.0.0.1`，保存在 Node 进程内存中；刷新页面不会显示密钥，关闭服务后自动清除。

## 参数边界

模型参数来自公司 Model Link 的图片生成说明：

- Banana Pro：10 种比例，1K / 2K / 4K，PNG / JPEG。
- Banana 2：14 种比例，512 / 1K / 2K / 4K，PNG / JPEG。
- GPT Image 2：9 种比例，1K / 2K / 4K，PNG / JPEG / WebP，并支持质量档位。
- Seedream 5.0：8 种比例，2K / 3K / 4K，PNG / JPEG。

前端只选择“比例 + 分辨率档位”，后端会映射成模型要求的精确 `WxH`，
并在请求发送前再次校验。

## 多参考图

可点击上传区或拖拽添加参考图：

- 最多 4 张。
- 支持 PNG、JPEG、WebP。
- 单张不超过 8MB，合计不超过 20MB。
- 浏览器先本地预览，后端会重新校验 MIME、Base64 和真实字节数。
- 浏览器按上传顺序提交参考图，服务端会继续保持该顺序。
- 服务端发现参考图后会转换为 Responses API 的 `input_image`；纯文生图才走 Images API，避免 TencentVOD 将 Data URL 误判为 `FileId`。

## 验证

```bash
node --test
```

自动化测试不会消耗模型额度。真实出图只会在点击“开始生成”后发生。

## 飞书同步

默认目标为本机已创建的“AI 生图记录 / 生成记录”。服务端通过当前飞书用户身份调用 `lark-cli`，需要保持登录有效。可使用以下环境变量覆盖目标：

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

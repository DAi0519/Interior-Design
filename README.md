# Canvas Lab

一个零依赖、本地运行的图像模型测试工作台，当前适配：

- Banana Pro：`gemini-3-pro-image`（稳定版）
- Banana 2：`gemini-3.1-flash-image-preview`
- GPT Image 2：`gpt-image-2`
- Seedream 5.0：`doubao-seedream-5.0`

每次生成成功后，工作台会自动把 Prompt、模型参数、耗时、结果图和多张参考图同步到飞书多维表格“AI 生图记录”。图片通过系统临时目录中转，上传结束后立即删除，不进入本机“下载”目录。

## 启动

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
- 公司接口收到 `images: [{ image_url }]` 数组，图片顺序与工作台一致。

## 验证

```bash
node --test
```

自动化测试不会消耗模型额度。真实出图只会在点击“开始生成”后发生。

## 飞书同步

默认目标为本机已创建的“AI 生图记录 / 生成记录”。服务端通过当前飞书用户身份调用 `lark-cli`，需要保持登录有效。可使用以下环境变量覆盖目标：

- `LARK_BASE_TOKEN`
- `LARK_BASE_URL`
- `LARK_TABLE_ID`
- `LARK_REFERENCE_FIELD_ID`
- `LARK_RESULT_FIELD_ID`
- `LARK_CLI_PATH`

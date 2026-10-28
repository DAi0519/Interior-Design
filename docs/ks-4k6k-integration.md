<!--
[INPUT]: 依赖KS直入2026-10-27.1正式工厂、两档MaaS导出、已有数学/SeedVR2节点及最终实测结论
[OUTPUT]: 提供两档四份JSON、唯一入参/返回字段、固定节点/尺寸参数、实际出图证据与平台联调合同
[POS]: docs的KS双档唯一开发交接入口；关键评测与原件见outputs/ks-final/report.md
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# KS超分：4K / 6K 两份独立工作流

后端按用户所选档位调用对应的MaaS工作流ID，**每份只传原图URL `input_img`，结果读取 `result_img` 原始PNG**。尺寸常量都写在工作流内，不传宽高或分辨率，不安装新增插件。

| 档位 | AI推理长边 | 最终PNG长边 | 整理画布 | API执行图 |
|---|---:|---:|---|---|
| 4K | 4096px | 4096px | [4K画布](../workflows/KS-固定4K推理-4K交付.MaaS.json) | [4K API](../workflows/KS-固定4K推理-4K交付.MaaS.api.json) |
| 6K | 5120px | Lanczos插值至6144px | [6K画布](../workflows/KS-固定5K推理-6K交付.MaaS.json) | [6K API](../workflows/KS-固定5K推理-6K交付.MaaS.api.json) |

两份图都保持原图比例，短边取最近偶数。4K直接交付4K模型结果；6K是5K增强后的插值成品，不能称完整6K画布的AI推理。4192主工作台和Beta选择「KS直入 · 7B」即此方案，运行真源为`ks_seedvr2_2x_direct@2026-10-27.1`；默认超分仍为攸行3B，其他工作流不变。

## 输入与返回

```json
{
  "input_img": "https://<worker可访问的原图URL>"
}
```

这是业务字段示例，调用地址、鉴权、参数/策略ID、提交与轮询格式沿用团队现有MaaS协议。两个正式工作流ID待平台发布提供，文档不预设生产ID。

输入为单张有效PNG/JPEG/WebP。当前本机上传校验为≤8MiB、宽高各384–3200px；独立URL图不内置上传门禁，接入方应保留现有校验。返回应下载同次任务`result_img`的原始PNG，核对格式、真实宽高、字节SHA，不用缩略图或截图作验收。

## 固定节点逻辑

```text
4K：70 input_img → 71 URL读图 → 77 Lanczos 4K画布 → 75 SeedVR2 → 76 PNG
    71 → 80 原图宽高 → 81 等比4096宽高 → 77宽高、82实际短边 → 75

6K：70 input_img → 71 URL读图 → 77 Lanczos 5K画布 → 75 SeedVR2 → 78 Lanczos 6K → 76 PNG
    71 → 80 原图宽高 → 81 等比5120宽高 → 77宽高、82实际短边 → 75
         80 原图宽高 → 83 等比6144宽高 → 78宽高
```

| 节点 | 固定参数/连接 |
|---|---|
| 70 `MaaSInputString` / 71 `MaaSUrlLoader` | 唯一参数key=`input_img`；71的URL接70 |
| 80 `GetImageSize` | 读取71实际解码宽高 |
| 81 `SimpleMathDual+` | 按原图比例计算最近偶数宽高；4K长边固定4096，6K固定5120；INT输出槽0/2接77 |
| 82 `SimpleMath+` | `min(a,b)`，输入81的推理宽高，INT槽0接75的`resolution` |
| 77 `ImageScale` | Lanczos、crop=disabled，宽高接81 |
| 75 `SeedVR2VideoUpscaler` | 4K的`max_resolution=4096`，6K为5120；`resolution`接82的**实际短边**，不能也写成长边值 |
| 83 `SimpleMathDual+` / 78 `ImageScale` | 仅6K存在；83按80的原图宽高计算6144长边成品，INT槽0/2接78；78为Lanczos、crop=disabled |
| 76 `MaaSReportImage` | key=`result_img`、format=`.png`、quality100、batch_size1、bucket_key留空；4K接75，6K接78 |

共同固定参数：7B mixed模型、36层交换、I/O交换true、CPU卸载、缓存false、sdpa；FP16 VAE内部encode/decode tiled1024、overlap128；batch1、LAB、noise0、seed1758808765。无外部切图/拼接，无新增自定义规划节点。模型文件：

```text
seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors
ema_vae_fp16.safetensors
```

导出JSON的seed是复现基线，未开放后端seed字段；本机工作台使用本次任务生成的seed。4K图10节点14线，6K图12节点19线，都不含临时诊断Save79。

## 已完成的实际出图

2026-10-27，同一张960×1200原图通过4192正式链路串行各提交一次，均成功、零重提，75号模型节点均未使用缓存。最终PNG经完整解码及SHA核验，执行History与交接JSON模型核心一致。

| 档位 | History实际推理请求尺寸 | 真实成品PNG | 执行耗时 | 含排队/回传总耗时 |
|---|---|---|---:|---:|
| 4K | 3276×4096 | 3276×4096 | 30.573秒 | 60.257秒 |
| 6K | 4096×5120 | 4916×6144 | 46.813秒 | 129.421秒 |

执行耗时包含节点计算和PNG保存，不是纯模型内核基准；本轮两seed不同，用于尺寸/耗时验收。6K另有四种比例的真实5K模型PNG与6K成品4/4单次实测。原件、四比例结果、历史方案取舍及验证边界见[最终评测结论](../outputs/ks-final/report.md)。

## 发布与验收

1. 分别导入4K、6K画布/API，核对节点和模型文件，发布后提供两个正式ID；后端用档位映射选择，输入/返回字段保持一致。
2. 每档用正式URL输入→异步任务→原始PNG下载完整跑通，检查原图比例、长边与最近偶数短边。保留请求/任务/Prompt ID和原件SHA；超时后先查原任务，避免重复POST。
3. 4K方图最大4096²=16.777216MP，补齐16px边界后也不超过该面积；6K固定5K方图为26.2144MP，不能据固定长边保证任意显存状态或并发都成功。

上述实际出图验证4192的模型核心；独立MaaS的URL加载/PNG报告外壳及正式调用ID仍需平台发布后按上述步骤联调，不将本机成功当作平台已经发布。

可直接发开发：请接入附件4K、6K两份KS工作流，分别发布两个ID，后端按档位选择，只传`input_img`并读取`result_img`原始PNG。4K是4096推理/输出，6K是5120推理后插值6144；尺寸和比例计算都在已有节点内，无需后端计算或新增插件。请用正式平台ID分别完成URL输入、任务轮询和PNG尺寸/SHA联调。

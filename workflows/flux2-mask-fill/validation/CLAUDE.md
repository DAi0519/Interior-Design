# validation/
> L2 | 父级: ../CLAUDE.md

成员清单

rebuild-comparison.mjs: 新附件隔离1024编码链对照构建/显式GPU执行工具，固定合成输入/seed/采样与输出，不改工作台或飞书
rebuild-audit.json: 新附件SHA/两实例节点与权重枚举/拓扑残留/真实连线覆盖值、作者源码推导与明确未发布边界
rebuild-comparison.md: 新附件兼容性、条件链/尺寸差异、实际GPU四张对照图和小样本质量限制的可读报告
rebuild-native.api.json: 现有原生编码链的受控1024/双张对照执行快照，内含本地合成fixture的Base64
rebuild-editutils.api.json: 新EditUtils编码链的同条件执行快照，两缺失节点由内联文本/原生Rebatch替代
rebuild-comparison-runs.json: 受控对照的输入/图摘要、明确的原附件参数偏离、真实Prompt ID/产物/裁剪尺寸与计时
rebuild-native-1.png: 原生条件链受控对照第一张512px结果
rebuild-native-2.png: 原生条件链受控对照第二张512px结果
rebuild-editutils-1.png: EditUtils条件链受控对照第一张512px结果
rebuild-editutils-2.png: EditUtils条件链受控对照第二张512px结果
input-mask.png: 512px合成房间/冰箱图与透明编辑区，仅用于节点执行冒烟
source.png: 同一合成原图去除alpha，供工作台独立遮罩合同验证
mask-rgb.png: 从原合成alpha反转得到的同尺寸黑白PNG，白色为编辑区
reference.png: 512px合成花瓶参考图，仅用于验证现有BiRefNet与双参考执行链
runs.json: 本次测试Prompt ID、参数覆盖、状态、实际产物尺寸与SHA-256；结果文件由运行回执列出
workbench-runs.json: 4190统一任务API与专用Base64客户端的双模式512px单张运行回执，保留Prompt ID/输入摘要/真实输出和本机结果状态
feishu-schema-before.json: 飞书生图记录表变更前26列的真实字段定义快照
feishu-schema-after.json: 新建六个遮罩字段及追加功能/模型选项后32列的真实回读快照
feishu-schema-changes.json: 六个新字段ID、创建/选项追加回执及旧字段/选项保留断言
feishu-test-cleanup.json: 测试隔离失误误建的3条明确标记记录删除回执与零残留查询，不涉及用户记录
feishu-workbench-runs.json: local.2原图档双模式真实任务到MaaS及自动飞书同步成功回执，含实测裁剪宽高与结果摘要
feishu-prompt-output.png: 新版本原图档提示词模式的真实512×512输出
feishu-reference-output.png: 新版本原图档参考模式的真实512×512输出；仅验证执行和归档，不作为替换质量通过
feishu-record-readback.json: 两条新版本任务的飞书完整记录回读，包含六列、实际Prompt/参数与四类附件元信息
feishu-attachment-roundtrip.json: 两模式共7个附件从飞书下载后与提交字节逐一核对SHA-256和大小的回执
feishu-lamp-backfill.json: 用户已有换灯结果按原local.1同次MaaS History恢复并补归档，记录真实尺寸、输入来源和时延口径
feishu-lamp-readback.json: 换灯结果飞书完整记录回读，保留旧版本/1536推理与1536×2105结果，原图/遮罩/结果三列齐全
feishu-lamp-roundtrip.json: 换灯原图、遮罩与结果从飞书下载后逐一核对SHA-256和字节数的回执
feishu-runtime-final.json: 最终4190新进程的local.2配置、静态入口与旧数字尺寸请求400阻断，以及源码指纹
workbench-prompt.png: 工作台提示词512px单张实际输出，视觉确认冰箱被移除
workbench-reference.png: 工作台原中文参考指令512px单张输出，花瓶已生成但仍有原冰箱残留，不能作为物体替换质量通过
workbench-default-reference.json: 工作台默认英文参考指令/1536px推理/单张输出的真实任务回执，以status及outcomeStatus为准
workbench-default-reference.png: 默认英文参考模式的实际1536×1536输出，由512px合成原图经原preresize及1536局部推理后回贴
workbench-entry.png: 实际4190主工作台入口截图，显示双模式、默认参数与中央遮罩工作区，未伪装为上传实测
ui-harness-evidence.json: 同一正式控制器的真实浏览器矢量笔画/原尺寸Canvas/撤销/擦除/双模式回读，明确与主页面文件选择器证据分离
harness-ui.jpg: 临时开发测试页的真实遮罩画布截图，测试页面与标签已清理，不冒充主工作台上传完成
verification.md: 本地测试入口、API/MaaS出图、浏览器画布/输入自动化限制、专项回归和质量边界的最终核验记录
prompt-1.png: 原中文短指令第一张输出，节点执行成功但仍保留冰箱
prompt-2.png: 原中文短指令第二张输出，节点执行成功但仍保留冰箱
prompt-english-1.png: 同种子明确英文移除指令的第一张回归输出，已视觉确认移除冰箱
prompt-english-2.png: 同种子明确英文移除指令的第二张回归输出，已视觉确认移除冰箱
reference-1.png: 参考图版第一张真实输出，已视觉确认替换为花瓶
reference-2.png: 参考图版第二张真实输出，已视觉确认替换为花瓶

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

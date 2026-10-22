# janus-outpaint/
> L2 | 父级: ../CLAUDE.md

成员清单

qwen.png: Qwen接入Janus后的真实扩图成品，尺寸与质量以validation.json为准
flux.png: Flux增加实际Prompt回传后的真实扩图成品，生成配置沿用原值
qwen-prompt.txt: Qwen同次History捕获的固定扩图约束与Janus场景描述全文
flux-prompt.txt: Flux同次History捕获并透传给编码器的Janus全文
qwen-summary.json: Qwen请求/模型/实际Prompt/产物指纹/耗时摘要，不含Base64
flux-summary.json: Flux请求/模型/实际Prompt/产物指纹/耗时摘要，不含Base64
qwen-sync.json: Qwen新记录的真实飞书同步回执
flux-sync.json: Flux新记录的真实飞书同步回执
validation.json: 两引擎执行/产物/提示词及飞书实际字段回读核验，不能由自动化代替画质验收
tests.log: 本轮全量自动化测试记录，不消耗GPU
CLAUDE.md: Janus接入与真实Prompt归档验证证据地图

原Flux内部已生成Janus提示词，但未返回正文，旧归档字段为空。新流程使用SaveText保存并透传同一正文，History输出经元数据进入飞书最终Prompt；Qwen还拼接固定扩图约束。正文缺失必须留空并标未捕获，不事后补造历史内容。

2026-10-19真实GPU各1次：Qwen输出1536×2048、最终Prompt 1353字符、记录reczz28P8G9gC4Vt；Flux输出1024×768、最终Prompt 422字符、记录reczz28P8HvQWyYl。使用用户身份按记录ID定向回读最终Prompt/生成参数/模型/功能，两条Prompt均与实际History正文逐字相同，captured=true，产物SHA-256一致。812项自动化通过。运行态Flux2026-10-19.1/Qwen2026-10-19.3均available=true；画质只观察该样本，不外推4K和多场景。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

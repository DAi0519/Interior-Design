# review/
> L2 | 父级: ../CLAUDE.md

成员清单
sunburst-outpaint/: 2026-10-12 Sunburst真实单次扩图原件，1536×1024与34.120秒；中心非逐像素保留，不能称严格保真，详见sunburst-outpaint/CLAUDE.md
qwen-outpaint/: 2026-10-15 Qwen两次真实生成与归档原件；旧1K级样本，不代表当前多场景或4K表现，详见qwen-outpaint/CLAUDE.md
qwen-outpaint-alignment/: 2026-10-19 Qwen同尺度修复的用户源图与真实前后结果；source.jpg被独立多角度预览脚本读取，保持原路径原字节，详见qwen-outpaint-alignment/CLAUDE.md
qwen-outpaint-seam/: 2026-10-19 Qwen去回贴的真实完整解码图和2K成品，68.982秒；缝减轻但未称完全无缝，详见qwen-outpaint-seam/CLAUDE.md
janus-outpaint/: 2026-10-19 Qwen与Flux真实成品及实际Prompt/飞书身份；原字段已合并validation，不外推多场景画质，详见janus-outpaint/CLAUDE.md
effect-beautification/: 2026-10-23低自然/高冷两次真实canary与共同源图；专属图执行归档通过，不等于六预设画质验收，详见effect-beautification/CLAUDE.md
cabinet-geometry/: 空房v34真实任务/Prompt/归档与几何审查；柜体部分改善，原结构保真未通过，详见cabinet-geometry/CLAUDE.md
room-renovation/: 旧房两阶段实际样本身份与合同验证，模型质量与界面显示分别判断，详见room-renovation/CLAUDE.md
CLAUDE.md: 真实生成关键原件与最小验证身份的唯一目录索引

历史界面/离线合同边界：AI编辑/模型标签/扩图Beta/样本复用/侧栏溢出/相机球/缩放构图等旧验证仅覆盖对应界面或离线合同，不代表新增GPU画质；旧截图、逐次测试日志、机械检测和重复回执已收走。扩图固定2K、原比例和Qwen实体JSON导入的历史验证结论见docs/image-outpaint-interactive-canvas.md及workflows/README.md，不再保留独立过程目录。精模光影旧UI与资产替身验证没有真实双图生成，不能据此宣称结构或光照质感已验收。

运行依赖：qwen-outpaint-alignment/source.jpg仍是scripts/multi-angle-preview.mjs的原路径样本；文件SHA未改变。各真实生成模块仅保留模型原件/必要源图和单份validation，旧receipt/summary/Prompt正文已合并到该文件的_retainedEvidence字段。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

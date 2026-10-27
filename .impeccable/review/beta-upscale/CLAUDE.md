# beta-upscale/
> L2 | 父级: ../CLAUDE.md

成员清单
desktop.png: 1440×900桌面AI超分配置、六工作流多选及双阶段监控截图
mobile.png: 390×844窄屏AI超分配置与目标长边/KS2X说明截图
detector.json: 变更界面的一次静态设计扫描；HTML解析依赖缺失时为降级结果，不代表完整视觉通过
tests.log: 本次971项全量自动化测试日志，不提交真实GPU任务或飞书结果
ks-output-size-main.png: 2026-10-21主工作台KS直入输出尺寸菜单，原图2倍/4K/6K与6K选中态
ks-output-size-beta.png: 2026-10-21 Beta两套KS统一6K配置及40张待运行预估，未提交任务
ks-output-size-options.png: 2026-10-21 Beta原图2倍/4K/6K菜单与6K选中态
ks-output-size-validation.json: 2026-10-21尺寸改造的运行目录、浏览器、自动化及真实跑图验收边界
ks-output-size-tests.log: 2026-10-21尺寸改造后1013项全量测试通过日志
ks-6k-oom-diagnosis.json: 2026-10-21真实864×1184输入到4484×6144目标的KS直入DiT显存不足；节点参数/旧成功样本/同目标图差分及因果边界，未重新提交GPU
ks-always-tiled-validation-20261026.json: v0.1.18/KS26.2全档统一分块、1118测试与4项真实HTTP边界/PNG/History核验，受信旧批次恢复及发布前边界回执
ks-whole-area-validation-20261026.json: v0.1.19/KS26.3整图严格20MP补齐预算、1123测试与4项真实执行；B/C另存模型原件核验实际推理尺寸，6K插值交付和旧分块恢复边界分开
CLAUDE.md: 本次AI超分接入的验证证据地图

初次接入验证（历史）：六工作流目录真实ComfyUI只读能力全部可用；独立Beta三表Schema及新增功能/模型标签完成实时回读；浏览器验证多选、当时KS固定2X、混选长边与刷新恢复、桌面/窄屏布局。未替用户启动真实批次，画质与真实任务归档仍需实际跑图验收。

2026-10-21尺寸改造验证：4187预览的主工作台与Beta目录均回读KS原图2倍/4K/6K，六候选Beta能力可用；浏览器验证主工作台KS直入6K、Beta两套KS三档菜单、混选只用4K/6K。1013项全量测试通过，覆盖节点参数、真实PNG替身经执行服务到归档及历史2X恢复；没有提交真实GPU任务或写入飞书，本轮不宣称6K显存、真实输出像素、画质和耗时通过。

2026-10-26后续纠正：用户要求撤掉外部画面切块，v0.1.19/KS26.3改为ceil16补齐后的整图面积严格低于20MP；保留所选2X/4K/6K交付，超限推理后Lanczos恢复并明确非原生6K。1123测试、4项唯一GPU通过，B/C额外保存原生推理PNG核验；正式图唯一Save76且无Split/Merge，VAE内部1024/128保留，旧26.2仅恢复原结果。新回执见ks-whole-area-validation-20261026.json。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

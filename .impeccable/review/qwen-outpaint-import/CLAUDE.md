# qwen-outpaint-import/
> L2 | 父级: ../CLAUDE.md

成员清单

imported.png: 用户当前ComfyUI通过Ctrl+O真实载入修订图后的27节点画布，仅剩原图未选择的正常输入提示
validation.json: 文件SHA-256、下载副本、前后导入问题、独立FP32与运行BF16边界、824项回归和未实跑范围
tests.log: 本轮824项自动化回归，全通过，不代表新增GPU出图
CLAUDE.md: 独立工作流文件打开与当前模型目录匹配的证据地图

同一份原JSON实际能通过本地文件选择器载入。用户拖拽静默的准确来源未确认；官方前端存在无File或无法读取URI时静默退出的路径，因此说明改为优先Ctrl+O或Finder/资源管理器实体文件。当前浏览器服务器缺BF16命名但存在同版FP32，独立导入图已匹配，运行图不改。未点击运行，也没有上传用户照片或写飞书。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

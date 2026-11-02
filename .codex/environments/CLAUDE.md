# .codex/environments/
> L2 | 父级: ../CLAUDE.md

成员清单
environment.toml: Codex运行与停止动作；运行只发送短命令调用脚本，停止通过launchctl管理
run-workspace.sh: macOS启动实现；复用launcher.resolvePort与现有服务，缺服务才launchctl启动，带超时的有限轮询后打开入口
CLAUDE.md: 桌面运行环境成员地图

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

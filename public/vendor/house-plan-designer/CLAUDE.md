# house-plan-designer/
> L2 | 父级: ../CLAUDE.md

成员清单
editor.html: CSP 兼容入口，只引用同源外部脚本和样式；干净预设由 bootstrap 注入
bootstrap.js: 启动前消费单次单层方案、空方案回退、禁用上传/网络，Ctrl/Cmd+S 阻断原保存并交给宿主
engine.js: 固定 commit 的第三方内联模块逐字提取，含 Three.js/参数家具/2D编辑/3D，不承担 AI 生图
engine.css: 固定 commit 的第三方内联样式逐字提取
integration.css: 平面保留墙门窗/家具/属性，3D 隐藏编辑侧栏和工具栏，隐藏工程/导入/中控及重复保存导航
LICENSE: 上游 MIT 版权和再分发条款原件
provenance.json: 上游 commit、模板字节/SHA、提取后源码 SHA 与验证边界
CLAUDE.md: 本目录地图与第三方更新约束

第三方例外：engine.js/engine.css 是上游打包构建产物，不按业务源码 800 行限制拆分，不修改压缩符号。更新必须同时更新固定 commit、SHA、许可证和父页桥接合同测试。原始 TypeScript 工程不在上游仓库；可运行现有能力不代表可维护其内部源码。

唯一入口为 editor.html?debug=1；调试对象仅供同源 floor-plan-engine.js 的受控直接调用，不注册跨来源消息执行器。空间截图是原生 Three.js 视图，非 AI 照片。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

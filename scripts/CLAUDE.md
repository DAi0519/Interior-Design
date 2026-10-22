# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单
multi-angle-preview.mjs: 本机4175摄影机球试跑服务（静态复用主工作台camera-sphere交互与camera-sphere-scene绘制），复用ComfyUI客户端/异步任务/图片校验，20MB上传/30MB请求及大图压到长边2K直接推理、可固定种子的单张提交、请求幂等、原件/压缩输入/产物留存与原图对比

CLAUDE.md: 本模块地图，维护源码发布工具成员清单
export-qwen-outpaint.mjs: Qwen 扩图执行图的独立 ComfyUI 画布/API 导出器，复用2026-10-20.1运行25/独立26节点真源，Janus原文直连SaveText/positive且question不变，不含固定前缀/Scene continuation或StringConcatenate，保留同尺度推理/同步mask/整图恢复且不回贴原图，独立图替换原生上传/16对齐预处理与同版FP32 LoRA，并显式flow及SaveImage原生输出，支持GetImageSize与INT/STRING控件转链接端口，不携密钥或图片
release-files.mjs: 发布白名单纯规则，维护运行文件准入、SemVer 校验与确定性产物命名
release-files.test.mjs: 发布白名单、开发文件排除、必需文件和稳定命名的无副作用单元测试
release-check.mjs: 发布准入门，验证干净提交、macOS 启动权限、package/lock、疑似密钥与测试，且一次汇总全部 800 行上限/L3 契约问题并带有限重试地审计生产依赖
release-check.test.mjs: 发布准入与有限重试测试，覆盖全部超限文件聚合、macOS 启动权限、瞬时失败恢复和连续失败阻断
release-pack.mjs: 发布编排器，以 Git archive 生成源码快照，在临时目录带有限重试地执行真实 npm ci/启动冒烟后输出 ZIP、SHA-256 与清单
release-publish.mjs: GitHub 发布编排器，拒绝重复版本，用 package 版本亮点生成文案，创建草稿 Release 并核对提交、状态、附件大小与 SHA-256，转正式后清理本地制品
release-publish.test.mjs: GitHub 发布纯规则测试，覆盖版本占用、版本亮点文案及 Release 提交、状态、大小与摘要一致性，不执行外部写操作

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

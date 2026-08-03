# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单

CLAUDE.md: 本模块地图，维护源码发布工具成员清单
release-files.mjs: 发布白名单纯规则，维护运行文件准入、SemVer 校验与确定性产物命名
release-files.test.mjs: 发布白名单、开发文件排除、必需文件和稳定命名的无副作用单元测试
release-check.mjs: 发布准入门，串行验证干净提交、macOS 启动权限、package/lock、800 行上限、L3 契约、疑似密钥、测试和带有限重试的生产依赖审计
release-check.test.mjs: 发布准入与有限重试测试，覆盖 macOS 启动权限、瞬时失败恢复和连续失败阻断
release-pack.mjs: 发布编排器，以 Git archive 生成源码快照，在临时目录带有限重试地执行真实 npm ci/启动冒烟后输出 ZIP、SHA-256 与清单
release-publish.mjs: GitHub 发布编排器，拒绝重复版本，创建草稿 Release 并核对提交、状态、附件大小与 SHA-256，转正式后清理本地制品
release-publish.test.mjs: GitHub 发布纯规则测试，覆盖版本占用及 Release 提交、状态、大小与摘要一致性，不执行外部写操作

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

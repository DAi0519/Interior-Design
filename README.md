<!--
[INPUT]: 依赖当前工作台功能、启动脚本、连接中心、GitHub Release 更新检测和源码发布流程
[OUTPUT]: 对外提供功能简介、快速启动、连接配置、检查与下载更新及协作入口
[POS]: 项目根目录的使用与协作入口，详细契约见 CLAUDE.md 和各模块文档
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Canvas Lab

团队内部的 AI 生图与效果评测工作台，在本机运行，通过飞书管理 Prompt、样本和结果。

## 功能

- **生图工作台**：白模渲染、空房设计、精模渲染、效果图美化、全景图美化、图片超分、风格反推与自由生图。
- **Beta 跑图**：复用样本集，批量对比多个模型，结果归档到飞书。
- **模型评测**：围绕模型或 Prompt 制定对比实验，进行评分与结果分析。

## 快速启动

需要 **Windows / macOS、Node.js 24+**，以及仓库和对应飞书 Base 的访问权限。

从 [Releases](https://github.com/DAi0519/Interior-Design/releases) 下载 `canvas-lab-v*.zip`，解压后双击：

- macOS：`start-macos.command`（首次被拦截时，右键选择“打开”）。
- Windows：`start-windows.cmd`。

启动器会自动安装依赖、引导首次飞书初始化并打开工作台。

也可在项目目录执行下列命令；`npm run lark:init` 仅首次初始化飞书 CLI 时需要：

```bash
npm ci
npm run lark:init
npm start
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)，在“连接中心”完成飞书授权，按需填写自己的 OneAPI Key。

Flux 和图片超分需要能访问公司 ComfyUI 服务；自定义地址、端口和飞书资源配置见 [.env.example](.env.example)。

OneAPI Key 默认只保存在内存，选择“记住在这台电脑”后才写入 `.env.local`；请勿提交本机配置或密钥。关闭启动终端会停止服务，请先等待生成与飞书同步完成。

## 检查更新

三个工作台顶栏都有版本与更新入口。打开页面后会自动检查正式 Release，页面可见时每 30 分钟再次检查；有新版时显示提示，点击入口可查看更新说明并下载 `canvas-lab-v<version>.zip`。也可以手动“检查更新”。检测不会自动安装或覆盖项目文件。

仓库已公开，更新检测无需 GitHub 登录或额外 Token。公开接口限流或暂时不可用时，会通过公开版本页及标准 ZIP 地址再次核验；仍无法取得合格发布包时显示“暂时无法检查”，可打开 [Releases](https://github.com/DAi0519/Interior-Design/releases) 手动查看。

更新时先等待生成和飞书同步完成，再关闭旧服务，将下载包解压到新目录。需要沿用 OneAPI Key 等本机配置时，把旧目录的 `.env.local` 复制到新目录；飞书登录由本机 CLI 管理。确认新版运行正常后再处理旧目录。

## 协作

问题和建议统一提交到 [Issues](https://github.com/DAi0519/Interior-Design/issues)，写清 **版本、复现步骤、截图或样本链接、期望结果**。

原图、Prompt 和结果素材放飞书，在 Issue 中贴链接。开发修改可提交 PR 并关联 Issue，修复后由提报人复测确认。

## 开发

```bash
npm test
```

测试不会调用真实模型。维护者发布流程见 [RELEASE.md](https://github.com/DAi0519/Interior-Design/blob/main/RELEASE.md)，评测方法见 [WHITE_MODEL_BENCHMARK.md](https://github.com/DAi0519/Interior-Design/blob/main/WHITE_MODEL_BENCHMARK.md)。

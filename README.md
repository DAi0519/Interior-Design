<!--
[INPUT]: 依赖当前工作台功能、启动脚本、连接中心、GitHub Release 更新检测/受信安装和源码发布流程
[OUTPUT]: 对外提供功能简介、快速启动、连接配置、检查/下载/安装更新及协作入口
[POS]: 项目根目录的使用与协作入口，详细契约见 CLAUDE.md 和各模块文档
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Canvas Lab

团队内部的 AI 生图与效果评测工作台，在本机运行，通过飞书管理 Prompt、样本和结果。

## 功能

- **生图工作台**：白模渲染、空房设计、风格转换、精模渲染、效果图美化、效果图氛围转换、全景图美化、图片超分、AI扩图、风格反推与自由生图。
- **Beta 跑图**：复用样本集批量运行八类生图功能，包含风格转换与全景图美化；对比多个模型，结果归档到飞书。
- **模型评测**：围绕模型或 Prompt 制定对比实验，进行评分与结果分析。

**Banana 2.1** 已作为独立模型加入生图、Beta 跑图与模型评测，旧 Banana 2 保留。参数提供十四种画幅与 1K/2K/4K；不提供 512 或 2:1 全景。Beta 飞书跑图明细的“出图模型”和“Prompt融合”均使用彩色单选标签，分别记录出图模型与提示词模型。

在 **AI设计 → 风格转换** 上传一张空间图，明确选择现有平台风格，或上传一张风格参考图；可补充转换要求。未指定风格时不能开始转换。参考图只用于提取风格，原空间的结构、视角与布局保持不变。Prompt 版本、所选风格、主图、参考图及结果沿用飞书生成记录归档。

在 **AI编辑 → 图片超分** 可选择默认攸行 3B、原有 1MP/0.75MP 两套 7B，以及新增的 **SeedVR2 7B · 原图直入** 和 **KS 超分 · 2×**。常规工作流保持原图比例输出 4K/6K/8K；KS 使用 0.75MP 预处理，输出为原图宽高各两倍（输入每轴 384–3200px）。**AI扩图** 也归入 AI编辑，原有构图与模型选择方式保持不变。

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

三个工作台顶栏都有版本与更新入口。打开页面后会自动检查正式 Release，页面可见时每 30 分钟再次检查；有新版时显示提示，点击入口可查看更新说明，点击「下载安装」下载、校验并安装官方运行包。

从 Release ZIP 解压的运行目录支持**原地更新**：与同版本官方 `.sha256` 文件比对后，替换程序文件，保留 `.env.local`、本地数据和目录路径；失败时恢复旧程序。生成、评测或飞书同步未结束时会阻止安装。成功后关闭原服务，再双击原目录的启动脚本，新版依赖会按锁文件自动安装。

带 `.git` 的源码工作区采用**新目录安装**，默认放到当前项目旁的 `canvas-lab-v<version>`，可用 `.env.local` 的 `INSTALL_BASE_DIR` 指定父目录；已有目录不会覆盖。完成后手动复制 `.env.local` 到新目录，再运行新版启动脚本。

仓库已公开，更新检测无需 GitHub 登录或额外 Token。公开接口限流或暂时不可用时，会通过公开版本页及标准 ZIP 地址再次核验；仍无法取得合格发布包时显示“暂时无法检查”，可打开 [Releases](https://github.com/DAi0519/Interior-Design/releases) 手动查看。

更新前先等待生成和飞书同步完成。飞书登录由本机 CLI 管理，无需重新授权。确认新版运行正常后再处理旧目录。

## 协作

问题和建议统一提交到 [Issues](https://github.com/DAi0519/Interior-Design/issues)，写清 **版本、复现步骤、截图或样本链接、期望结果**。

原图、Prompt 和结果素材放飞书，在 Issue 中贴链接。开发修改可提交 PR 并关联 Issue，修复后由提报人复测确认。

## 开发

```bash
npm test
```

测试不会调用真实模型。维护者发布流程见 [RELEASE.md](https://github.com/DAi0519/Interior-Design/blob/main/RELEASE.md)，评测方法见 [WHITE_MODEL_BENCHMARK.md](https://github.com/DAi0519/Interior-Design/blob/main/WHITE_MODEL_BENCHMARK.md)。

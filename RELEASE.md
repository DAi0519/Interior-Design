# Canvas Lab 源码发布流程

面向维护者的源码收口流程。发布对象仍是 Windows/macOS 可运行的源码 ZIP，不把
`.codex`、测试、产品文档、本机配置、依赖目录或密钥交给使用者。

## 一次发布

1. 在独立 worktree/功能分支完成修改和验收。
2. 更新版本号并提交全部改动：

   ```bash
   npm version patch --no-git-tag-version
   git add -A
   git diff --cached --check
   git diff --cached --stat
   git commit -m "Release v$(node -p \"require('./package.json').version\")"
   ```

3. 从干净提交执行唯一打包命令：

   ```bash
   npm run release:pack
   ```

产物写入被 Git 忽略的 `dist/`：

- `canvas-lab-v<version>.zip`：交给实习生或上传 GitHub Release。
- `canvas-lab-v<version>.sha256`：ZIP 完整性校验。
- `canvas-lab-v<version>.manifest.json`：版本、Git 提交、Node 边界及文件清单。

同一提交与版本在同一 Git/Node 工具链下重复执行会生成相同 ZIP 和 SHA-256；工作区
存在任何未提交文件时会直接拒绝发布，避免打包内容与 Git 证据不一致。

## 自动准入

`npm run release:pack` 会先完整执行 `npm run release:check` 的全部门槛：

- package 与 lock 名称/版本一致，版本符合 SemVer，Node.js 为 24+。
- Git 工作区干净，`git diff --check` 通过。
- 业务源码单文件不超过 800 行，JS/MJS 具备 L3 契约。
- 发布白名单中不存在疑似私钥或常见 Token。
- `npm ci --dry-run`、自动化测试和生产依赖审计通过。
- 在临时发布快照中真实执行 `npm ci`，启动服务并读取首页及 `/api/catalog`。

生产依赖审计和快照安装会对短暂网络失败做有限重试；连续失败仍阻断发布，不会以
“离线跳过”伪造通过状态。

只想检查、不生成产物时执行：

```bash
npm run release:check
```

## 白名单边界

发布包只包含：

- `.env.example`、`.gitignore`、`README.md`、`package.json`、`package-lock.json`、`server.mjs`
- `public/` 和 `src/` 下的运行文件

所有 `CLAUDE.md`、`.codex/`、`test/`、`scripts/`、`DESIGN.md`、`design-qa.md`、
`RELEASE.md`、PRD、`.env.local`、日志、缓存、生成结果、`node_modules/` 和 `.git/`
均不会进入 ZIP。若未来新增运行时根目录或根文件，必须先更新
`scripts/release-files.mjs` 的白名单，发布检查会继续以最小暴露为默认。

## 校验与发布

macOS 校验：

```bash
cd dist
shasum -a 256 -c canvas-lab-v<version>.sha256
```

Windows PowerShell 可运行 `Get-FileHash <zip> -Algorithm SHA256`，并与 `.sha256`
文件首列比较。GitHub Release 的 Tag 应与 `package.json` 一致，例如 `v0.1.1`；
上传 ZIP、SHA-256 和 manifest 三个文件，自动 Source ZIP 不作为运营发布物。

[PROTOCOL]: 变更时更新此文档，然后检查 CLAUDE.md

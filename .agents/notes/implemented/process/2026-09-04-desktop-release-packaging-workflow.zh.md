# Agent Note: 桌面安装包改由 GitHub Actions 发布

状态：已实施

## 问题

桌面安装包此前只有本地构建：没有任何机制把它们挂到 GitHub Release，因此 v0.3.14 发布时没有桌面应用——尽管 Electron 骨架和 rc.1 运行时载荷都已就绪。用户要求由 Action 打包桌面产物并挂到这个 release 上。

## 决策

新增 `.github/workflows/desktop-release.yml`：

- 触发：每个 `v*` tag 推送（未来 release 自动携带安装包；任务会先等 release.yml 创建 Release，最长 20 分钟，主管线失败时不会留半套资产）加 `workflow_dispatch`（输入 `tag`：要挂载的 release；可选 `ref`：构建的代码树）——dispatch 路径用于给存量 release 补发；v0.3.14 用它构建 `dev`，因为 seed 升 0.3.14 的提交落在 tag 之后，而 tag 不能移动。
- 单个 `macos-latest` 任务构建全部 6 个目标：electron-builder 26 在 macOS 上原生交叉构建 Windows nsis/zip（本地实测：exe 320MB + zip 418MB，afterPack 正确 staged win-x64 载荷）；不需要 Windows runner，也不需要 wine。
- 运行时载荷在构建时从 registry 解析（`desktop/runtime/*/package.json` 的钉扎），所以 `ref: dev` 构建得到 rc.1 宿主 + 无 launcher 的 0.3.14 家族。
- `npm version <tag 去掉 v>` 仅在 runner 本地把应用版本改成与 release 一致，产物命名为 `dsh-desktop-X.Y.Z-*`，不动仓库文件。
- 上传用 `gh release upload --clobber`；并发按 tag 串行。

关键发现：前两次 dispatch 都死在 `pnpmInstall('profile-web')`，错误为 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`——0.3.14 聚合带着 `dsh-better-sidebar@0.18.0` 进入 seed 闭包，该包发布于 2026-09-03T11:40Z，而 runner 的 pnpm 11.24（仓库 pin）严格执行 24h `minimumReleaseAge` 冷却，本地 pnpm 11.9 则不执行。第一次 run 的错误被 util.inspect 字节数组转储吞掉；把 `spawnSync` 输出以文本中继后才暴露出来，修复（seed 台账补条目）记录在 seed 笔记里。两条操作教训：本地 pnpm 11.9 全绿不能证明 runner 钉扎的 11.24 会接受同一锁文件；桌面 exclude 台账在所采纳的聚合 bump 非家族传递依赖时也必须同步补条目。

## 测试

- 本地 macOS `npm run dist:win` 产出 exe/zip；`npm run build-runtime` 带重试逻辑通过；`desktop` 包测试通过。
- 工作流由 v0.3.14 的 dispatch run 端到端验证（run id 见 release）；第一次 dispatch 恰好死在 pnpm 步骤，加入重试后的第二次一路走到上传。

## 后果

- 未来 release 自动携带桌面安装包，无需手工打包；桌面运行时 staging 的旧备注（"alpha.4 直到跑 prepare-runtime"）对 release 构建而言作废——CI 永远从 registry 现场 staging。
- cloudflared 的已知限制按构建改善：每个 runner 都会 staged 自己平台的 cloudflared，mac 安装包带 darwin 二进制、win 安装包带 win 二进制。
- 如果 pnpm 校验静默失败某天不再偶发，中继出来的文本会带出真实诊断。

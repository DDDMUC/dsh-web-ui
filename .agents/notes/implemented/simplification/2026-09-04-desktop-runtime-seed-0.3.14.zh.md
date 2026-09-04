# Agent Note: desktop 运行时 seed 升到 0.3.14

状态：已实施

[desktop-launcher 移除笔记](../simplification/2026-09-03-remove-dsh-desktop-launcher.md)的后续落地——该笔记记录了桌面 seed 的 `0.3.13` 聚合仍会拉入 launcher，并会在"下一个聚合 bump 自然掉出"。v0.3.14 就是这个 bump。

## 决策

`desktop/runtime/profile-web/package.json` 将 `@linxin666/dsh-web-all` 由 `0.3.13` 改为 `0.3.14`；`minimumReleaseAgeExclude` 台账换成 `0.3.14` 的 19 个家族名，并移除已退役的 `@linxin666/dsh-desktop-launcher@0.3.13` 条目（0.3.14 闭包不含 launcher）。台账同时补上 `- 'dsh-better-sidebar@0.18.0'`：0.3.14 聚合带着 better-sidebar 升级（c22fb42d）进入 seed 闭包，而它不是家族名，只按家族名重排台账会漏掉它——desktop-release 的 CI run（33825080509）正是在这里以 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 失败，因为 runner 的 pnpm 11.24 严格执行 24h 冷却，而本地的 pnpm 11.9 不执行。`npm run build-runtime` 重新 staging：payload 为 `@deepseek-ai/dsh@0.1.2-rc.1 + @linxin666/dsh-web-all@0.3.14`，Node 发行版不变（v24.20.0，缓存命中）。

一个操作层面的小插曲：第一次 `build-runtime` 在 pnpm install 中途崩溃并吐出原始 stdout buffer；紧接着的干净重跑一次通过，因此单次崩溃先按瞬态处理，复发再查。

## 测试

- staged 树中 `@linxin666` 家族包恰好 19 个，无 `dsh-desktop-launcher`。
- `desktop/runtime/profile-web/pnpm-lock.yaml` 解析到 `@linxin666/dsh-web-all@0.3.14`。
- `git status` 仅三个 seed 源文件变更；`resources/runtime/` 保持 git-ignored。

## 后果

- 下一次桌面安装包构建（用户侧 `npm run dist`）将携带 rc.1 宿主与无 launcher 的 0.3.14 家族；打包前仓库侧已无待办。
- seed 未来每采纳一次家族发版，都要按既定模式重排 exclude 台账。

# Agent Note: market shell fast-uri 与 qs 安全升级

状态：已实施

## 问题

默认分支上有六个未关闭的 Dependabot 告警，全部位于 `market/shell/package-lock.json`：四条针对 `fast-uri` 的高危通告（< 3.1.6，经 MCP SDK 下的 ajv 到达），两条针对 `qs` 的中危通告（<= 6.15.3，经 body-parser 下的 express 到达）。两个漏洞版本都是 try-on shell 所 vendored 的 `@deepseek-ai/dsh@0.1.1-rc.2` 闭包的传递依赖，该闭包对每个 face 做精确钉扎。

## 决策

按 shell 既有的精确钉扎风格，在 `market/shell/package.json` 新增 `overrides` 块精确钉住修复版（`fast-uri: 3.1.6`、`qs: 6.16.0`），随后用 `npm install --package-lock-only --legacy-peer-deps` 刷新锁文件（6 行差异），并用同一开关同步物理树。

关键发现：**严格模式的 npm 解析在这个树上会静默失败**。`npm install`、`npm audit fix`、`--package-lock-only` 在 npm 10、11.11 与 Node 24/25 下全部以退出码 1 结束且零诊断输出——调试日志直接停在 idealTree 中途。直接调用 `Arborist#buildIdealTree` 才能拿到被吞掉的错误：`failPeerConflict`（"could not resolve"），来自一个与本次两个升级包无关的既有 peer 形状。shell 锁文件显然一直是在 `--legacy-peer-deps` 语义下维护的；今后对该项目做任何锁文件刷新都必须带这个开关。

两个包都不会进入浏览器 bundle：shell 重建后 `tryon/` 资产字节一致，`scripts/market-build` 只重写了 `manifest.js` 与三个 manifest JSON 的 `generated` 日期戳，`market:check` 通过。

## 测试

- `npm ls fast-uri qs` 显示 `fast-uri@3.1.6` 与 `qs@6.16.0`（均标记 "overridden"），无 invalid 边。
- `npm audit --legacy-peer-deps` 报告 0 漏洞（审计端点经本地 TUN 代理会抖动；遇到 "endpoint returned an error" 时重试即可）。
- `market/shell` 下 `npm run build` 退出码 0；`node scripts/market-build` + `pnpm market:check` 通过，仅日期戳漂移。

## 后果

- GitHub 重新扫描默认分支后 Dependabot 告警将关闭。
- overrides 块是常驻安全下限；将来升级 vendored `0.1.1-rc.2` 闭包（独立决策）时应复核它。
- 操作规则：shell 锁文件操作必须带 `--legacy-peer-deps`；严格模式在这个树上是一颗静默地雷。

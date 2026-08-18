# @linxin666/dsh-skins

[English](README.md) | 中文

已退役的兼容载具（保留一个发布周期）：皮肤已全部内置进 `@linxin666/dsh-client-ui-skin-center`，本包不再携带皮肤资产，仅通过依赖把皮肤中心带给升级用户。

## 是什么

- **纯依赖载具**：安装或升级本包即装上皮肤中心（`skin-center`），全部内置皮肤（xp / blue-fantasy / dragon-heir / minecraft / miku / trading / whale-song / harbor / whale-mom / matrix / maid-atelier / mint）以纯资产目录形态随它分发。
- **无构建产物**：`build.mjs` 是刻意的 no-op，没有资产可复制。
- **下个周期移除**：本包计划退役；新安装请直接用 `@linxin666/dsh-client-ui-skin-center`（或全家桶聚合包 `@linxin666/dsh-web-ui-all`）。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-skin-center
```

### 从仓库安装（开发调试）

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/skins/skin-center
```

在 GUI 一级菜单「皮肤中心」里切换皮肤，或用 `dsh-skin use <id>`；同一时刻只激活一个皮肤。

## 已知限制

- 浏览器 bundle 仅面向 Web，作用域限定在 dsh web GUI。
- 皮肤只做呈现：只改浏览器 DOM，不触及模型请求。
- Maid Atelier 单独采用 CC BY-NC-SA 4.0，仅限非商业使用；完整许可与署名随皮肤中心包内的皮肤目录分发。

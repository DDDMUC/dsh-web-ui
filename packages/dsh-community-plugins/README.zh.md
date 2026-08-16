# @linxin666/dsh-client-ui-community-plugins

[English](README.md) | 中文

面向 dsh web GUI 设置页的社区插件索引卡：列出社区贡献的插件并链接到每位贡献者自己的仓库，配有自己的启用开关，位于插件配置区。

## 功能

- **顶层卡片**：在设置页插件配置区注册一张卡片（与 Web UI 插件组卡片和内置卡片同级），自带启用开关，由 community-plugins 设置命名空间持久化。
- **只做索引**：每个条目链接到贡献者自己的仓库；本包不打包任何被索引的代码。注册表在 community.json，由 scripts/community-index 编译进客户端 bundle。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-community-plugins
```

### 从仓库安装（开发调试）

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-community-plugins
```

安装后重启 `dsh web`，设置页出现该卡片。

## 配置

- **启用开关**：设置 > 插件配置 > Community Plugins。关闭后隐藏索引列表，重新打开即恢复；选择持久化在 community-plugins 设置命名空间。

## 已知限制

- 仅当依赖的 `@deepseek-ai/dsh-client-ui-settings` 存在时，该卡片才会出现在 dsh 设置页。
- 条目由维护者在 community.json 中登记审核，卡片展示构建时的快照。

## License

BSD-3-Clause。

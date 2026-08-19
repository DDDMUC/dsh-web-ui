# @linxin666/dsh-client-ui-community-plugins

[English](README.md) | 中文

面向 dsh web GUI 设置页的社区插件市场分区：作为一级菜单项（与 Web UI 插件、皮肤中心、宠物同级）直接展开，以插件市场风格网格展示社区贡献的插件（搜索框、分类筛选胶囊、卡片），并配有自己的启用开关。当安装了配套的「插件管理器」插件（`@linxin666/dsh-client-ui-plugin-manager`）且浏览器为本机访问时，卡片可直接在界面内安装与卸载条目；否则分区退化为只读索引，每张卡片保留一键复制安装命令按钮。

## 功能

- **一级菜单项**：在设置页注册一个一级分区，与通用设置 / 模式 / 插件 / Agent 预设以及 Web UI 插件、皮肤中心、宠物同级；内容直接展开（无折叠层），自带启用开关，由 community-plugins 设置命名空间持久化。
- **市场风格展示**：条目以可搜索、可按分类筛选的卡片网格呈现——按名称 / 简介 / 作者的搜索框、带各分类计数的筛选胶囊，以及双列卡片布局（名称、npm/仓库标记、`分类 · 作者` 元信息行、两行简介与仓库链接）。
- **界面内安装与卸载**：当插件管理器插件提供 `pluginManager` cordis 服务且该服务报告为回环访问（本机浏览器）时，每张卡片提供「安装」按钮（轮询宿主进度，实时显示 获取信息 / 下载 / 解压 / 写入 阶段行）、「已安装 · 重启后生效」徽标，以及带确认对话框的「卸载」按钮。安装与卸载都经由插件管理器自身的通道写入，因此卡片与「插件管理」标签页保持同步（通过服务的变更订阅）。同一时间只允许一个变更操作；进行期间其他卡片的操作按钮禁用。
- **优雅降级**：未安装插件管理器插件、或从远程（非回环）浏览器访问时，分区呈现与此前完全一致的只读索引——所有状态下每张卡片都保留「复制安装命令」兜底按钮，并以一行提示说明如何启用界面内安装。
- **只做索引**：每个条目链接到贡献者自己的仓库；本包不打包任何被索引的代码。注册表在 community.json，由 scripts/community-index 编译进客户端 bundle。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-community-plugins@latest
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

- **启用开关**：位于「社区插件」一级分区自身（分区卡片自带的开关）。关闭后隐藏索引列表，重新打开即恢复；选择持久化在 community-plugins 设置命名空间。
- **分类筛选**：条目可在 community.json 中带 `category`（固定市场分类之一：`ui`、`agent`、`tools`、`knowledge`、`integration`、`security` 或 `utility`），卡片将它们渲染为带计数的筛选胶囊，并提供按名称 / 简介 / 作者搜索的搜索框；每张卡片上的「npm 已发布 / 仓库安装」标记来自 `npm` 字段。
- **运行已登记的插件**：已安装插件管理器插件且使用本机（回环）浏览器时，直接点击卡片上的「安装」——条目已发布 npm 时用包名，否则用贡献者仓库地址。未安装时，复制卡片上的安装命令到终端执行，如 `dsh plugin --profile web add <包名>`。两种方式都在重启 `dsh web` 后生效，随后插件自带的开关与配置（若有）出现在插件配置区。从卡片卸载同样需要确认，同样在重启后生效。

## 已知限制

- 仅当依赖的 `@deepseek-ai/dsh-client-ui-settings` 存在时，该卡片才会出现在 dsh 设置页。
- 界面内安装 / 卸载依赖插件管理器插件（`@linxin666/dsh-client-ui-plugin-manager`）与本机浏览器；远程浏览器只能得到只读的复制命令索引。
- 从卡片发起的安装与卸载在重启 `dsh web` 后才生效（卡片上的「已安装」徽标已注明）。
- 条目由维护者在 community.json 中登记审核，卡片展示构建时的快照。

## License

BSD-3-Clause。

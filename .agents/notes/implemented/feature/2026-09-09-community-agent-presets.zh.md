# Agent Note: Community agent presets distributed through the Workshop

Status: implemented

## Problem

一个 agent preset 就是一个会话运行的组合：它的工具、prompt section 与 skill 全部来自 preset 目录里的 `agent.cordis.yml`。此前 roster 只有两个来源——`@deepseek-ai/dsh-agent-presets` 内置随包发布的 preset，以及用户手工放进 `$DSH_HOME/.agent-presets` 的目录——官方「设置 → Agent 预设」只提供复制、删除、设默认和打开目录。没有目录浏览、没有下载、没有启用/禁用，社区作者除了「请把这些文件拷进你的 DSH home」之外没有任何分发路径。

创意工坊（`dsh-market`）对皮肤与宠物已经解决了同样的形态：dsh-market.com 提供 manifest，loopback-only 的 host 网关把一个资产下载进对应的 DSH home 目录并写入逐文件 sha256 provenance，再由各自的设置面管理已安装内容。preset 域的两个性质使得照抄皮肤流程是错误的：

- **preset 是代码，不是资源。** 组合里可以写相对路径文件（`name: ./tool-bootstrap.mjs`），也可以写 `!!js` 表达式；两者都会在会话由该 preset 组合时于 DSH host 进程内执行。官方包对此的表述很直白：preset 拥有与 shell 访问同等的信任。因此「安装」绝不能等同于「运行」。
- **官方 roster 没有禁用状态。** 任何发现根下的目录都会被列进「设置 → Agent 预设」，并被新建会话的选择器提供；而 discovery 每次调用都重读根目录。所谓「禁用」只能等于「不在任何发现根里」，所以需要显式的双目录存储契约，而不是一个标记文件。

## Decision

社区预设作为第四种市场资产类别（`preset`）由 dsh-market.com 分发，在创意工坊卡片的**预设 / Presets** 标签页中管理，并以「安装」与「启用」的分离作为信任边界。

### Storage and state contract

`$DSH_HOME` 下的两个目录，两者都作为跨包契约记录在案：

| 路径 | 含义 |
| --- | --- |
| `agent-presets/<id>/` | **库**：已安装但 inert。没有任何发现根扫描它，其中的内容永不被加载。携带 `dsh-market.provenance.json`。 |
| `.agent-presets/<id>/` | **发现根**：官方 roster 已经扫描的 harness-home 用户根。存在即启用。 |

状态每次读取都从文件系统推导，不依赖私有账本：库有根无 = 已安装未启用；反之为已启用；两者都有 = 冲突，面板报告并由卸载修复；两者都无 = 未安装。安装把市场资产下载进库（原子 staging + rename、逐文件 sha256，永不直接落入发现根）；启用把目录移入发现根；禁用移回；卸载删除存在的副本；更新重新下载进库，若已启用则同一次操作内替换发现根副本。移动是原子 rename，跨卷降级为复制-校验-删除，并对 Windows 瞬时句柄失败做短暂重试。更新只提示：卡片显示可用版本，由用户触发。

### Trust model

- 安装与启用是两个动作、两次授权。库在构造上就是 inert 的；启用才是代码可能运行的时刻。
- 网关拒绝启用 id 已被内置或配置根提供的预设（那些根在发现顺序上优先，启用会看起来成功却毫无作用），也拒绝禁用或卸载 `agent-presets` 默认值指向的预设——默认值指向不存在的预设会让每个新会话创建失败。提示引导用户先去「设置 → Agent 预设」改默认。
- 每张卡片显示由 host 从**已安装字节**算出的**组合画像**：它组合的插件名、是否携带本地代码文件（`.mjs`/`.js`）、相对路径行或 `!!js` 表达式、依赖是否可解析。只要携带任何执行面，启用前就必须显式确认；只读查看器可阅读组合内容。
- 启用前校验、失败回滚：移动之后，roster 报告为 broken 的预设会被移回库并返回原因，而不是留下半启用状态。
- provenance 是完整性锚，与皮肤一致：安装时记录市场版本与逐文件 sha256，字节不再匹配时报告「本地已修改」，且绝不静默覆盖本地修改过的预设。
- 路由只应答 loopback 请求；没有市场 provenance 的目录不可触碰：被标注为未托管，并被禁用、卸载与安装拒绝。

### Market channel and publishing

- 本仓库内的唯一事实源：`packages/dsh-preset-center/presets/<id>/`（预设目录本身）加 `presets/catalog.json`（作者、版本、标签、英文展示文案、排序）。预设 id 必须符合官方规则 `^[a-z0-9][a-z0-9-]*$`。
- `scripts/market-build` 产出 `market/dist/manifest/presets.json` 与 `market/dist/assets/presets/<id>/`，并校验每条 catalog 条目（id 规则、保留的内置 id、组合与元数据文件存在、`preset.yml` 的 name 可读），使坏 preset 无法发布。中文展示文案取自 `preset.yml`，因此 roster 与商店不会互相矛盾；catalog 承载英文文案与市场元数据。
- `market/worker` 的资产白名单把 `preset` 映射到 `/manifest/presets.json`，匿名点赞与安装计数继续有效。

### Ownership and UI

- `@linxin666/dsh-client-ui-preset-center` 拥有 preset 域：host 侧库状态机、`/api/preset-center/*` 的 loopback-only 路由、组合画像与面板组件。
- `dsh-market` 继续拥有商店外壳与下载：安装器新增 `preset` 类别（目标目录 = 库），卡片声明 keyed 子槽位 `dsh-workshop.panel` 并按类目渲染一格。卡片以 owner props 传入目录记录、网关与安装上报，因此商店对所有类目只做一次清单抓取、只维护一个网关；预设面板拥有它们背后的类别专属状态机。
- 只有已启用的预设出现在「设置 → Agent 预设」——这是构造性的：官方分区列出的正是发现根，而禁用预设位于发现根之外。不存在新增的一级设置分区，因此同一个 roster 永远没有两个管理面。
- 官方分区只在自身动作、`settings/document-updated` 与 `connection/reset` 时重读；工坊的文件移动不会触发其中任何一个，因此面板会告知用户：刷新页面后新启用的预设才会出现。

## Alternatives considered

**直接安装进 `$DSH_HOME/.agent-presets`，把「不在」当作禁用。** 这是对官方模型最简单的映射，也省掉了第二个目录。被否决的原因是它摧毁了两步授权：一次点击就会把可执行组合放进发现根，下一个会话就能由它组合。它还让「已安装但未启用」无法表达，而这正是安全浏览目录所需的状态。

**发现根内的标记文件（`.disabled`）。** 否决：官方 discovery 不读它，禁用预设仍会出现在「设置 → Agent 预设」并被选择器提供——正是本功能必须避免的结果。

**patch host 组合，自建发现根（`includeUserRoot: false` 加两个 root）。** 否决：这是对另一个插件配置的侵入式改写。它必须与交易 profile 的 `~/.dsh-trading-presets` 根、`dsh-liangshen` 同步进来的预设共存，还会把「禁用集合」变成由我们维护的第二个事实源。

**把库目录符号链接进发现根。** 否决：Windows 下创建符号链接需要提权或开发者模式，而发现根里仍然是一个目录项，相对真实目录移动没有收益。

**把预设做成 npm 插件包分发（`dsh-liangshen` 形态）。** 否决用于社区分发：它把预设内容绑在 profile patch 与 npm 安装上，需要重启 DSH 才生效，且 roster 没有逐项启用/禁用面——与本功能所模仿的工坊体验正好相反。

**让 `dsh-market` 拥有全部功能，不新增包。** 否决：商店会吞下 preset 域的状态机、护栏与组合画像，且未来每增加一种可管理资产都会继续膨胀。子槽契约让商店保持为目录，让领域拥有者保持为领域拥有者。

## Consequences

- 创意工坊卡片多出第四个标签页；未安装预设中心时渲染兜底提示而不是面板，因此商店是降级而非损坏。
- 启用后新会话立即可用（discovery 每次调用都重读根目录），但官方设置分区可能需要刷新页面才会显示。
- 禁用或卸载不会影响已经由该预设组合的会话——会话的组合在创建时固定。
- 目录出厂为空：`packages/dsh-preset-center/presets/catalog.json` 是发布源，首个发布的预设决定审查门槛。组合文件的审查质量仍是人工流程；确认门与 provenance 降低的是误操作风险，不是恶意意图。
- 用户可能在官方分区或手工删掉已启用预设；此时面板报告为未安装，因此「卸载」与「被别处删除」在设计中不可区分。
- host 进程仍持有句柄时移动目录可能在 Windows 瞬时失败；移动路径会重试并报告写入错误，而不是留下半成品状态。

## Testing

- `packages/dsh-preset-center` 覆盖状态机（安装/启用/禁用/卸载、冲突、未托管拒绝、原子移动）、provenance 完整性、组合画像、真实 HTTP 服务器上的 loopback 网关（确认门、被遮蔽 id、默认预设拒绝、broken 回滚、roster 不可用）以及面板（状态徽标、安装/启用/禁用流程、确认弹窗、空目录与网关不可用降级）。
- `packages/dsh-market` 覆盖 `preset` 安装类别（库目标、发现根不受影响、记录资产版本、id 规则）、网关 `install-preset` 路由、卡片预设标签页的 owner props，以及分区的子槽声明。
- `scripts/market-build` 每次构建都校验目录；`pnpm market:check` 用全新构建比对提交的 `market/dist`。

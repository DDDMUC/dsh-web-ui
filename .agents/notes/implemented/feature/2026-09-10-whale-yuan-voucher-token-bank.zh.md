# Agent Note: Token 银行页签与鲸元券（dsh-usage）

Status: implemented

## Problem

使用统计分区把 tokens 渲染成管理报表——合计、条形图、套餐窗口，没有任何值得分享的东西：一个在 DeepSeek 官方 API 上烧掉数千万 token 的用户，拿不出一件有趣的凭证。所有者想要一个专门面向 DeepSeek 官方提供方（插件唯一计价家族）的、可分享的趣味花销凭证：一张钞票样式的「鲸元券」，面额就是真实用掉的 token 数，由真实台账数据生成，可导出为图片。

## Decision

分区在用量与个人套餐旁长出第三个页签 Token 银行。

### 数据路径

overview 文档新增可选的 `usage.all` 窗口：整个保留台账（`retainDays` 内的每一天，含今日）按 provider 聚合，复用趋势图同一个 `summarizeDays` 折叠。该字段在 wire 类型上可选，旧宿主文档只让页签退回 30 天 `range` 窗口，不会坏。卡片把 DeepSeek 官方家族行求和（`deepseek` 目录别名与运行时路由 `deepseek-official`，与消费估算同一家族判定）；其他 provider 永不铸造。家族 token 为零时渲染空状态，而不是一张零面额钞票。

### 票面绘制

钞票图（`assets/jingyuan-note.jpg`，1400x714，以生成的 base64 data URL 模块内联进 bundle）画上 canvas 后，绘制逻辑在「鲸元券」大字下方的空白带印三行与语言无关的文字：面额（完整数字加千分位，自动缩小到避开右侧红印）、`tokens` 小字，以及印泥红的序列号行 `NO.<tokens mod 1e9 补零> <from> - <to>`。canvas 上没有中文也没有词典：分享出去的图不需要翻译，i18n 审计也不进入导出路径。全部几何按钞票图尺寸等比计算，换一张分辨率重生成资产后自动回流。

### 分享

保存按钮把 canvas 导出为 PNG 下载（`dsh-whale-voucher-<to>.png`）；分享按钮仅在 `navigator.canShare` 接受文件时出现，把同一张 PNG 交给系统分享面板。两者都读已画好的 canvas，任何数据都不上传。

## Alternatives considered

- 不带图，整张钞票用代码绘制（SVG/CSS）。否决：趣味性就在所有者的原图上，代码复刻是另一个更差的东西。
- 钞票图由宿主路由下发而不是内联。否决：为约 200 KB 的资产新增二进制路由、files 白名单与聚合安装路径问题，不如让 bundle 直接携带、不加新面。
- 把鲸元券放进现有用量页签。所有者否决：该页签已经很密，独立第三个页签让这个小玩具可发现，也不与正经数字混在一起。
- 面额用 CNY 消费估算而非 token 数。否决：「用了多少 token」才是诉求，CNY 已在用量页签；卡片仍同时展示铸造 tokens 与成本估算行。

## Consequences

- overview wire 文档多一个可选字段；不同版本的宿主与客户端互通（旧宿主退回回落窗口，旧客户端忽略 `all`）。
- client bundle 因内联图增大约 300 KB（base64）；分区每页只解码一次，且仅在 Token 银行页签打开时重绘。
- 票面面额只覆盖保留窗口：被 `retainDays` 清理的天同时退出趋势图与票面，README 已写明。
- 更换钞票图是生成模块头注释里写明的两步（把新 JPEG 放进 `assets/`、重新生成 data URL 模块）；绘制按新几何回流。

## Testing

- `tests/voucher.spec.ts`：家族求和（别名合并、其他 provider 忽略、缓存 token 计入）、面额格式化、确定性序列号。
- `tests/section-card.spec.tsx`：Token 银行空状态、来自 `usage.all` 的铸造行、旧宿主无聚合时的 `range` 回落；`navigator.canShare` 缺失时分享按钮不出现。
- `tests/usage-service.spec.ts`：全台账聚合越过 30 条趋势窗口上限并与持久化天一致。
- 票面构图经视觉验证（真实绘制路径的无头 Chrome 截图，含 42 / 999,999,999 / 1,234,567,890 token 极端值）；canvas 像素不做单测。

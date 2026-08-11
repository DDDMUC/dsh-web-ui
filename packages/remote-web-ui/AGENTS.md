# dsh-remote-web-ui — 仓库规则

本仓库是 DeepSeek Harness 的外部插件包（宿主仓库为 sibling 的
`test-zhu1090093659` checkout）。

- 所有产品文案遵循 harness 的 i18n 惯例：`zh` 字典为 key 源，`en` 完整对照，
  通过 `ctx.locale.register` 注册。
- 客户端 bundle 的跨包 value import 受纯度门禁约束（平台模块表 + inline-safe
  wire 层之外一律禁止）——跨插件协作走 cordis 服务或 slot。
- 安全语义（一次性令牌、撤销、gate 策略）修改时必须同步更新 README 与本仓库
  测试。

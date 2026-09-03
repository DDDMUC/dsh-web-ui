# Agent Note: dsh-annotation 社区插件 npm 包名迁移

Status: implemented

## Problem

上游插件 `dsh-annotation` 将其 npm 包名从 `@omdsh-dev/dsh-annotation` 迁移至 `@changfenhuang/dsh-annotation`（版本 1.4.5）。原 `@omdsh-dev` 包已在 npm 上下线，导致用户在创意工坊安装该插件时出现 HTTP 404 报错无法安装（Issue #1357）。

## Decision

1. 更新 `packages/dsh-community-plugins/community.json` 中 `dsh-annotation` 的 `npm` 字段为 `@changfenhuang/dsh-annotation`。
2. 运行 `node scripts/market-build` 重新生成创意工坊分发元数据清单 `market/dist/manifest/plugins.json`。

## Testing

- 运行 `pnpm --filter @linxin666/dsh-client-ui-community-plugins test`。
- 运行 `pnpm market:check` 确保清单与 `community.json` 严格对齐。
- 验证 `@changfenhuang/dsh-annotation` 在 npm registry 上能正常解析与安装。

## Alternatives considered

- 保留原有包名。拒绝：npm 上该包已不存在，所有安装均会失败。
- 在文档中提供手动安装指引。拒绝：工坊提供一键安装机制，源清单必须提供有效的包名坐标。

## Consequences

- 创意工坊用户可以正常通过最新 npm 包名一键安装 `dsh-annotation` 插件。

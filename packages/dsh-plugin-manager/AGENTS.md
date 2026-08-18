# AGENTS.md — dsh-plugin-manager

DSH web GUI plugin dsh-plugin-manager. 包级规则：只写本包特有约定，不重复根 AGENTS.md 与
packages/AGENTS.md 的全局/包级规则。

## 本包要点

- 本包在官方「插件」设置分区注册 `settings.plugins.tab` 槽位 Tab（id `family-plugins`，
  order 20，与官方安装器 Tab 并列），提供用户插件列表 / 启停开关 / npm·git 安装 /
  更新·卸载 / 安装冲突对账 / 失败修复会话。
- 安装、启停、冲突规则全部复用官方 host 通道（`/plugin-installer`、
  `/plugin-control` RPC，loopback 权威）：本包 host 半区是空 apply，绝不写 profile
  patch 文件（单一写入器纪律）。
- 目录分区：`src/index.ts` host 半区（空）；`src/client/` browser 半区（Tab UI、
  槽位注册、RPC 封装）；`src/core/` 两侧共享纯逻辑（wire 解析、冲突 diff、修复 seed）。
- wire 形状镜像官方 `ui-settings-plugin-installer` 的协议（DSH 源码 checkout），是
  契约观察而非 import；形状变化时更新 `src/core/protocol.ts` 与测试。
- 修复会话纪律：seed 文本只含安装目标、失败记录与路径，禁止追加任何密钥 / token /
  环境内容（见 `src/core/repair.ts` 头注释）。

## 提交前检查

```sh
pnpm --filter @linxin666/dsh-client-ui-plugin-manager typecheck
pnpm --filter @linxin666/dsh-client-ui-plugin-manager test
pnpm --filter @linxin666/dsh-client-ui-plugin-manager build
```

# Agent Note: dsh-web-all 降级健康检查路由单例化注册

Status: implemented

## Problem

在升级至 `@linxin666/dsh-web-all@0.3.13` 后，启动 `dsh web` 时插件树加载失败并报错：
```
Error: failed to apply loader entry web-ui-plugin-manager (@linxin666/dsh-web-all/plugin-manager): webserver: duplicate exact route "/api/dsh-web-all/degraded"
```
聚合包内包含 17 个子插件，每个家族子路径行均通过故障隔离 shell 模块（`packages/dsh-web-all/src/shell.ts`）挂载。原本 shell 的 `apply()` 函数在每次执行时，都会无条件向宿主 `webServer` 注册一次精确路由 `/api/dsh-web-all/degraded`。当加载第 2 个子插件时，宿主 WebServer 判定精确路由冲突并报错，导致插件加载中止（Issue #1363）。

## Decision

1. 在 `packages/dsh-web-all/src/shell.ts` 中为 `/api/dsh-web-all/degraded` 路由引入引用计数（`degradedRouteRefCount`）与单例状态（`unregisterDegradedRoute`）。
2. 仅当第一个 shell 条目激活时向宿主 `webServer` 注册该路由，后续子条目仅递增引用计数，不再重复注册。
3. 对 `webServer.register()` 增加防御性 try/catch 保护，确保即使发生意外路由争用，也不会抛出异常阻断故障隔离 shell 的加载。
4. 各条目通过 `ctx.effect()` 维护生命周期，仅在所有条目全部卸载（计数归零）时注销路由。
5. 重新编译 `packages/dsh-web-all` 构建产物。

## Testing

- 在 `packages/dsh-web-all/tests/shell-isolation.spec.ts` 中新增单元测试，模拟 17 个家族子路径条目连续挂载，验证 `webServer.register` 仅被调用 1 次，无重复路由报错，当有存活条目时路由持续生效，所有条目卸载后安全释放。
- 运行 `pnpm --filter @linxin666/dsh-web-all test`（4 个测试文件，18 个测试通过）。
- 运行 `pnpm aggregate:check`。

## Alternatives considered

- 为每个子插件分配唯一的子路径路由（如 `/api/dsh-web-all/<subpath>/degraded`）。拒绝：降级路由报告的是整个聚合包家族的全局降级台账，单一权威端点更简单且符合监控规范。
- 完全移除该健康检查 HTTP 端点。拒绝：doctor 诊断与外部监控依赖该 loopback 端点以非侵入方式获取健康状态。

## Consequences

- 聚合包全部 17 个家族插件在故障隔离 shell 下顺畅挂载，彻底消除重复路由冲突。
- 全局降级监控端点在聚合包任一条目存活期间保持可用。

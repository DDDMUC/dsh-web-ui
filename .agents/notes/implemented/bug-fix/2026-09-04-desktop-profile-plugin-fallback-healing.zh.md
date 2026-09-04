# Agent 决策记录：桌面端宿主 Profile 插件回退自愈与 NODE_PATH 注入

状态：已实现 (implemented)

## 问题背景

用户在桌面应用内安装第三方插件（例如 `dsh-context`）后，重启桌面端会导致宿主子进程在启动时崩溃（界面弹出报错 `The dsh host process stopped unexpectedly`），直到用户在终端手动运行一次 `dsh web` 后才能恢复正常。

深入排查根因表明：
1. 第三方 Profile 插件通常会声明 peerDependencies（如 `@deepseek-ai/dsh-client-ui-primitives`），但 Profile 的包管理器配置关闭了 `autoInstallPeers`，因此安装时不会将其直接扁平化平铺在 Profile 根级的 `node_modules` 中。
2. 官方 DSH CLI 在启动时通过 `healProfilesModuleFallback` 动态解析缺失的 peer 依赖，并在 `$DSH_HOME/profiles/web/.dsh-module-fallback/node_modules/` 下建立软链接（Junction）。
3. 桌面端内置的宿主运行时（`resources/runtime/host`）处于隔离的独立目录树中。在插件安装后的冷启动中，内置的 `healProfilesModuleFallback` 向上查找无法索引到缺失的 UI peer 依赖包，导致插件在 import 加载时抛出模块找不到异常，宿主子进程退出崩溃。
4. 当用户在终端运行 `dsh web` 时，终端 CLI 拥有全局环境与开发工作区模块源，成功创建了所需的软链接并持久化落盘，桌面端随后的启动只是借用了这些已建好的链接。

## 解决决策

1. **Fallback 软链接预自愈 (`ensureProfileFallbacks`)**：
   - 在 `desktop/src/runtime.cjs` 中实现 `ensureProfileFallbacks(home, hostRuntimeDir)`。
   - 在桌面端 `boot()` 启动宿主进程前，读取 `~/.dsh/profiles/web` 的配置及已安装插件的 `peerDependencies` 声明。
   - 从可用模块源（内置 host node_modules、`$DSH_HOME/profiles/node_modules` 以及系统全局 npm node_modules）中自动在 `.dsh-module-fallback/node_modules` 和 `profiles/web/node_modules` 中建立所需的 Junction 软链接。
2. **`NODE_PATH` 回退注入**：
   - 扩展 `desktop/src/runtime.cjs` 中的 `childEnv`，支持接收 `extraNodePaths` 并规范化 `NODE_PATH`（包括大小写变体如 `Node_Path`）。
   - 在 `desktop/src/main.cjs` 中，将内置 host 的 `node_modules`、`$DSH_HOME/profiles/node_modules` 以及系统全局 npm `node_modules` 通过 `NODE_PATH` 传入宿主进程，为 Node.js 模块解析器提供坚实的原生二级解析兜底。

## 验证情况

- 单元测试（在 `desktop/` 下运行 `node --test "tests/*.test.mjs"`）：新增了针对 `NODE_PATH` 规范化合并以及 `ensureProfileFallbacks` 软链接创建的测试用例，全部 13 项测试通过。
- 实机冷启动验证：验证了在移除软链接缓存的情况下，新逻辑直接冷启动宿主在 4 秒内成功就绪（输出 `dsh web: http://127.0.0.1:3082/?token=...`），无需任何终端 CLI 预运行。
- 本地打包更新：已重新打包并热替换本地已安装应用的 `app.asar`。

## 后续影响

- 在桌面端内安装第三方插件后，重启应用可直接平滑加载，无需通过命令行运行 `dsh web` 过渡。
- 桌面端具备完全自给自足的模块自愈与解析保障能力。

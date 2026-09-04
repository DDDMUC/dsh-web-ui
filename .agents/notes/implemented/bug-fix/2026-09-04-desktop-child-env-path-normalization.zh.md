# Agent Note: 桌面宿主 childEnv 规范化 PATH 并消除大小写变体冲突

Status: implemented

## Problem

在 Windows 下运行 Electron 桌面端并启动其内置 `dsh` 宿主子进程时，`childEnv` 构造子进程环境变量的代码如下：

```javascript
const env = { ...process.env, DSH_HOME: home };
const nodeBinDir = process.platform === 'win32' ? nodeHome : path.join(nodeHome, 'bin');
env.PATH = nodeBinDir + path.delimiter + (env.PATH ?? '');
```

在 Windows 操作系统中，系统环境变量默认键名通常为 `Path`（首字母大写）。当 Node.js 的 `process.env`（一个对大小写不敏感的 Proxy）通过展开语法 `{ ...process.env }` 浅拷贝为一个普通 JavaScript 对象时，该对象仅保留原始键名 `'Path'`。在此之前 `env.PATH` 为 `undefined`，因此后续赋值直接把 `env.PATH` 覆盖成了**仅包含 `nodeBinDir` 的路径**。

这导致对象中同时存在两个键：`Path`（包含原有系统目录）与 `PATH`（仅包含内置 node 目录）。当 Node.js 与 libuv 为 `CreateProcessW` 序列化环境块时，Windows 优先使用全大写的 `PATH`，从而导致子进程**丢失全部 Windows 系统目录**（`C:\Windows\System32`、`C:\Windows\System32\WindowsPowerShell\v1.0` 等）。

直接表现为：
1. 依赖 Windows DPAPI 解密凭据的插件（如 `dsh-chatgpt-subscription`）在调用 `spawn('powershell.exe', ...)` 时遭遇 `Error: spawnSync powershell.exe ENOENT`，致使配置页提示 `Secure credential storage could not be read`；
2. 任何插件调用的外部程序（如 `codegraph`）无法解析，在 `dsh-host.log` 中报命令未找到错误。

## Decision

1. 将 `childEnv` 抽取至 `desktop/src/runtime.cjs`，脱离 Electron 直接进行单元测试；
2. 在 `childEnv` 中跨平台扫描 `process.env` 中任意大小写形式的 `PATH`（如 `Path`、`PATH` 等）；
3. 从环境对象中删除所有现存的大小写变体键，统一赋值一个规范化的 `env.PATH`（内置 `nodeBinDir` 置于最前，后接完整的系统 PATH）；
4. `runtime.cjs` 导出 `childEnv` 并由 `desktop/src/main.cjs` 消费；
5. 修复 `resolveDshHome` 单元测试在 Windows 环境下的路径解析断言（`path.resolve('/data/dsh')`）。

## Testing

- 单元测试（在 `desktop/` 执行 `node --test "tests/*.test.mjs"`）：全部 12 项测试通过，覆盖 POSIX PATH 拼接、Windows `Path` 大小写变体规范化与清理、空 PATH 处理等边界。
- 复现脚本验证：使用规范化环境块启动子进程后，`powershell.exe` 正常调起且 DPAPI 令牌成功解密输出。

## Consequences

- 桌面版内置 dsh 宿主及其派生的全部子进程均可完整访问系统外部工具（包括 `powershell.exe`、`cmd.exe` 及用户已安装的 CLI），同时保障内置 Node 运行时优先解析。
- 依赖平台原生安全存储工具的插件能够在 Windows 桌面端环境下可靠运行。

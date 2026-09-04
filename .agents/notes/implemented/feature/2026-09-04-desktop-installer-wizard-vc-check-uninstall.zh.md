# Agent 决策记录：桌面端安装向导、VC++ 运行库检测与卸载数据清理询问

状态：已实现 (implemented)

## 问题背景

1. Windows NSIS 安装包之前配置为单用户静默一键安装（`oneClick: true`, `allowToChangeInstallationDirectory: false`），用户无法自由选择安装盘符与路径（如 D 盘）。
2. 在缺少微软 Visual C++ 2015–2022 运行库的纯净 Windows 电脑上，内置 Node.js 宿主因缺少 `vcruntime140.dll` / `msvcp140.dll` 无法启动，且缺少前置检测和引导。
3. 卸载程序仅清理应用程序本体目录，无法在卸载时供用户选择是否清除 `$PROFILE\.dsh` 与 `%APPDATA%\dsh-desktop` 中的个人数据与会话记录。

## 解决决策

1. **自定义安装向导**：
   - 更新 `desktop/electron-builder.yml`，设置 `oneClick: false`、`allowToChangeInstallationDirectory: true`、`allowElevation: true`、`createDesktopShortcut: always`。
   - 启用中英双语安装界面语言支持（`zh_CN`、`en_US`）。
2. **VC++ 运行库检测与引导**：
   - 在 `desktop/build/installer.nsh` 中编写 NSIS `customInit` 宏，检查注册表与 `System32\vcruntime140.dll`。若缺失，弹窗提示并引导打开微软官方下载地址（`https://aka.ms/vs/17/release/vc_redist.x64.exe`）。
   - 在 `desktop/src/runtime.cjs` 中实现 `checkVcRuntime` 并在 `desktop/src/main.cjs` 的 `boot()` 中集成，为绿色免安装（zip）版用户提供双重保障。
3. **卸载时弹窗询问是否清除用户数据**：
   - 在 `desktop/build/installer.nsh` 中编写 NSIS `customUnInstall` 宏，弹出是否清理对话框：
     - 选择【是】：一并清理 `$PROFILE\.dsh` 与 `$APPDATA\dsh-desktop`；
     - 选择【否】：安全保留个人数据。

## 验证情况

- 单元测试（在 `desktop/` 下运行 `node --test "tests/*.test.mjs"`）：新增针对 `checkVcRuntime` 在各平台与 DLL 存在/缺失状态下的单元测试，全部 14 项测试通过。
- 验证了 NSIS 宏语法与配置结构。
- 本地 `app.asar` 重新打包更新。

## 后续影响

- 用户安装时可完全自主决定安装盘符与文件夹。
- 纯净 Windows 电脑在安装和启动时均可获得明确的运行库检测和一键下载指引。
- 卸载时支持保留或一键彻底清理聊天数据与密钥。

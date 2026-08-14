# dsh-liangshen — 梁神模式（两阶段锚定 agent preset）

[English](README.md) | 中文

把「Anchored Standard」实验 preset 做成 DSH 全家桶里的一键安装插件：Host 启动时把内置的 `presets/liangshen` 同步到 `~/.dsh/.agent-presets/liangshen`，新建会话即可在预设选择器中选择「梁神模式」。首轮模型请求只看到平台 shell 与 `read`，没有运行时上下文和指令注入；首次持久工具调用后恢复完整工具目录与常规注入。全部通过官方 NPM SDK 实现，不修改 DSH 源码。

## 原理

DeepSeek V4 Pro 会强烈依赖 API 中可见的**首轮工具目录**选择执行轨迹。社区评测（[xiaobright/modeltest](https://github.com/xiaobright/modeltest)）中，Standard / PTC 只有 91/92 分，Minimal 达到 99/96，但 Minimal 只有两个工具。两阶段方案把「首次轨迹选择」与「后续完整工具能力」拆开：

1. 首轮模型请求只暴露平台 shell 与 `read`，清空运行时上下文，并且只放行用户自己的消息（保持 Minimal 的完整 system prompt 条件）；
2. 会话出现首次持久 `tool/call` 后，自动恢复全部 Standard 工具，workspace 指令、skill 目录与运行时快照等常规注入也随该步返回；
3. 阶段从持久化 session events 推导，resume / reload 不丢失状态。

Windows 原生环境实测（DeepSeek V4 Pro、max、V4.1b 题面）：98 / 99，均值 98.5，第二轮全程无 `let me` 痕迹，证明不是抽卡，也不需要牺牲完整工具能力。原始实验 preset：[xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)。

## 安装

```sh
# 方式一：全家桶（推荐）
dsh plugin --profile web add @linxin666/dsh-web-ui-all

# 方式二：单独安装
dsh plugin --profile web add @linxin666/dsh-liangshen
```

装完**完整重启 `dsh web`**，新建空 session，预设选择「梁神模式」。插件会在启动时把 preset 同步进 `~/.dsh/.agent-presets/liangshen`（升级插件后重启即自动更新）。

## 验证

导出 session JSONL，检查 `request/header`：

- 第一份 header 应只有 `bash/read`（macOS/Linux）或 `pwsh/read`（Windows）；
- 第一轮应只包含用户自己的消息：没有 workspace 指令 baseline、没有运行时快照、没有 skill 目录消息；
- 首次工具调用后，下一份变更 header 应包含完整 Standard 目录，被隔离的注入随该步一起出现；
- 此后的请求保持完整目录。

## 行为与限制

- 第一次模型响应如果没有调用工具，会话不会晋升（保持双工具且无注入的首轮表面）；
- 工具执行即使失败，只要 `tool/call` 已持久化，下一步仍会晋升；
- workspace 指令、skill 目录与运行时快照在首轮不注入，晋升时随完整工具目录一起出现；
- 工具目录只变化一次，因此第一、二次请求之间会发生一次前缀缓存变化；
- preset 与 shell 访问具有相同信任等级，安装前可自行审阅 `presets/liangshen/`；
- 插件不发起网络请求，也不增加遥测；
- 不要在已经产生内容的会话中途切换 preset；
- 需要 DSH 0.1.0-rc.5+（preset 机制与 `system-prompt/assemble` 钩子）。

## 许可

插件本体 Apache-2.0（zhu1090093659）。`presets/liangshen/agent.cordis.yml` 基于 DeepSeek Harness Standard preset 修改，`tool-bootstrap.mjs` 来自 xiaobright/dsh-anchored-standard，均为 MIT，版权与许可声明见 `presets/liangshen/NOTICE`。

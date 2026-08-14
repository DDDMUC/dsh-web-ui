# dsh-liangshen — 梁神模式（两阶段锚定 agent preset）

[English](README.md) | 中文

把「Anchored Standard」preset 家族做成 DSH 全家桶里的一键安装插件：Host 启动时把内置 presets 同步到 `~/.dsh/.agent-presets`，新建会话即可在预设选择器中选择「梁神模式」或实验性的「梁神模式-精确实验」。首轮模型请求只看到双工具表面，没有运行时上下文和指令注入；锚定建立后开放完整工具目录与常规注入。全部通过官方 NPM SDK 实现，不修改 DSH 源码。

## 原理

DeepSeek V4 Pro 会强烈依赖 API 中可见的**首轮工具目录**选择执行轨迹。社区评测（[xiaobright/modeltest](https://github.com/xiaobright/modeltest)）中，Standard / PTC 只有 91/92 分，Minimal 达到 99/96，但 Minimal 只有两个工具。两阶段方案把「首次轨迹选择」与「后续完整工具能力」拆开：

1. 首轮模型请求只暴露平台 shell 与 `read`，清空运行时上下文，并且只放行用户自己的消息（保持 Minimal 的完整 system prompt 条件）；
2. 会话出现首次持久 `tool/call` 后，晋升会等到首个 reasoning 块呈 minimal-like（`We need` / 无 `Let me`）才发生，四步兜底；随后恢复全部 Standard 工具，workspace 指令、skill 目录与运行时快照等常规注入也返回；
3. 阶段从持久化 session events 推导，resume / reload 不丢失状态。

Windows 原生环境实测（DeepSeek V4 Pro、max、V4.1b 题面）：98 / 99，均值 98.5，第二轮全程无 `let me` 痕迹，证明不是抽卡，也不需要牺牲完整工具能力。原始实验 preset：[xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)。

## 稳定化控制

preset 在参考机制之上内置了额外保护，全部在 `agent.cordis.yml` 的 `tool-bootstrap` 段配置：

- `anchorGate`：首次 `tool/call` 后，目录继续保持双工具，直到首个 reasoning 块被判定为 minimal-like，避免 `Let me` 开局立刻拿到完整目录；
- `maxBootstrapSteps`：N 步后仍无锚定块时强制晋升；
- `promoteAfterFirstResponse`：首轮无工具调用的回答在下一轮自动晋升；锚定门控中的会话也会在新用户轮次开始时释放，短任务不会永远停在双工具；
- `deferredSources` + `deferredGraceSteps`：workspace 指令与 skill 目录在晋升后再等一步注入，工具目录切换和注入冲击不同时落地。

## 安装

```sh
# 方式一：全家桶（推荐）
dsh plugin --profile web add @linxin666/dsh-web-ui-all

# 方式二：单独安装
dsh plugin --profile web add @linxin666/dsh-liangshen
```

装完**完整重启 `dsh web`**，新建空 session，预设选择「梁神模式」。插件会在启动时把 presets 同步进 `~/.dsh/.agent-presets`（升级插件后重启即自动更新）。

## 精确实验预设

「梁神模式-精确实验」（`liangshen-exact`）保留相同的稳定化控制，但 phase 1 与内置 Minimal 预设逐字节对齐：持久 `bash` + `str_replace_editor`，工具描述与一行 persona 完全一致；晋升后开放完整 Standard 目录。

代价：持久 shell 会替代 Standard 的一次性 `bash` 直到会话结束（两个工具都注册 `bash` 名字），所以它用于对比锚定命中率的 A/B 实验，不替代主 preset。

## 验证

导出 session JSONL，检查 `request/header`：

- 第一份 header 应只有 `bash/read`（macOS/Linux）或 `pwsh/read`（Windows）；`liangshen-exact` 应为 `bash/str_replace_editor`；
- 第一轮应只包含用户自己的消息：没有 workspace 指令 baseline、没有运行时快照、没有 skill 目录消息；
- 首次工具调用后，下一份变更 header 应包含完整 Standard 目录；运行时快照随该步出现，workspace 指令与 skill 目录再晚一步出现；
- 此后的请求保持完整目录。

不读原始 reasoning 也能测量轨迹漂移：

```sh
node tools/analyze-session.mjs <导出的 session.jsonl>
```

## 行为与限制

- 第一次模型响应如果没有调用工具，下一轮自动晋升；锚定门控中的会话也会在新用户轮次开始时释放，不会永远停在双工具；
- 首次工具调用后，晋升等待首个 minimal-like reasoning 块或 `maxBootstrapSteps` 兜底，先到者生效；
- 工具执行即使失败，只要 `tool/call` 已持久化，仍计入晋升条件；
- workspace 指令、skill 目录与运行时快照在首轮不注入；快照随完整工具目录出现，前两者再晚一步出现；
- 工具目录只变化一次，因此第一、二次请求之间会发生一次前缀缓存变化；
- preset 与 shell 访问具有相同信任等级，安装前可自行审阅 `presets/`；
- 插件不发起网络请求，也不增加遥测；
- 不要在已经产生内容的会话中途切换 preset；
- 需要 DSH 0.1.0-rc.5+（preset 机制与 `system-prompt/assemble` 钩子）。

## 许可

插件本体 Apache-2.0（zhu1090093659）。`presets/liangshen/agent.cordis.yml` 基于 DeepSeek Harness Standard preset 修改，`presets/liangshen-exact/agent.cordis.yml` 基于内置 Minimal 与 Standard preset 修改，`tool-bootstrap.mjs` 来自 xiaobright/dsh-anchored-standard，均为 MIT，版权与许可声明见各 preset 的 `NOTICE`。

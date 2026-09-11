# dsh-liangshen — 梁神模式（极简 persona + 标准工具目录）

[English](README.md) | 中文

把梁神模式做成 DSH 全家桶里的一键安装插件：Host 启动时把内置 preset 同步到 `~/.dsh/.agent-presets`，新建会话即可在预设选择器中选择「梁神模式」。该 preset 让系统提示词永久保持官方 Minimal 那一行 persona，同时从第一次请求起就在 wire 上提供官方 Standard 的完整工具目录——没有阶段跃迁、没有 PTC 切换——并把工具清单以 user 消息注入在用户消息之后，形状与 harness 注入 skill 目录一致。全部通过官方 NPM SDK 实现，不修改 DSH 源码。

## 原理

DeepSeek V4 Pro 在选择执行轨迹时，会强烈依赖**第一次请求的模型可见面**——既包括系统提示词，也包括 API 工具目录。社区评测（[xiaobright/modeltest](https://github.com/xiaobright/modeltest)）中，Minimal 达到 99/96，而 Standard / PTC 只有 91/92：Minimal 的优势来自那一行 persona，代价是它只保留两个工具。

梁神模式不在这两者之间切换，而是把它们合并：负责锚定的部分（系统提示词）全程保持 Minimal，负责能力的部分（工具目录）从第一次请求起就是 Standard。Standard 提示词里以工具用法散文承载的能力事实，改为在提示词尾部以一条消息送达，因此稳定前缀始终是那一行锚定 persona。

## 工作机制

1. `minimal-prompt` 把每次组装出的提示词收窄到 persona 一段——`You are a helpful software engineer assistant.`——因此 harness identity、web surface、工具用法、文件引用与结构化输出等 section 都不会到达模型；plan mode 的 `plan:policy` 保留，因为该 section 是 plan mode 唯一的执行依据（它的退出工具在任何模式下都保持注册）；
2. wire 从第一次请求起就带本 preset 的完整工具清单：Standard 的工具集，以持久 shell 取代一次性 shell，另加 `str_replace_editor`；
3. `tool-catalog` 把工具清单——名称加一行摘要，取自该步组装出的 wire schema——作为持久 user 消息追加在用户消息之后，并且只在目录内容变化、或已发布副本离开可见面（压缩、恢复）时重发；
4. 运行时上下文（sandbox 与 approval 快照）与 skill 目录按 Standard 模式正常注入，首次 AGENTS.md 注入替换为一次性的、非命令式的参考文件提示。

Windows 说明：DSH 的 PTY 后端仅支持 linux/darwin，win32 上持久 shell 组被禁用，`bash` 由 `custom-bash` 提供——工具名相同，经普通跨平台子进程通道调起 Git Bash（见 `presets/liangshen/custom-bash.mjs`）。

## Preset 配置

两个 preset 内置插件都在 `agent.cordis.yml` 中配置：

| 键 | 默认值 | 行为 |
| --- | --- | --- |
| `keepPlanPolicy` | `true` | 在只有一行 persona 的系统提示词中保留 plan mode 的 `plan:policy` 段。置 `false` 得到严格的一行表面，此时 plan mode 背后没有任何策略文本。 |
| `instructionHint` | `true` | 把首次 AGENTS.md 全文注入替换为一次性提示（列出参考文件路径），并丢弃后续注入。置 `false` 恢复普通全文注入。 |
| `descriptionMaxLength` | `200` | 注入目录中单个工具一行摘要的长度上限。完整描述仍留在工具 schema 中。 |

## 安装

```sh
# 方式一：全家桶（推荐）
dsh plugin --profile web add @linxin666/dsh-web-all@latest

# 方式二：单独安装
dsh plugin --profile web add @linxin666/dsh-liangshen@latest

# 两种方式二选一：聚合包与独立 @linxin666/dsh-liangshen 都会挂载本 preset。
# 需要在两者之间切换时，先 dsh plugin remove 移除另一个再安装：
dsh plugin --profile web remove @linxin666/dsh-liangshen
```

装完**完整重启 `dsh web`**，新建空 session，预设选择「梁神模式」。插件会在启动时把 presets 同步进 `~/.dsh/.agent-presets`（升级插件后重启即自动更新）。

## 验证

导出 session JSONL，检查 `request/header`：

- 第一份 header 的 `system` 应恰好是那一行 persona，plan mode 开启时另加其策略段；
- 第一份 header 的 tools 应是本 preset 的完整工具清单——既不是两个工具，也不会是 `run_code`；
- 该步放行的消息里应有一条来自 `liangshen-tool-catalog` 的 `plugin` 消息，位于用户消息之后，按名称列出工具；
- 后续 header 的工具清单保持不变，且不会每步再追加目录消息；
- 压缩之后目录会重发一次，形式为替换清单；
- 文件写入受宿主文件沙箱策略约束，不存在裸本地文件系统绕过。

不读原始 reasoning 也能测量轨迹漂移：

```sh
node tools/analyze-session.mjs ~/.dsh/sessions/<workspace>/<session>/session.jsonl
```

## 配置

| 键 | 默认值 | 行为 |
| --- | --- | --- |
| `enabled` | `true` | 总开关：关闭后预设同步与公告都不执行。 |
| `announceToAgent` | `false` | 按需开启：开启后向 agent 系统提示注入本插件公告。默认关闭，保持系统提示词干净。 |

两个字段都可在 Web 设置界面（插件配置，即时生效）或 profile patch（`dsh plugin` / `cordis.patch.yml`）中编辑。

## 行为与限制

- 系统提示词在整个会话中保持稳定：那一行 persona，plan mode 开启时另加其策略段。工具调用后不会再追加内容，也不施加任何输出预算上限；
- 工具目录全程不变，因此第一次请求之后不会再发生由目录引起的缓存前缀变化；
- 注入的目录是持久消息：每个会话写入一次，另在工具集变化或压缩遮蔽已发布副本时替换一次，并留在历史中供后续请求使用；
- 未观测到 prompt 组装的步不注入任何内容——目录绝不会由过期视图推测；
- 若组合中不存在任何被接受的 persona section 名（`deployment:persona-prefix`、`deployment:persona`、`persona`），过滤器会保留组装结果并只告警一次，而不是发出空系统提示词；
- plan mode 通过其 `plan:policy` 段支持；置 `keepPlanPolicy: false` 后该模式仍有工具，但失去约束它的策略文本；
- 持久 `bash` 会替代 Standard 的一次性 shell 直到会话结束（两个工具都注册 `bash` 名字），因此 shell 状态跨调用保留；win32 上由 `custom-bash` 经 Git Bash 提供同名工具，无 OS 沙箱约束；
- 文件工具继承宿主文件沙箱（不挂载裸 `dsh-fs-local`）；
- preset 与 shell 访问具有相同信任等级，安装前可自行审阅 `presets/liangshen/`；
- 插件不发起网络请求，也不增加遥测；
- 不要在已经产生内容的会话中途切换 preset；
- 需要 DSH 0.1.5-rc.1+（preset 机制、`system-prompt/assemble` 瀑布与 persona 的 `prefix` schema）。

## 许可

插件本体 Apache-2.0（zhu1090093659）。`presets/liangshen/agent.cordis.yml` 基于 DeepSeek Harness 内置 Minimal 与 Standard preset 修改（MIT），`custom-bash.mjs` 来自 xiaobright/dsh-anchored-standard（MIT），版权与许可声明见 preset 的 `NOTICE`。

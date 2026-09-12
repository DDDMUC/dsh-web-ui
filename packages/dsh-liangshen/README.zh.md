# dsh-liangshen — 梁神模式（极简 persona + PTC 工具面）

[English](README.md) | 中文

把梁神模式做成 DSH 全家桶里的一键安装插件：Host 启动时把内置 preset 同步到 `~/.dsh/.agent-presets`，新建会话即可在预设选择器中选择「梁神模式」，浏览器半区还在新建会话页的模型选择器旁提供一台老虎机拨杆来开关该模式。该 preset 让系统提示词永久保持官方 Minimal 的一行 persona——外加本模式的固定工作纪律、会话工作区目录与 AGENTS.md 类工作区指令——并从第一条用户消息起就把工具面作为持久 user 消息注入在用户消息之后——形状与 harness 注入 skill 目录一致——而 wire 按回合分层：首个（锚定）回合原样保持官方 Minimal 面（只有 `bash`，原生呈现），从第二个回合起该会话以 PTC 模式呈现工具，wire 上只有 `run_code` 这一条传输工具，其余工具都在程序里经生成的 SDK 调用。唯一的一次 wire 跃迁就是确定性的回合边界，没有推理内容门控、没有输出预算上限。全部通过官方 NPM SDK 实现，不修改 DSH 源码。

## 原理

DeepSeek V4 Pro 在选择执行轨迹时，会强烈依赖**第一次请求的模型可见面**——既包括系统提示词，也包括 API 工具目录。社区评测（[xiaobright/modeltest](https://github.com/xiaobright/modeltest)）中，Minimal 达到 99/96，而 Standard / PTC 只有 91/92：Minimal 的优势来自那一行 persona，代价是它只保留两个工具。

梁神模式不在这两者之间切换，而是把它们合并：负责锚定的部分（系统提示词）全程保持 Minimal，负责能力的部分（工具面）从第一条用户消息起就以 skill-catalog 式的上下文注入宣告，而它的 schema 在确定性的回合边界生效。在 PTC 呈现下，这条注入是模型了解生成 SDK 的绑定清单、「一段程序编排多步调用」的程序契约、以及「只有 `run_code` 可直接调用」这条规则的唯一来源，因为一行 persona 的系统提示词会把 harness 自己的 `tools:sdk` 与 `tools:ptc-only` 段一并裁掉。Standard 提示词里以工具用法散文承载的能力事实，改为在提示词尾部以一条消息送达，因此稳定前缀始终是那一行锚定 persona。

## 工作机制

1. `minimal-prompt` 把每次组装出的提示词收窄到 persona 一段——一行 persona、本模式的固定工作纪律（思维循环即断、先理解需求与方案再实现、YAGNI/PDCA、代码不加注释）、以及一行从会话头读取的方位信息 `Your working directory is <cwd>.`——因此 harness identity、web surface、工具用法、文件引用与结构化输出等 section 都不会到达模型；plan mode 的 `plan:policy` 保留，因为该 section 是 plan mode 唯一的执行依据（它的退出工具在任何模式下都保持注册）；
2. AGENTS.md 类工作区指令直接进入系统提示词本身：组装时 `minimal-prompt` 读取 harness 的基线链（`$DSH_HOME/AGENTS.md`，再从项目根到会话 cwd 沿途的 `AGENTS.md` / `CLAUDE.md` 及其 `.local` 覆盖层），把内容作为一段 `workspace-instructions` 追加在稳定前缀之后，受字节预算约束——放不下时先省略最宽的文件、最后才截断最具体的文件；读取在每次组装时都发生，文件改动无需持久消息即可在下次请求生效，harness 自己的 agent-instructions 注入则被丢弃以免与提示词重复；
3. 锚定回合（会话的第一个回合）把 wire 保持在官方 Minimal 面上：只有 `bash`，原生呈现（`anchorTools`）；从第二个回合起 `tool-catalog` 为该会话声明 PTC 呈现（`agent.ctx.tools.presentAs('ptc')`，在锚定回合结束时声明，因此晋升回合的第一次请求就已经带收敛后的面），于是 wire 收拢为 `run_code` 这一条传输工具，本 preset 清单里的其余工具——Standard 的工具集，以持久 shell 取代一次性 shell，另加 `str_replace_editor`——都在程序里经生成的 SDK 调用；
4. `tool-catalog` 把工具清单——每个工具的参数签名加一行摘要——从第一条用户消息起作为持久 user 消息追加在用户消息之后。条目取自注册表的 PTC 面（`ctx.tools.sdkSchemas`），而不是收窄后的锚定 wire，所以第一轮就点名了晋升回合才可达的全部工具，渲染文本也不在边界处变化。PTC 下这条消息还承载 harness 在同样被裁掉的那两段里写明的程序契约：一段程序完成一个意图而不是一步一次调用、`run_code` 的 `code`/`description` 形状、独立只读调用用 `Promise.all` 并发、`ToolCallError` 的处理、程序输出需要自己挑选，以及 `run_code` 一旦在 wire 上就是唯一可直接调用的工具。只在工具面变化、或已发布副本离开可见面（压缩、恢复）时重发；
5. 运行时上下文（sandbox 与 approval 快照）与 skill 目录按 Standard 模式正常注入。

Windows 说明：DSH 的 PTY 后端仅支持 linux/darwin，win32 上持久 shell 组被禁用，`bash` 由 `custom-bash` 提供——工具名相同，经普通跨平台子进程通道调起 Git Bash（见 `presets/liangshen/custom-bash.mjs`）。

## 拨杆

浏览器半区在新建会话页的输入框工具行里、模型选择器紧左侧装了一台老虎机拨杆：

- 把拨杆拨下——拖动、点击或用键盘激活都算——即将开始的会话就组合为梁神模式；命中后播放中奖特效（闪光、冲击环、火花，以及「梁神模式」横幅叠文言文、二进制、摩斯三行）；
- 把拨杆上拨，就回到你此前的模式——还没有记住任何模式时，回到部署默认预设；
- 拨杆始终反映会话真实的预设，刷新页面后状态依然正确；且只在会话仍为空时渲染——会话一旦开始，宿主拒绝重新组合，整行控件直接从输入框中消失；
- 被拒绝的切换会在拨杆下方显示宿主给出的原因，且不播放特效；`prefers-reduced-motion` 下保留状态变化、去掉动画。

拨杆通过浏览器会话已经完成鉴权的 agent-preset Remote 命名空间驱动会话预设，不额外申请权限。它只在会话为空时改动预设，而那正是它渲染所在的新建会话页。

## Preset 配置

两个 preset 内置插件都在 `agent.cordis.yml` 中配置：

| 键 | 默认值 | 行为 |
| --- | --- | --- |
| `keepPlanPolicy` | `true` | 在只有一行 persona 的系统提示词中保留 plan mode 的 `plan:policy` 段。置 `false` 得到严格的一行表面，此时 plan mode 背后没有任何策略文本。 |
| `instructionSource` | `system-prompt` | 工作区指令送达模型的方式。`system-prompt` 在组装时读取 AGENTS.md 链并追加进系统提示词（harness 自己的注入被丢弃）；`hint` 恢复指针行为：首次注入替换为一次性的、非命令式的参考文件提示，后续注入丢弃。 |
| `instructionMaxBytes` | `65536` | 渲染后的 workspace-instructions 段的字节预算（system-prompt 模式）：最宽的文件先被省略，最具体的文件最后被截断。 |
| `descriptionMaxLength` | `200` | 注入目录中单个工具一行摘要的长度上限。完整描述仍留在工具 schema 中。 |
| `anchorTools` | `[]` | 锚定回合 wire 上仅有的工具名，原生呈现；晋升面从第二个回合起生效。留空则关闭分层（第一次请求就带组装出的 wire）。出厂 preset 设为 `bash`。 |
| `ptcPresentation` | `true` | 从第二个回合起为该会话声明 PTC 呈现，于是 wire 收拢为 `run_code`，注入目录列出 SDK 绑定。需要挂载 code runtime；没有 runtime 的部署保持原生并只告警一次。置 `false` 则从第二个回合起 wire 上仍是组装出的清单。 |

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

- 第一份 header 的 `system` 应恰好是 persona 块（一行 persona、工作纪律清单、工作区目录行 `Your working directory is <cwd>.`），plan mode 开启时另加其策略段，再另加承载 AGENTS.md 链的 `workspace-instructions` 段；
- 第一份 header 的 tools 应恰好是锚定面——只有 `bash`，原生呈现——既不是晋升清单，也不会是 `run_code`；
- 首个回合放行的消息里应有一条来自 `liangshen-tool-catalog` 的 `plugin` 消息，位于用户消息之后，按参数签名列出晋升面并写明 `run_code` 契约；
- 从第二个回合起，header 上恰好只有一条工具 `run_code`（PTC 呈现）；目录渲染文本不再变化，因此不会每步再追加目录消息；
- 压缩之后目录会重发一次，形式为替换清单，且会话保持 PTC 呈现；
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

- 系统提示词在整个会话中保持稳定：persona 块（persona、工作纪律、工作区目录），plan mode 开启时另加其策略段，另加 workspace-instructions 段。工具调用后不会再追加内容，也不施加任何输出预算上限；
- workspace-instructions 段在每次组装时重新读取，指令文件的改动无需持久消息即可在下一次请求生效；该段渲染在稳定前缀之后的最后位置，锚定的缓存前缀不受影响。harness 对后代目录指令文件的动态 reconcile（`read`/`write`/`edit` 工具触碰其目录时浮出的嵌套 `AGENTS.md`）不被复刻：那些注入与基线注入一样被丢弃，而且本模式的文件工具很少携带触发它的 `read`/`write`/`edit` 名字；
- wire 的 schema 集只在锚定回合边界变化一次——从 Minimal 的 `bash` schema 换到 `run_code` 这一条传输工具；目录消息本身每会话写一次（另在压缩遮蔽时替换一次），因此不会出现每步、每回合的缓存前缀扰动；
- 注入的目录是持久消息：每个会话写入一次，另在工具面变化或压缩遮蔽已发布副本时替换一次，并留在历史中供后续请求使用；
- 未观测到 prompt 组装的步不注入任何内容——目录绝不会由过期视图推测；
- 若组合中不存在任何被接受的 persona section 名（`deployment:persona-prefix`、`deployment:persona`、`persona`），过滤器会保留组装结果并只告警一次，而不是发出空系统提示词；
- plan mode 通过其 `plan:policy` 段支持；置 `keepPlanPolicy: false` 后该模式仍有工具，但失去约束它的策略文本；
- PTC 呈现按会话声明，需要挂载的 code runtime（随包发布的 web 与 headless 组合都挂载 `dsh-code-runtime-worker-thread`）；没有 runtime 时该模式保持原生——第二个回合起 wire 上仍是组装出的清单，目录也不带 `run_code` 契约——并只告警一次；
- 清单就是官方 PTC preset 的模型自著面：不在 `run_code` 之外再发布 `workflow` 工具，而 workflow 引擎仍为 `ralph` 保留挂载；
- 持久 `bash` 会替代 Standard 的一次性 shell 直到会话结束（两个工具都注册 `bash` 名字），因此 shell 状态跨调用保留；win32 上由 `custom-bash` 经 Git Bash 提供同名工具，无 OS 沙箱约束；
- 文件工具继承宿主文件沙箱（不挂载裸 `dsh-fs-local`）；
- preset 与 shell 访问具有相同信任等级，安装前可自行审阅 `presets/liangshen/`；
- 插件不发起网络请求，也不增加遥测；
- 不要在已经产生内容的会话中途切换 preset；
- 需要 DSH 0.1.5-rc.1+（preset 机制、`system-prompt/assemble` 瀑布、persona 的 `prefix` schema，以及 PTC 呈现 API）。

## 许可

插件本体 Apache-2.0（zhu1090093659）。`presets/liangshen/agent.cordis.yml` 基于 DeepSeek Harness 内置 Minimal、Standard 与 PTC preset 修改（MIT），`custom-bash.mjs` 来自 xiaobright/dsh-anchored-standard（MIT），版权与许可声明见 preset 的 `NOTICE`。

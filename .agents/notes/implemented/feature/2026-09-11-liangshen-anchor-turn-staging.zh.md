# Agent Note: 梁神模式的 Standard 工具目录按锚定回合分层

Status: implemented

## Problem

合并式设计（[极简 persona 加注入式标准工具目录](2026-09-11-liangshen-minimal-prompt-tool-catalog.md)）从会话的第一次请求起就把官方 Standard 预设的完整工具清单放上了 wire。在轨迹视图里看第一轮交换就能看到代价：初始系统条目的工具页在对话尚不存在时就带着完整的 Standard 目录——这正是该模式要避免的「提前注入」。那一行 persona 锚定的请求，工具面早就是 Standard 了，所谓「极简的第一波」只在散文层面极简。

## Decision

Standard 清单按锚定回合分层：会话的首个回合跑极简面，完整目录在确定性的回合边界生效。分层逻辑放在 `presets/liangshen/tool-catalog.mjs`——本来就拥有 wire 目录读取的那个插件。

- 锚定回合由持久日志定义：`turn/start` 事件少于两条。每次决策都从日志重读计数，绝不依赖内存，因此恢复、刷新、压缩都不会丢失或复活边界；首个回合没有回复就结束，也会在下一个回合晋升。
- 锚定回合内，组装出的 wire 工具清单先收窄到 `anchorTools` 再随请求发出，目录消息既不发布也不保留：锚定 schema 本来就是整个 wire，而完整目录会宣告请求并不携带的工具。
- 从第二个回合起，完整组装清单上 wire，目录按既有的去重规则发布在用户消息之后。锚定回合的组装不写入条目缓存，所以晋升后的步骤绝不可能从过期的锚定视图发布。
- `anchorTools` 是 preset 配置（`agent.cordis.yml`），默认为空——完全关闭分层，恢复「第一次请求就带完整目录」的行为。出厂 preset 设为 `bash`、`str_replace_editor`、`exit_plan_mode`、`skill`：shell 与编辑器是退役的 `tool-bootstrap` 当年锚定用的最小工作对，`exit_plan_mode` 背书提示词保留的 `plan:policy` 段，`skill` 背书随首批注入到达的 skill 目录——锚定回合里提示词引用到的每个工具都在 wire 上。
- 首个回合的其余一切不变：一行 persona、plan 策略、运行时上下文、指令提示、skill 目录。

## Testing

- `tests/tool-catalog.test.ts` 覆盖回合边界读取、按锚定顺序收窄 wire、锚定回合的目录抑制、从锚定批次剥离目录副本、第二个回合发布完整清单、过期缓存防护，以及默认关闭的行为。
- `tests/preset-composition.test.ts` 钉住出厂 `agent.cordis.yml` 里的 `anchorTools` 行。

## Alternatives considered

- 保持第一次请求就带完整清单。否决：这就是被指出的提前注入。
- 像退役的 `tool-bootstrap` 那样，用「极简风格的首个 reasoning 块」门控晋升。否决：依赖模型输出的状态机正是阶段 1 移除的脆弱点；回合边界不需要模型配合。
- 锚定回合发布一份锚定目录、到边界再重发。否决：锚定 schema 本来就以整个 wire 的形式可见，第一份目录是噪音，日志里也会每次会话开始都多出两条持久清单。
- 锚定回合零工具。否决：锚定回合仍应是能干活的回合——shell 与编辑器足以应付真实的首个任务，而且这与模式最初出厂时的阶段 1 表面一致。
- 锚定回合抑制 skill-catalog 消息、而不是把 `skill` 留在 wire 上。否决：那是从外部剥离别的插件的注入；留下工具，那份目录才是真实的。
- 以第一条 assistant 消息而不是回合边界晋升。否决：首个交换内的工具循环会在回合中途换面；回合边界让整个首个交换停留在同一个面上。

## Consequences

- 第一次请求是有意的不完全能力：它的回复只能调用锚定 schema。以任务开场的首个消息得到 shell 加编辑器的回答，完整清单从第二次交换起可用。
- wire 每个会话只变化一次：边界处发生一次由目录引起的缓存前缀失效，回合内与之后都没有。
- roster 在宿主启动时把 preset 组合挂载在常驻 scope 下一次，因此 preset 文件变更要在下一次 DSH 重启后、对之后新建的会话才生效；插件的启动同步会刷新已安装副本。
- 拨杆的整行隐藏修复随同一轮交付（[梁神拨杆](2026-09-11-liangshen-composer-lever.md)）；两者回应的是同一条用户反馈在插件两个半区上的问题。

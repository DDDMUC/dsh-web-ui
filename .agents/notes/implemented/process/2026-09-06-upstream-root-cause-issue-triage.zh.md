# Agent Note: 核心包缺陷的 Issue 上游根因分诊

Status: implemented

## Problem

dsh-web 收到的社区 issue,根因可能在上游 `@deepseek-ai/*` 核心包而非本仓库的插件代码。#1397 就是实例:插件依赖在 profile 里带入第二份 dsh-tools 实例后,私有 `Symbol()` 调度器键导致工具调度崩溃。此前没有仓库级规则说明这类 issue 如何处理——验证什么、修复落在哪里、如何回复报告者、issue 何时保持开放。

## Decision

当 issue 根因位于上游核心包时,按三步分诊,并在上游修复发布前保持 issue 开放:

1. 对照本机安装的运行时核实报告的机制(精确到文件与行号),不只采信报告文字。
2. 本地只做停止间隙修复,且必须满足:改动最小、可回滚、有备份、已验证;同时说明它需用户自行重启后才生效,且会被下一次包升级覆盖。
3. 在 issue 回帖:已确认的根因、为什么持久修复属于上游、停止间隙方案;保持 issue 开放跟踪上游修复。

2026-09-06 应用记录。#1397:根因在 `@deepseek-ai/dsh-tools` 0.1.2-rc.1 得到确认(`lib/index.js:2430` 与 `lib/types/index.js:51` 的私有 Symbol;`dsh-agent-loop/lib/index.js:195` 的查找);对全部六份已安装副本(宿主安装加五个 profile 副本)应用停止间隙补丁(`Symbol()` 改 `Symbol.for()`,原件备份于 `~/.dsh-1397-symbol-backup/20260906-190504`,补丁后验证宿主与 profile 副本共享同一个调度器 Symbol);已回帖分诊结论并保持开放。#1393(task-board AI 任务拆分)评估为技术上可行,留一个待定设计决策——拆分调用走哪条模型通路(完整执行会话还是更轻的一次性补全面)——记入维护者排期评估。

## Alternatives considered

- 在 dsh-web 内修复:否决。dsh-web 没有任何包声明 `@deepseek-ai/*` peer 依赖,profile 依赖解析属于 dsh 核心,插件无法跨模块实例桥接模块私有 Symbol,仓库内不存在持久修复的着力点。
- 以"不属于本仓库"为由关闭 issue:否决。报告者的复现与修复方案均已确认,受影响用户需要停止间隙方案;静默关闭会掩盖一个现存的破坏。
- 立即实现 #1393:延后。它是新功能,模型通路选择是 owner 级设计决策,不属于 Bug 自修的强制范围。

## Consequences

- 本机停止间隙补丁会在下一次 `@deepseek-ai/dsh-tools` 升级或 profile 重装时被还原;持久修复是上游的 `Symbol.for()` 改动,而从 fork 向上游开 PR 因涉及向第三方组织发布,仍是待用户决定的后续项。
- 此后核心包类 issue 报告一律按此三步分诊,不再临时处置。

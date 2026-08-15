# Phase 1: shared 基建

**Goal**: 建立 shared/{client,host,core} 运行时共享模块，5 个 settings 卡包与全仓样板接入。
**Status**: Not Started

## Tasks
- [ ] **Task 1.1**: 抽 shared/client/settings-card 三件套（settings-form/PluginSettingsCard/css），pet/task-board/remote-web-ui 改导入删副本；live-stats/describe-image 变体经 options 兼容
  - Priority: P0
  - Effort: L
  - Test Expectation: shared 表单字段单测 + 5 包 settings 冒烟测试
  - Memory Impact: 无
  - Acceptance: 5 包 typecheck+test 绿；三件套副本删除；变体行为不变
  - Notes: _none yet_
- [ ] **Task 1.2**: 抽 shared/client/poll-kit 与 shared/host/poll-guard、sse-bus、loopback、http-json
  - Priority: P0
  - Effort: M
  - Test Expectation: 每个 shared 模块 vitest 单测
  - Memory Impact: 无
  - Acceptance: shared 单测绿；node 环境可直接测试
  - Notes: _none yet_
- [ ] **Task 1.3**: 抽 shared/core/dsh-home 与 shared/client/i18n 样板；pet/liangshen 接入
  - Priority: P0
  - Effort: S
  - Test Expectation: dsh-home 单测（env/~/fallback）
  - Memory Impact: 无
  - Acceptance: 两包接入后行为不变
  - Notes: _none yet_
- [ ] **Task 1.4**: 样板收敛：shared/types/css-modules.d.ts + shared/vitest 工厂；全包改引用
  - Priority: P1
  - Effort: M
  - Test Expectation: vitest 工厂单测 + 全仓 test 绿
  - Memory Impact: 无
  - Acceptance: pnpm test 绿且无包内复制
  - Notes: _none yet_

## Phase Notes

## Phase Completion Checklist
- [ ] All tasks above are checked off
- [ ] MASTER.md phase count updated
- [ ] MASTER.md "Current Status" updated to next phase

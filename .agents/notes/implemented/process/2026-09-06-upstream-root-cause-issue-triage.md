# Agent Note: Upstream root-cause issue triage for core-package bugs

Status: implemented

## Problem

Community issues filed on dsh-web can have their root cause inside the upstream `@deepseek-ai/*` core packages rather than in this repository's plugin code. Issue #1397 is the instance: private `Symbol()` scheduler keys break tool dispatch when a profile carries a second dsh-tools instance pulled in by a plugin's dependency. No repository guideline said how to handle such issues — what to verify, where a fix may land, what to tell the reporter, and when to keep the issue open.

## Decision

When an issue's root cause lives in an upstream core package, triage it in three steps and keep the issue open until the upstream fix ships:

1. Verify the reported mechanism against the locally installed runtime (exact files and line numbers), not just the report text.
2. Fix locally only as a stopgap, and only when the change is minimal, reversible, backed up, and verified; state that it takes effect on the next user-driven restart and is overwritten by the next package upgrade.
3. Reply on the issue with the confirmed root cause, why the durable fix belongs upstream, and the stopgap recipe; keep the issue open tracking the upstream fix.

Applied on 2026-09-06. Issue #1397: root cause confirmed in `@deepseek-ai/dsh-tools` 0.1.2-rc.1 (`lib/index.js:2430` and `lib/types/index.js:51` private symbols; `dsh-agent-loop/lib/index.js:195` lookup); stopgap applied to all six installed copies (host install plus five profile copies, `Symbol()` to `Symbol.for()`, originals backed up under `~/.dsh-1397-symbol-backup/20260906-190504`, verified after patching that host and profile copies share one scheduler symbol); triage reply posted and the issue left open. Issue #1393 (task-board AI task splitting) was assessed as technically feasible with one open design decision — which model path the split request rides, a full execution session or a lighter one-shot completion surface — and recorded for maintainer scheduling.

## Alternatives considered

- Fixing inside dsh-web: rejected. No dsh-web package declares `@deepseek-ai/*` peer dependencies, profile dependency resolution belongs to the dsh core, and a plugin cannot bridge a module-private symbol across instances, so there is no in-repo lever for the durable fix.
- Closing the issue as out-of-repo: rejected. The reporter's reproduction and fix are confirmed, and affected users need the stopgap recipe; closing silently would hide a live breakage.
- Implementing #1393 immediately: deferred. It is a new feature whose model-path choice is an owner-level design decision, not a bug-fix mandate.

## Consequences

- The machine-local stopgap reverts on the next `@deepseek-ai/dsh-tools` upgrade or profile reinstall; the durable fix is the upstream `Symbol.for()` change, and opening that upstream PR from a fork remains a pending owner decision because it publishes to a third-party org.
- Future core-package issue reports follow this three-step triage instead of ad-hoc handling.

# Agent Note: AI parsing of pasted text into the new-task form

Status: proposed

## Problem

Issue #1540 asked the board to turn pasted text, such as a conversation copied from a messenger, into a task: extract and classify the content, and prefill title, description, and execution prompt when creating one.

## Proposal

A new task-board Host route (`POST {prefix}/parse`) behind the existing loopback and same-origin fence accepts raw text and returns structured task fields; the new-task modal gains a paste box and a parse button, and the returned fields fill the form for review before creation. The model call goes through the `llm` service with a deployment-selected route, and the route answers a typed failure (no model configured, unparseable reply) instead of a raw error. Extraction strips code fences and reads the first JSON object; when parsing fails the original text is offered as the prompt rather than dropped.

## Context & Efficiency Impact

One extra Host route and one dialog section. The parsed draft is not persisted in the ledger; only the fields the user accepts are. The model call spends the deployment's own quota and can outlive the transport's 15 s default timeout, so it needs its own 30-45 s budget, a cancel affordance, and a visible pending state.

## Alternatives considered

Calling a model from the browser half is impossible: the client bundle forbids value imports from `@deepseek-ai/*`, and a browser-side call would move the credential path into the page.

Relying on the task's own execution session, where the prompt already reaches an agent, was rejected as the answer to the issue: the reporter wants the form filled before the task exists.

Guessing the route from the first registered provider was rejected: which model pays for a parse, and whose quota, is a deployment decision rather than an implementation detail.

## Acceptance criteria

- A pasted block becomes a titled, described task in the open project without manual copying.
- With no model configured the dialog explains why in the active language and leaves already typed content untouched.
- The request is cancellable and cannot hang the dialog.

## Risks

Prompt-injected pasted text can steer the draft; the user reviews every field before creation and the parse output never executes anything. A reasoning model can exceed the timeout. Without a maintainer decision on the model source this stays unbuilt, so the issue was answered with the design and closed rather than left pending.

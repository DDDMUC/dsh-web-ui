# Agent Note: release-notes mention polluted the release Contributors box

Status: implemented

## Problem

The v0.3.14 release page grew a Contributors sidebar box attributing the release to `@deepseek-ai` (the org, whale avatar, linking to github.com/deepseek-ai). The user spotted it and asked whether parsing had gone wrong. No commit in `v0.3.13..v0.3.14` involves that account: the repo `/contributors` endpoint, commit author/committer emails, and `Co-authored-by` trailers are all clean. The actual trigger: the committed bilingual notes contained the raw token `@deepseek-ai` (from the commit subject "move @deepseek-ai cohort to 0.1.2-rc.1"), GitHub renders such tokens in release bodies as organization **@mentions**, and the release page lists mentioned accounts in a sidebar "Contributors" box. Releases v0.3.11-v0.3.13 had no mention in their bodies and no box.

## Decision

- Escape the token in the committed `docs/release-notes/v0.3.14.md` (backticks around `@deepseek-ai` in both views) and correct the live body with `gh release edit`; the rendered page shows `<code>@deepseek-ai</code>`, the mention count drops to 0, and the box disappears.
- Harden the fallback path: `scripts/release-notes.mjs` now wraps `@token` sequences (letters, digits, dot, slash, dash after a word boundary) in backticks when rendering bullets, so cohort/package subjects can never leak a mention into generated bodies.
- Record the rule in the dsh-web-release skill: never leave a bare `@org` token in release notes; after publishing, spot-check that the release page renders no `user-mention`.

## Testing

- `scripts/release-notes.test.mjs` gains two `bulletOf` assertions (`@deepseek-ai` and `@linxin666/dsh-web-all`); the suite passes 8/8.
- Live check of https://github.com/zhu1090093659/dsh-web/releases/tag/v0.3.14 after the edit: no Contributors box, `user-mention` count 0, the token renders as inline code.

## Consequences

- Future notes are safe in both paths: maintainer-authored files follow the backtick rule, script drafts escape automatically.
- GitHub account attribution on release pages is mention-driven, not only commit-driven; any user-visible markdown surface (release bodies especially) needs the same treatment if it ever quotes scope-style tokens.

# Agent Note: Phone remote surface — session taps swallowed by a skin decoration, and five adaptation defects

Status: implemented

## Problem

A paired phone (portrait 390x844, touch emulation, orca-link skin) reported two user-visible failures and turned out to carry several more:

1. **Every sidebar session tap opened a new session instead of the tapped one.** The orca-link skin paints a decorative "stage frame" with `::before` on the sidebar's New Session button: `height: calc(var(--orca-stage) - 60px)` (227 px at 390x844), `top/left/right: -14px`, `position: absolute`, `opacity: 0`. A pseudo-element box hit-tests as its originating element, so the whole session list sat inside the invisible button. Measured in the live GUI: `document.elementFromPoint(149, 220)` returned `BUTTON.hHd-Xa_newSession` for every row between y=118 and y=287; a real touch tap on a row navigated to the home/empty session.
2. **The layer only seemed to work under one skin.** The unpaired-phone pairing CTA `.fencePairButton` used `background: var(--dsw-alias-brand-primary); color: #fff`. `brand-primary` is an accent/foreground token, not a button fill (`contracts/primary-action-tokens-v1.md`); measured in the dark stock theme it resolves to `#f9fafb`, so the label was white-on-white and the button invisible. It only became legible under a skin that declares a saturated brand (orca-link).
3. **Session rows were invisible to the adaptation layer.** The workspace renders flat-list rows as `class="YDXeBa_sessionRow YDXeBa_flatSessionRowWithoutStatus"` and the selected row as `… YDXeBa_selected`; every row selector used `[class$="_sessionRow"]` (ends-with), so it matched **no** row in that view mode — no long-press action menu, no drag suppression, and no auto-fold after tapping a session.
4. **The app-frame viewport rule over-matched.** `[class$="_frame"]{width:100%;height:100dvh}` also matched the official chat turn rail (`eGxaPq_frame`, `position:absolute;width:28px;pointer-events:auto`), message thumbnails, the subagent pill and PlanReviewPanel, stretching each into a full-width 100dvh hit-blocking box inside the conversation.
5. **Enter and focus handling missed the real composer.** The composer field is a contenteditable `div` carrying `data-composer-input` (the official client renders no textarea), so the whale's blur and the programmatic-focus guard never matched it (every session open popped the phone keyboard), while the Enter rewrite was scoped only by `[class$="_input"]` — a class that also sits on settings, plugin and agent-preset text fields, where it swallowed Enter and inserted a newline into a single-line input.
6. **The seated header actions were clipped and could vanish.** `[class$="_header"] [class$="_tabs"]{margin-right:-58px}` assumed a 78 px official right padding; the installed cohort measures 8 px, so the seated mode label and background-task badge ended at x=432 on a 390 px viewport. The matching `display:none` on the original spot was unconditional, so a single-tab session (no tabs row = no seat) lost both actions entirely.

## Decision

1. **The skin decoration is non-interactive.** `orca-link/patches.css` adds `pointer-events: none` to the stage frame's `::before` and its `::after` corner mark. The frame is decoration; it keeps its hover visual (the button itself still owns the hover region) and can no longer route taps.
2. **The pairing CTA uses the matched primary-action set**: `background/border: var(--dsw-alias-button-primary-fill)`, `color: var(--dsw-alias-label-primary-foreground)`, hover `var(--dsw-alias-button-primary-hover, …fill)`. Legible in every theme and skin, per the repository contract.
3. **Row and sidebar selectors match the class token, not the attribute tail**: `[class*="_sessionRow"]`, `[class*="_projectRow"]`, `[class*="_rowActions"]`, `[class*="_sidebarCol"]`. State modifiers append to the class list, so ends-with matching silently detaches the layer from React's rows.
4. **The app frame is identified semantically**: `APP_FRAME_SELECTOR = '[data-dsh-frame], [class*="_frame"]:has([class*="_centerCol"])'` (aggregate compat stamp first, official layout column as the standalone fallback), used by the injected viewport rule and by a single `appFrame()` helper for every JS lookup.
5. **Composer handling keys on the official field**: a `composerFieldOf()`/`isComposerField()` pair resolves `[data-composer-input]`, `textarea`, or `input[class*="_input"]` **inside** the composer seat. The Enter rewrite, the pointerdown tap stamp, the whale blur and the focus patch all use it; the queue-row editor input (class `…_editor`) is deliberately not a composer field, so its `autoFocus` keeps working.
6. **Header actions: hide only when seated, align by measurement.** The hide rule is gated on `body.dsh-remote-header-seated`, which `seatHeaderActions()` sets only after the actions actually sit in the tabs row; `alignActionsText()` measures the header's right content edge and the actions' right edge each tick and converges the tabs row's `margin-right` on the difference, so the static value is only a first-paint guess.

Two further hardening changes ride along in the same layer: the sidebar toggle is now driven by the **official logo-row toggle first** (verified with a 120 ms poll, then the wired layout face as the fallback) because the wired `LayoutController` is inert on the installed cohort — `data-sidebar-collapsed` did not move for the whole 800 ms observation window, and the old face-first order made every whale tap wait out a 150 ms verification; and multi-touch is excluded from the swipe gesture, `pointercancel` no longer leaves `whaleSuppressClick` set, and the `draggable="false"` overrides are restored on revert.

## Verification

- Live GUI, portrait 390x844 touch emulation, orca-link active, rebuilt client bundle (`rev=7ae1d1a245ef`): with the stage frame forced visible, `getComputedStyle(newSession, '::before').pointerEvents === 'none'`; `elementFromPoint` over every probed session row returns `SPAN.YDXeBa_title` (was `BUTTON.hHd-Xa_newSession`); a real touch tap on a non-current row switched to that session and folded the sidebar; `document.activeElement` after the switch is `BODY` (was the contenteditable composer); the seated header actions end at x=382 on a 390 px viewport (was 432).
- Package suite: 355 tests pass (`pnpm --filter @linxin666/dsh-remote-web-ui test`), including four new specs — nested-`_frame` exclusion, composer-scoped Enter, modifier-class row suppression plus draggable restore, and the seat-gated header rule — and the rewritten toggle-order specs.
- Repository gates: `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, `pnpm docs:check`, `pnpm skin-center:check`, `pnpm aggregate:check`.

## Alternatives considered

- **Fixing only the plugin and leaving the skin decoration.** Rejected: the decoration is the root cause; the layer cannot distinguish "a decoration is eating my taps" from "the user tapped the button", and a plugin-side workaround (`pointer-events: none` injected over the skin's selector) would silently fight the skin owner's design.
- **Rewriting all `[class$="_…"]` selectors to `[class*="_…"]`.** Rejected: short tokens (`_row`, `_card`, `_input`, `_menu`, `_title`, `_root`) would over-match unrelated official elements. Only the tokens whose official elements demonstrably gain state modifiers, plus the sidebar column they live in, were switched.
- **Scoping the viewport rule with `[data-dsh-frame]` alone.** Rejected: that attribute is stamped by the `dsh-web-all` compat layer, so a standalone install of this plugin would lose the rule; the `:has([class*="_centerCol"])` arm keeps it working either way.
- **Making the wired layout face primary and shortening the fallback delay.** Rejected: the face is inert on the installed cohort (measured), so the face-first order would keep the latency and the double-toggle race.
- **Keeping the fixed `margin-right: -58px` and only raising it.** Rejected: the official padding differs per cohort (78 px claimed vs 8 px measured), so any fixed value is wrong on one of them; measuring converges on both.
- **Reporting the inert `LayoutController` upstream instead.** Still worthwhile, but it is host-side and outside this repository; the toggle-first path makes the phone surface work today.

## Consequences

- Tapping a session on the phone opens that session under every skin, including orca-link's "quiet" sidebar; the pairing CTA is legible in the stock dark theme and in every installed skin.
- The adaptation layer now survives workspace state modifiers (selected/flat-list/menu-open rows) and no longer restyles unrelated official `_frame` surfaces.
- Sidebar toggling is immediate on the installed cohort and still falls back to the layout face where no logo-row toggle exists.
- The composer's `data-composer-input` attribute is now a load-bearing contract for this layer; if a future cohort renames it, `[class*="_input"]` inside the composer seat remains the fallback.
- The skin fix changes the visual behavior of the stage frame on hover: the frame lights up only while the pointer is over the New Session button itself, not over the whole stage area. That is the intended read of a decoration.

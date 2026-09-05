# Agent Note: Desktop Token-URL Line Accepts the LAN Suffix

Status: implemented

## Problem

Issue #1377: when the webserver binds a non-loopback host (for example
`0.0.0.0` via a user-managed profile patch), the dsh host appends a
` (LAN: http://<lan-ip>:<port>/?token=…)` suffix to the `dsh web: …` stdout
line. The desktop shell's `parseTokenUrlLine` anchored `(\S+)$` at end-of-line,
so the suffixed line never matched; after the 5-second grace period the shell
fell back to the bare URL, browser-auth answered 401, and the window stayed on
the "dsh web authentication required" black screen.

## Decision

`desktop/src/runtime.cjs` makes the suffix optional in `TOKEN_URL_PATTERN`
(`/^dsh web: (\S+)(?: \(LAN: \S+\))?$/`). The line anchor stays, so only a
complete URL line matches and a truncated suffix still falls through to the
bare-URL fallback path. The desktop window keeps loading the primary
(loopback) URL; the LAN URL remains informational.

## Consequences

The desktop shell boots into the GUI with non-loopback webserver binds. No
format renegotiation with the host: the pattern mirrors what
`@deepseek-ai/dsh-web-app` prints (`authenticatedUrl` plus the optional LAN
suffix).

## Testing

`desktop` package `node --test` (15 tests): the original no-suffix case and a
new case asserting the suffixed line yields the primary URL and a truncated
suffix line yields `undefined`.

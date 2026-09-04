# Agent Note: desktop host childEnv normalizes PATH and strips case variants

Status: implemented

## Problem

When the Electron desktop app spawned its bundled `dsh` host child process on Windows, `childEnv` constructed the child environment via:

```javascript
const env = { ...process.env, DSH_HOME: home };
const nodeBinDir = process.platform === 'win32' ? nodeHome : path.join(nodeHome, 'bin');
env.PATH = nodeBinDir + path.delimiter + (env.PATH ?? '');
```

On Windows, the operating system exposes the environment variable as `Path` (mixed-case) rather than `PATH`. When `process.env` (a case-insensitive Proxy in Node) is spread into a plain JavaScript object, the property is stored with its exact key `'Path'`. Because `env.PATH` was undefined before the assignment, `env.PATH` was set to *only* `nodeBinDir`.

This left two distinct keys in the environment object: `Path` (containing the original system directories) and `PATH` (containing only the bundled node directory). When Node.js and libuv serialized the environment block for `CreateProcessW`, `PATH` took precedence or collided, causing child processes to lose all standard Windows system directories (`C:\Windows\System32`, `C:\Windows\System32\WindowsPowerShell\v1.0`, etc.).

As a direct result:
1. Plugins relying on Windows DPAPI credential decryption (such as `dsh-chatgpt-subscription`) failed when calling `spawn('powershell.exe', ...)` with `Error: spawnSync powershell.exe ENOENT`, leading to `Secure credential storage could not be read`.
2. Any external tools invoked by plugins (such as `codegraph`) failed to resolve and emitted command-not-found errors in `dsh-host.log`.

## Decision

1. Extract `childEnv` into `desktop/src/runtime.cjs` so its behavior is directly unit-testable without Electron.
2. In `childEnv`, find any existing case variant of `PATH` (`Path`, `PATH`, etc.) across `process.env`.
3. Strip all case variants of `PATH` from the environment object, then assign a single normalized `env.PATH` consisting of `nodeBinDir` prepended to the preserved system PATH.
4. Export `childEnv` from `runtime.cjs` and consume it in `desktop/src/main.cjs`.
5. Fix Windows path resolution assertion in `resolveDshHome` unit test (`path.resolve('/data/dsh')`).

## Testing

- Unit tests (`node --test "tests/*.test.mjs"` in `desktop/`): all 12 tests pass, including POSIX PATH formatting, Windows mixed-case `Path` normalization, stripping of case variants, and empty PATH handling.
- Repro script: verified that `powershell.exe` spawns and successfully decrypts the DPAPI token payload when run with the normalized environment block.

## Consequences

- The desktop dsh host child process and all child processes it spawns have full access to system executables (including `powershell.exe`, `cmd.exe`, and installed CLIs) alongside the bundled Node distribution.
- Existing and future plugins relying on platform utilities can execute safely within the desktop app on Windows.

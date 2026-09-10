/**
 * OpenSSH-compatible ProxyCommand transport: run the command with the user's
 * shell and expose its stdio as a Duplex that ssh2 accepts as `sock`.
 *
 * The command comes verbatim from the user's own 0600 store file and runs with
 * the DSH host process's privileges — the same trust the `ssh(1)` client gives
 * the identical line in `~/.ssh/config`.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { Duplex } from 'node:stream'

/** Token source for one host: the values %h / %p / %r / %n expand to. */
export interface ProxyTarget {
  host: string
  port: number
  user: string
  /** The name the user addresses this host by (OpenSSH's %n). */
  alias: string
}

/** Captured stderr budget carried into the failure message (characters). */
const MAX_STDERR = 4096

/** How long a killed proxy command may linger before SIGKILL (ms). */
const KILL_GRACE_MS = 2_000

/** Expand the OpenSSH ProxyCommand tokens; unknown %X sequences stay verbatim. */
export function expandProxyTokens(command: string, target: ProxyTarget): string {
  return command.replace(/%[hprn%]/g, token => {
    switch (token) {
      case '%h': return target.host
      case '%p': return String(target.port)
      case '%r': return target.user
      case '%n': return target.alias
      default: return '%'
    }
  })
}

/** One spawn specification: the user's shell plus the platform quoting. */
interface SpawnSpec {
  file: string
  args: string[]
  /** cmd.exe needs the command quoted verbatim (Node's own shell recipe). */
  windowsVerbatimArguments?: boolean
}

/**
 * The shell OpenSSH itself would use on this platform: the user's shell with
 * `-c` on POSIX, cmd.exe on Windows (where the whole command must stay one
 * verbatim argument, exactly as Node's own `shell: true` does it).
 */
function spawnSpec(command: string): SpawnSpec {
  if (process.platform === 'win32') {
    return {
      file: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', '"' + command + '"'],
      windowsVerbatimArguments: true,
    }
  }
  return { file: process.env.SHELL ?? '/bin/sh', args: ['-c', command] }
}

/** One running proxy command: its transport plus the process behind it. */
export interface ProxyCommandProcess {
  /** The duplex transport handed to ssh2 as `sock`. */
  stream: Duplex
  /** The spawned shell; killing the stream kills it (and its process group). */
  child: ChildProcess
}

/**
 * Start one ProxyCommand and bridge its stdio into a Duplex.
 *
 * Failure modes are reported through the stream: a spawn error, or an exit
 * before the SSH handshake finished, destroys it with the exit status and the
 * tail of the command's stderr instead of letting ssh2 wait for its own
 * `readyTimeout`.
 */
export function startProxyCommand(rawCommand: string, target: ProxyTarget): ProxyCommandProcess {
  const command = expandProxyTokens(rawCommand, target)
  const spec = spawnSpec(command)
  const child = spawn(spec.file, spec.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
    // POSIX only: own process group, so a chained client
    // (`ssh -W %h:%p bastion`) dies with the transport instead of leaking.
    ...(process.platform === 'win32' ? {} : { detached: true }),
  })

  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-MAX_STDERR)
  })

  let killed = false
  const kill = (): void => {
    if (killed) return
    killed = true
    const pid = child.pid
    const group = process.platform !== 'win32' && pid !== undefined
    try {
      if (group) process.kill(-pid, 'SIGTERM')
      else child.kill()
    } catch { /* already gone */ }
    const escalate = setTimeout(() => {
      try {
        if (group) process.kill(-pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch { /* already gone */ }
    }, KILL_GRACE_MS)
    escalate.unref()
  }

  const stream = new Duplex({
    read() {
      child.stdout?.resume()
    },
    write(chunk, _encoding, callback) {
      const stdin = child.stdin
      if (stdin === null || stdin.destroyed) {
        callback(new Error('ProxyCommand stdin is already closed'))
        return
      }
      stdin.write(chunk, callback)
    },
    final(callback) {
      child.stdin?.end(callback)
    },
    destroy(error, callback) {
      kill()
      callback(error)
    },
  })

  // ssh2 attaches its own error handling once it owns the socket; this listener
  // only guarantees an 'error' emitted before that never reaches the host
  // process as an unhandled event.
  stream.on('error', () => { /* surfaced through the ssh2 client */ })

  let failed = false
  const fail = (error: Error): void => {
    if (failed || stream.destroyed) return
    failed = true
    stream.destroy(error)
  }

  // The transport only reports a clean EOF once BOTH the stdout pipe ended and
  // the process exited successfully: a command that dies (bastion client down,
  // typo, refused connection) must surface its own exit status and stderr
  // instead of the generic "connection lost before handshake" ssh2 produces
  // for a socket that simply closed.
  let stdoutEnded = false
  let exited = false
  const finishIfClean = (): void => {
    if (exited && stdoutEnded && !failed && !stream.destroyed) stream.push(null)
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    if (stream.push(chunk) === false) child.stdout?.pause()
  })
  child.stdout?.on('end', () => {
    stdoutEnded = true
    finishIfClean()
  })
  child.stdout?.on('error', (error: Error) => { fail(error) })
  child.on('error', (error: Error) => {
    fail(new Error('ProxyCommand could not start: ' + error.message))
  })
  child.on('exit', (code, signal) => {
    exited = true
    if ((code !== null && code !== 0) || signal !== null) {
      const detail = stderr.trim()
      fail(new Error(
        'ProxyCommand exited (' + (signal !== null ? 'signal ' + signal : 'code ' + String(code ?? 'unknown')) + ')'
        + (detail === '' ? '' : ': ' + detail),
      ))
      return
    }
    finishIfClean()
  })

  return { stream, child }
}
